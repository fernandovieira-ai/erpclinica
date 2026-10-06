import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { addDias, obterTipoReceitaPadrao } from '@/lib/clinica/recebimento-helpers'
import { regraRepasse, dividirRepasse } from '@/lib/clinica/repasse'

interface RecebimentoItem {
  agendamento_id: number
  paciente_id: number
  valor_original: number
  valor_desconto: number
  valor_acrescimo: number
  valor_recebido: number
  total_recebimento: number
  data_recebimento: string
  medico_solicitante_id?: number | null
  medico_executor_id?: number | null
}

interface FormaPagamentoInput {
  condicao_pagamento_id: number
  valor: number
  nsu?: string | null
  parcelas_cartao?: number | null
}

interface RecebimentoPayload {
  observacao?: string
  itens: RecebimentoItem[]
  formas_pagamento: FormaPagamentoInput[]
}

interface CondicaoInfo {
  id: number
  tipo: string
  tipo_pagamento: string
  conta_banco_pix_id: number | null
  conta_banco_cartao_id: number | null
  num_parcelas: number
  intervalo_dias: number
  entrada_pct: number
}

interface InstrumentoResultado {
  tituloId: number | null
  movimentoId: number | null
  movimentoBancoId: number | null
  vendaCartaoId: number | null
  // Só preenchido quando isCartao (crédito): o qtd_parcelas REAL gravado em tab_venda_cartao
  // (já limitado por condicao.num_parcelas) — não o valor bruto que o cliente mandou.
  qtdParcelasCartao: number | null
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

// Cria o instrumento financeiro de UMA forma de pagamento (título a prazo, venda de
// cartão ou movimento de caixa/banco) pelo valor dessa forma. Um recebimento de forma
// única (caso comum) chama isso uma única vez — comportamento idêntico ao de antes do
// pagamento misto. Um recebimento dividido (ex.: dinheiro + cartão) chama uma vez por forma.
async function criarInstrumentoPagamento(
  client: Queryable,
  params: {
    empresaId: number
    pacienteId: number
    dataMovimento: string
    docNumero: string
    observacaoLote: string
    ids: number[]
    condicao: CondicaoInfo
    valor: number
    nsu?: string | null
    parcelasCartao?: number | null
    codTipoCobranca: number | null
    createdBy: string
    obterTipoReceitaId: () => Promise<number>
  },
): Promise<InstrumentoResultado> {
  const { condicao, valor } = params
  const isAPrazo = condicao.tipo_pagamento === 'a_prazo'
  const isCartao = condicao.tipo_pagamento === 'debito' || condicao.tipo_pagamento === 'credito'
  const resultado: InstrumentoResultado = { tituloId: null, movimentoId: null, movimentoBancoId: null, vendaCartaoId: null, qtdParcelasCartao: null }

  if (isAPrazo) {
    // Cria N títulos independentes, um por parcela — padrão ERP correto.
    // Cada tab_titulo_receber representa uma parcela com seu próprio valor e vencimento.
    const tipo_receita_id = await params.obterTipoReceitaId()
    const obsTexto = `Recebimento de ${params.ids.length} consulta(s). ${params.observacaoLote}`.trim()
    const { num_parcelas: numParcelas, intervalo_dias: intervaloDias, entrada_pct: entradaPct } = condicao

    const criarTituloParc = async (numTitulo: string, valorParc: number, dataVenc: string): Promise<number> => {
      const { rows } = await client.query(
        `INSERT INTO tab_titulo_receber (
          empresa_id, pessoa_id, tipo_receita_id, numero_titulo,
          data_emissao, data_vencimento, data_liquidacao,
          valor_original, valor_juros, valor_multa, valor_desconto, valor_retencao, valor_liquidado,
          cod_tipo_cobranca,
          status, origem_modulo, origem_id, observacao, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING id`,
        [
          params.empresaId, params.pacienteId, tipo_receita_id, numTitulo,
          params.dataMovimento, dataVenc, null,
          valorParc, 0, 0, 0, 0, 0,
          params.codTipoCobranca,
          'A', 'CLI', params.ids[0],
          obsTexto, params.createdBy,
        ],
      )
      return rows[0].id as number
    }

    if (entradaPct > 0 && numParcelas > 1) {
      const valorEntrada = Math.round(valor * (entradaPct / 100) * 100) / 100
      resultado.tituloId = await criarTituloParc(`${params.docNumero}-1/${numParcelas}`, valorEntrada, params.dataMovimento)

      const valorRestante = valor - valorEntrada
      const numRestantes  = numParcelas - 1
      const valorParcela  = Math.round((valorRestante / numRestantes) * 100) / 100
      let acumulado = 0
      for (let i = 1; i <= numRestantes; i++) {
        const isUltima = i === numRestantes
        const valorParc = isUltima ? Math.round((valorRestante - acumulado) * 100) / 100 : valorParcela
        acumulado += valorParcela
        await criarTituloParc(`${params.docNumero}-${i + 1}/${numParcelas}`, valorParc, addDias(params.dataMovimento, i * intervaloDias))
      }
    } else {
      const valorParcela = Math.round((valor / numParcelas) * 100) / 100
      let acumulado = 0
      for (let i = 1; i <= numParcelas; i++) {
        const isUltima = i === numParcelas
        const valorParc = isUltima ? Math.round((valor - acumulado) * 100) / 100 : valorParcela
        acumulado += valorParcela
        const id = await criarTituloParc(`${params.docNumero}-${i}/${numParcelas}`, valorParc, addDias(params.dataMovimento, i * intervaloDias))
        if (i === 1) resultado.tituloId = id
      }
    }
  } else if (isCartao) {
    // Débito/Crédito → gera a venda no cartão (com parcelas previstas via
    // trigger). Nenhum movimento de caixa/banco agora — o dinheiro só vira
    // saldo em conta quando a Fatura de Cartão for confirmada.
    // Débito é sempre 1x. Crédito: numParcelas veio da condição (=máximo
    // permitido) — o operador escolhe quantas parcelas usar até esse limite.
    const qtdParcelasCartao = condicao.tipo_pagamento === 'credito'
      ? Math.min(Math.max(parseInt(String(params.parcelasCartao)) || condicao.num_parcelas, 1), condicao.num_parcelas)
      : 1
    const { rows: vendaRows } = await client.query(
      `INSERT INTO tab_venda_cartao (
        empresa_id, conta_banco_id, condicao_pagamento_id, valor_bruto,
        nsu, data_venda, observacao, created_by, qtd_parcelas
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id`,
      [
        params.empresaId, condicao.conta_banco_cartao_id, condicao.id, valor,
        params.nsu ? params.nsu.trim().toUpperCase() : null,
        params.dataMovimento, `Recebimento - ${params.ids.length} consulta(s)`, params.createdBy,
        qtdParcelasCartao,
      ],
    )
    resultado.vendaCartaoId = vendaRows[0].id
    resultado.qtdParcelasCartao = qtdParcelasCartao
  } else if (condicao.tipo_pagamento === 'pix') {
    const { rows: movRows } = await client.query(
      `INSERT INTO tab_movimento_banco (
        empresa_id, conta_banco_id, pessoa_id, titulo_receber_id, tipo, valor,
        data_movimento, documento, observacao, conciliado, created_by,
        origem_modulo, origem_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id`,
      [
        params.empresaId, condicao.conta_banco_pix_id, params.pacienteId, null, 'E',
        valor, params.dataMovimento, `${params.docNumero}-PIX`,
        `PIX recebido - ${params.ids.length} consulta(s)`, false, params.createdBy,
        'CLI', params.ids[0],
      ],
    )
    resultado.movimentoBancoId = movRows[0]?.id
  } else {
    // Pagamento em dinheiro → movimento de caixa (sem título)
    const { rows: movRows } = await client.query(
      `INSERT INTO tab_movimento_caixa (
        empresa_id, pessoa_id, titulo_receber_id, tipo, valor,
        data_movimento, documento, observacao, conciliado, created_by,
        origem_modulo, origem_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id`,
      [
        params.empresaId, params.pacienteId, null, 'E',
        valor, params.dataMovimento, params.docNumero,
        `Recebimento - ${params.ids.length} consulta(s)`, false, params.createdBy,
        'CLI', params.ids[0],
      ],
    )
    resultado.movimentoId = movRows[0]?.id
  }

  return resultado
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const client = await getDb(session.database_name).connect()

  try {
    const payload: RecebimentoPayload = await req.json()

    if (!payload.itens?.length || !payload.formas_pagamento?.length) {
      return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 })
    }

    // Trava anti-erro de digitação: nenhum valor de recebimento é aceito sem bater com
    // a soma valor_original - desconto + acréscimo, e valor_original precisa bater com o
    // preço cadastrado pro tipo/categoria do agendamento — ver seção "Trava de valor no
    // recebimento" em padroes.md. Tolerância de 2 centavos absorve arredondamento de rateio
    // proporcional entre múltiplos agendamentos e/ou múltiplas formas de pagamento no mesmo recebimento.
    const TOLERANCIA_CENTAVOS = 0.02
    const round2 = (v: number) => Math.round(v * 100) / 100

    for (const forma of payload.formas_pagamento) {
      if (!forma.condicao_pagamento_id) {
        return NextResponse.json({ erro: 'Selecione a condição de pagamento em todas as formas' }, { status: 400 })
      }
      if (typeof forma.valor !== 'number' || !Number.isFinite(forma.valor) || forma.valor <= 0) {
        return NextResponse.json({ erro: 'Valor inválido em uma das formas de pagamento' }, { status: 400 })
      }
    }

    for (const item of payload.itens) {
      const campos = [item.valor_original, item.valor_desconto, item.valor_acrescimo, item.valor_recebido, item.total_recebimento]
      if (campos.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        return NextResponse.json({ erro: `Valores inválidos no agendamento ${item.agendamento_id}` }, { status: 400 })
      }
      if (item.valor_desconto < 0 || item.valor_acrescimo < 0) {
        return NextResponse.json({ erro: 'Desconto e acréscimo não podem ser negativos' }, { status: 400 })
      }
      if (item.total_recebimento < 0) {
        return NextResponse.json({ erro: `Valor a receber não pode ser negativo no agendamento ${item.agendamento_id}` }, { status: 400 })
      }
      // <= 0 (não só < 0): um item com valor de consulta > 0 não pode zerar via desconto — fecha o
      // caso de um item pequeno num lote com vários agendamentos arredondar pra R$0,00 e ainda assim
      // ser gravado como PAGO. Item cujo próprio valor de tabela já é 0 (tipo sem preço — ex.: RETORNO
      // sem cobrança) continua ok, é o caso normal de "recebimento" só pra fazer check-in.
      if (item.total_recebimento <= 0 && item.valor_original > 0) {
        return NextResponse.json({ erro: `Desconto maior ou igual ao valor da consulta no agendamento ${item.agendamento_id}` }, { status: 400 })
      }
      if (item.valor_recebido !== item.total_recebimento) {
        return NextResponse.json({ erro: `valor_recebido e total_recebimento precisam ser iguais no agendamento ${item.agendamento_id}` }, { status: 400 })
      }
      const totalEsperado = round2(item.valor_original - item.valor_desconto + item.valor_acrescimo)
      if (Math.abs(totalEsperado - item.total_recebimento) > TOLERANCIA_CENTAVOS) {
        return NextResponse.json({
          erro: `Valores não conferem no agendamento ${item.agendamento_id}: `
            + `${item.valor_original.toFixed(2)} (original) - ${item.valor_desconto.toFixed(2)} (desconto) `
            + `+ ${item.valor_acrescimo.toFixed(2)} (acréscimo) = ${totalEsperado.toFixed(2)}, `
            + `mas foi enviado ${item.total_recebimento.toFixed(2)}`,
        }, { status: 400 })
      }
    }

    // totalGeral === 0 é válido (ex.: RETORNO sem cobrança, valor_original = 0 em todos os
    // itens) — só bloqueia negativo. Ver padroes.md "Recebimento sem valor (RETORNO gratuito)".
    const totalGeral = payload.itens.reduce((acc, i) => acc + i.total_recebimento, 0)
    if (totalGeral < 0) {
      return NextResponse.json({ erro: 'Valor total não pode ser negativo' }, { status: 400 })
    }

    if (totalGeral === 0) {
      // Nada a dividir quando não há valor a cobrar — exige exatamente 1 forma (ver
      // trava de cartão/a_prazo logo abaixo, depois de resolver a condição).
      if (payload.formas_pagamento.length !== 1) {
        return NextResponse.json({ erro: 'Atendimento sem valor a cobrar (R$ 0,00) — selecione apenas uma condição de pagamento' }, { status: 400 })
      }
    } else {
      const somaFormas = round2(payload.formas_pagamento.reduce((acc, f) => acc + f.valor, 0))
      if (Math.abs(somaFormas - totalGeral) > TOLERANCIA_CENTAVOS) {
        return NextResponse.json({
          erro: `Soma das formas de pagamento (${somaFormas.toFixed(2)}) não bate com o total a receber (${totalGeral.toFixed(2)})`,
        }, { status: 400 })
      }
    }

    await client.query('BEGIN')

    const condicaoIds = [...new Set(payload.formas_pagamento.map(f => f.condicao_pagamento_id))]
    const { rows: condRows } = await client.query(
      `SELECT id, tipo, tipo_pagamento, conta_banco_pix_id, conta_banco_cartao_id, num_parcelas, intervalo_dias, entrada_pct
       FROM tab_condicao_pagamento WHERE id = ANY($1::int[]) AND empresa_id = $2`,
      [condicaoIds, session.empresa_id_ativa],
    )
    const condicaoMap = new Map<number, CondicaoInfo>(condRows.map((r: any) => [r.id as number, {
      id: r.id,
      tipo: r.tipo,
      tipo_pagamento: r.tipo_pagamento,
      conta_banco_pix_id: r.conta_banco_pix_id,
      conta_banco_cartao_id: r.conta_banco_cartao_id,
      num_parcelas: parseInt(r.num_parcelas) || 1,
      intervalo_dias: parseInt(r.intervalo_dias) || 30,
      entrada_pct: parseFloat(r.entrada_pct) || 0,
    }]))
    for (const id of condicaoIds) {
      if (!condicaoMap.has(id)) {
        await client.query('ROLLBACK')
        return NextResponse.json({ erro: 'Condição de pagamento não encontrada' }, { status: 404 })
      }
    }

    for (const condicao of condicaoMap.values()) {
      const isCartaoCond = condicao.tipo_pagamento === 'debito' || condicao.tipo_pagamento === 'credito'
      if (condicao.tipo_pagamento === 'pix' && !condicao.conta_banco_pix_id) {
        await client.query('ROLLBACK')
        return NextResponse.json({ erro: 'PIX sem conta bancária configurada' }, { status: 400 })
      }
      if (isCartaoCond && !condicao.conta_banco_cartao_id) {
        await client.query('ROLLBACK')
        return NextResponse.json({ erro: 'Condição de pagamento de cartão sem conta bancária configurada — cadastre a conta em Cadastros → Cond. Pagamento' }, { status: 400 })
      }
    }

    // Não faz sentido dois acordos de "fiado" separados no mesmo recebimento.
    const qtdAPrazo = payload.formas_pagamento.filter(f => condicaoMap.get(f.condicao_pagamento_id)?.tipo_pagamento === 'a_prazo').length
    if (qtdAPrazo > 1) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Só é permitida uma forma de pagamento a prazo por recebimento' }, { status: 400 })
    }

    // Valor zero (ex.: RETORNO sem cobrança) não pode virar título a prazo nem venda de
    // cartão — ficariam abertos/pendentes sem nenhum valor real a liquidar. Pra esse caso
    // a condição de pagamento precisa ser à vista (dinheiro/PIX), que só gera o movimento
    // e já fecha o "recebimento" (check-in) na hora.
    if (totalGeral === 0) {
      const condicaoUnica = condicaoMap.get(payload.formas_pagamento[0].condicao_pagamento_id)!
      const ehCartaoOuPrazo = condicaoUnica.tipo_pagamento === 'debito' || condicaoUnica.tipo_pagamento === 'credito' || condicaoUnica.tipo_pagamento === 'a_prazo'
      if (ehCartaoOuPrazo) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          erro: 'Atendimento sem valor a cobrar (R$ 0,00) — selecione uma condição à vista em dinheiro ou PIX para confirmar',
        }, { status: 400 })
      }
    }

    // Preço de tabela (à vista x a prazo) segue a condição da PRIMEIRA forma de pagamento
    // (tab_condicao_pagamento.tipo 'V'/'P' — parcelado, não tipo_pagamento). É o mesmo campo
    // que RecebimentoModal.getValorBase() usa no front pra decidir o preço antes do split —
    // as duas colunas (tipo/tipo_pagamento) são independentes (ex.: crédito parcelado tem
    // tipo_pagamento='credito' e tipo='P'), usar tipo_pagamento aqui gera falso-positivo na
    // trava de preço.
    const condicaoReferencia = condicaoMap.get(payload.formas_pagamento[0].condicao_pagamento_id)!
    const isParcelado = condicaoReferencia.tipo === 'P'

    // agendamento_id -> { medico_solicitante_id, medico_executor_id } dos itens que
    // precisam definir solicitante/executor antes de confirmar (profissional_id atual = placeholder da clínica)
    const definicoesExecutor = new Map<number, { medico_solicitante_id: number; medico_executor_id: number }>()
    // agendamento_id -> { tipo_id, profissional_id } — usado pra calcular o repasse
    const infoAgendamento = new Map<number, { tipo_id: number | null; profissional_id: number }>()

    for (const item of payload.itens) {
      const { rows } = await client.query(
        `SELECT ag.id, ag.tipo_id, ag.profissional_id, pro.eh_clinica AS profissional_eh_clinica,
                COALESCE(atc.valor, tp.valor) AS tipo_valor, atc.valor_prazo AS tipo_valor_prazo
         FROM tab_agendamento ag
           JOIN tab_pessoa pro ON pro.id = ag.profissional_id
           LEFT JOIN tab_agendamento_tipo tp ON tp.id = ag.tipo_id
           LEFT JOIN tab_agendamento_tipo_categoria atc ON atc.tipo_id = ag.tipo_id AND atc.categoria_id = ag.categoria_id
         WHERE ag.id = $1 AND ag.empresa_id = $2`,
        [item.agendamento_id, session.empresa_id_ativa],
      )
      if (rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ erro: `Agendamento ${item.agendamento_id} não encontrado` }, { status: 404 })
      }

      const valorTabela = isParcelado && rows[0].tipo_valor_prazo != null
        ? Number(rows[0].tipo_valor_prazo)
        : Number(rows[0].tipo_valor) || 0
      if (valorTabela > 0 && Math.abs(item.valor_original - valorTabela) > TOLERANCIA_CENTAVOS) {
        await client.query('ROLLBACK')
        return NextResponse.json({
          erro: `Valor da consulta do agendamento ${item.agendamento_id} mudou desde que a tela foi aberta `
            + `(tabela: ${valorTabela.toFixed(2)}, enviado: ${item.valor_original.toFixed(2)}). Atualize a página e tente novamente.`,
        }, { status: 409 })
      }

      infoAgendamento.set(item.agendamento_id, {
        tipo_id: rows[0].tipo_id ?? null,
        profissional_id: rows[0].profissional_id,
      })

      if (rows[0].profissional_eh_clinica) {
        if (!item.medico_solicitante_id || !item.medico_executor_id) {
          await client.query('ROLLBACK')
          return NextResponse.json(
            { erro: `Agendamento ${item.agendamento_id}: informe o médico solicitante e o médico executor antes de confirmar o recebimento` },
            { status: 400 },
          )
        }
        definicoesExecutor.set(item.agendamento_id, {
          medico_solicitante_id: item.medico_solicitante_id,
          medico_executor_id: item.medico_executor_id,
        })
      }
    }

    const pacienteId    = payload.itens[0].paciente_id
    const dataMovimento = payload.itens[0].data_recebimento
    const ids           = payload.itens.map(i => i.agendamento_id)
    const docNumeroBase = ids.length === 1 ? `AG-${ids[0]}` : `AG-${ids[0]}+${ids.length - 1}`

    // cod_tipo_cobranca: prioridade paciente → empresa
    const { rows: pessoaRows } = await client.query(
      'SELECT cod_tipo_cobranca FROM tab_pessoa WHERE id = $1',
      [pacienteId],
    )
    let codTipoCobranca: number | null = pessoaRows[0]?.cod_tipo_cobranca ?? null
    if (codTipoCobranca == null) {
      const { rows: empresaRows } = await client.query(
        'SELECT cod_tipo_cobranca FROM tab_empresa WHERE id = $1',
        [session.empresa_id_ativa],
      )
      codTipoCobranca = empresaRows[0]?.cod_tipo_cobranca ?? null
    }

    let titulo_id: number | null = null
    let movimento_id: number | null = null
    let movimento_banco_id: number | null = null
    let venda_cartao_id: number | null = null

    let tipoReceitaIdCache: number | null = null
    const obterTipoReceitaId = async () => {
      if (tipoReceitaIdCache == null) tipoReceitaIdCache = await obterTipoReceitaPadrao(client)
      return tipoReceitaIdCache
    }

    // totalGeral === 0 (ex.: RETORNO sem cobrança) não cria NENHUM instrumento financeiro —
    // tab_movimento_caixa, tab_movimento_banco e tab_titulo_receber têm CHECK (valor > 0) no
    // banco (padrão EMSys3: não existe "movimento" de R$0,00). O recebimento aqui serve só
    // pra fazer o check-in do agendamento; titulo_id/movimento_id/etc ficam null e nenhuma
    // linha é criada em tab_recebimento_pagamento (nada foi de fato recebido).
    if (totalGeral > 0) {
      const multiplasFormas = payload.formas_pagamento.length > 1
      for (let idx = 0; idx < payload.formas_pagamento.length; idx++) {
        const forma    = payload.formas_pagamento[idx]
        const condicao = condicaoMap.get(forma.condicao_pagamento_id)!
        // Sufixo só quando há split — um recebimento de forma única mantém a numeração de hoje.
        const docNumero = multiplasFormas ? `${docNumeroBase}-F${idx + 1}` : docNumeroBase

        let resultado: InstrumentoResultado
        try {
          resultado = await criarInstrumentoPagamento(client, {
            empresaId: session.empresa_id_ativa,
            pacienteId,
            dataMovimento,
            docNumero,
            observacaoLote: payload.observacao || '',
            ids,
            condicao,
            valor: forma.valor,
            nsu: forma.nsu,
            parcelasCartao: forma.parcelas_cartao,
            codTipoCobranca,
            createdBy: session.nome ?? 'sistema',
            obterTipoReceitaId,
          })
        } catch (err) {
          await client.query('ROLLBACK')
          const message = err instanceof Error ? err.message : 'Erro ao registrar forma de pagamento'
          return NextResponse.json({ erro: message }, { status: 400 })
        }

        // Primeira forma do lote = valor "representativo" legado em tab_recebimento_consulta,
        // usado só pelas telas que ainda leem 1 instrumento por recebimento (ver padroes.md).
        if (idx === 0) {
          titulo_id          = resultado.tituloId
          movimento_id       = resultado.movimentoId
          movimento_banco_id = resultado.movimentoBancoId
          venda_cartao_id    = resultado.vendaCartaoId
        }

        await client.query(
          `INSERT INTO tab_recebimento_pagamento (
            empresa_id, batch_agendamento_id, condicao_pagamento_id, valor,
            movimento_caixa_id, movimento_banco_id, venda_cartao_id, nsu, parcelas_cartao
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            session.empresa_id_ativa, ids[0], forma.condicao_pagamento_id, forma.valor,
            resultado.movimentoId, resultado.movimentoBancoId, resultado.vendaCartaoId,
            forma.nsu ? forma.nsu.trim().toUpperCase() : null, resultado.qtdParcelasCartao,
          ],
        )
      }
    }

    // batch_agendamento_id = agendamento raiz do lote (= origem_id nos títulos gerados e
    // batch_agendamento_id em tab_recebimento_pagamento)
    // Para à vista: é o próprio agendamento (ids[0])
    // Para a prazo: também ids[0], que é o mesmo valor gravado como origem_id nos N títulos
    const batchAgendamentoId = ids[0]
    const condicaoLegado = payload.formas_pagamento[0].condicao_pagamento_id

    const statusRecebimento = 'PAGO'
    for (const item of payload.itens) {
      const info = infoAgendamento.get(item.agendamento_id)
      // Exame com placeholder da clínica: quem recebe o repasse é o executor definido agora.
      const profissionalRepasse = definicoesExecutor.get(item.agendamento_id)?.medico_executor_id
        ?? info?.profissional_id
        ?? null
      const regra = await regraRepasse(client, profissionalRepasse, info?.tipo_id ?? null)
      const pct = regra.percentual
      const { valor_profissional, valor_clinica } = dividirRepasse(item.total_recebimento, regra)

      await client.query(
        `INSERT INTO tab_recebimento_consulta (
          empresa_id, agendamento_id, paciente_id, condicao_pagamento_id,
          valor_original, valor_desconto, valor_acrescimo, valor_recebido, total_recebimento,
          batch_agendamento_id, movimento_caixa_id, movimento_banco_id, venda_cartao_id,
          data_recebimento, status_recebimento, observacao, created_by,
          percentual_profissional, valor_profissional, valor_clinica
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          session.empresa_id_ativa, item.agendamento_id, item.paciente_id, condicaoLegado,
          item.valor_original, item.valor_desconto, item.valor_acrescimo,
          item.valor_recebido, item.total_recebimento,
          batchAgendamentoId, movimento_id, movimento_banco_id, venda_cartao_id,
          item.data_recebimento, statusRecebimento,
          payload.observacao || null,
          session.nome ?? 'sistema',
          pct, valor_profissional, valor_clinica,
        ],
      )
    }

    // O pagamento e feito ANTES do atendimento (recepcao): o recebimento faz o check-in.
    // AGENDADO/CONFIRMADO -> AGUARDANDO (entra na sala de espera). Se ja esta AGUARDANDO
    // ou ATENDIDO (pagamento na saida), mantem. CANCELADO/FALTOU nunca muda.
    // Quem marca ATENDIDO e o "Finalizar atendimento" (medico), nao o recebimento.
    await client.query(
      `UPDATE tab_agendamento
       SET status = CASE WHEN status IN ('AGENDADO','CONFIRMADO') THEN 'AGUARDANDO' ELSE status END,
           horario_chegada = COALESCE(horario_chegada, NOW()),
           updated_at = NOW()
       WHERE id = ANY($1::int[]) AND empresa_id = $2
         AND status NOT IN ('CANCELADO','FALTOU')`,
      [ids, session.empresa_id_ativa],
    )

    // Exames marcados com o placeholder da clínica: grava o solicitante e substitui
    // profissional_id pelo executor agora que ambos são conhecidos.
    for (const [agendamentoId, def] of definicoesExecutor) {
      await client.query(
        `UPDATE tab_agendamento
         SET medico_solicitante_id = $1, profissional_id = $2, updated_at = NOW()
         WHERE id = $3 AND empresa_id = $4`,
        [def.medico_solicitante_id, def.medico_executor_id, agendamentoId, session.empresa_id_ativa],
      )
    }

    await client.query('COMMIT')

    return NextResponse.json({
      sucesso: true,
      titulo_receber_id: titulo_id,
      movimento_caixa_id: movimento_id,
      movimento_banco_id,
      venda_cartao_id,
      tipo_pagamento: condicaoReferencia.tipo_pagamento,
      formas_pagamento: payload.formas_pagamento.length,
      total: totalGeral,
      agendamentos: ids.length,
    })
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* já finalizada */ }
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Erro ao processar recebimento:', errorMessage, error)
    return NextResponse.json({ erro: 'Erro ao processar recebimento', detalhes: errorMessage }, { status: 500 })
  } finally {
    client.release()
  }
}
