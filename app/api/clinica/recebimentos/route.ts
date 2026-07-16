import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

interface RecebimentoItem {
  agendamento_id: number
  paciente_id: number
  valor_original: number
  valor_desconto: number
  valor_acrescimo: number
  valor_recebido: number
  total_recebimento: number
  data_recebimento: string
}

interface RecebimentoPayload {
  condicao_pagamento_id: number
  observacao?: string
  nsu?: string | null
  parcelas_cartao?: number | null
  itens: RecebimentoItem[]
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const client = await getDb(session.database_name).connect()

  try {
    const payload: RecebimentoPayload = await req.json()

    if (!payload.condicao_pagamento_id || !payload.itens?.length) {
      return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 })
    }

    const totalGeral = payload.itens.reduce((acc, i) => acc + i.total_recebimento, 0)
    if (totalGeral <= 0) {
      return NextResponse.json({ erro: 'Valor total deve ser maior que zero' }, { status: 400 })
    }

    await client.query('BEGIN')

    for (const item of payload.itens) {
      const { rows } = await client.query(
        'SELECT id FROM tab_agendamento WHERE id = $1 AND empresa_id = $2',
        [item.agendamento_id, session.empresa_id_ativa],
      )
      if (rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ erro: `Agendamento ${item.agendamento_id} não encontrado` }, { status: 404 })
      }
    }

    const { rows: condRows } = await client.query(
      'SELECT tipo_pagamento, conta_banco_pix_id, conta_banco_cartao_id, num_parcelas, intervalo_dias, entrada_pct FROM tab_condicao_pagamento WHERE id = $1',
      [payload.condicao_pagamento_id],
    )
    if (condRows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Condição de pagamento não encontrada' }, { status: 404 })
    }

    const tipoPagamento      = condRows[0].tipo_pagamento
    const contaBancoPixId    = condRows[0].conta_banco_pix_id
    const contaBancoCartaoId = condRows[0].conta_banco_cartao_id
    const numParcelas        = parseInt(condRows[0].num_parcelas) || 1
    const intervaloDias      = parseInt(condRows[0].intervalo_dias) || 30
    const entradaPct         = parseFloat(condRows[0].entrada_pct) || 0

    const isAPrazo  = tipoPagamento === 'a_prazo'
    const isCartao  = tipoPagamento === 'debito' || tipoPagamento === 'credito'

    if (tipoPagamento === 'pix' && !contaBancoPixId) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'PIX sem conta bancária configurada' }, { status: 400 })
    }
    if (isCartao && !contaBancoCartaoId) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Condição de pagamento de cartão sem conta bancária configurada — cadastre a conta em Cadastros → Cond. Pagamento' }, { status: 400 })
    }

    const pacienteId    = payload.itens[0].paciente_id
    const dataMovimento = payload.itens[0].data_recebimento
    const ids           = payload.itens.map(i => i.agendamento_id)
    const docNumero     = ids.length === 1 ? `AG-${ids[0]}` : `AG-${ids[0]}+${ids.length - 1}`

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

    if (isAPrazo) {
      // Cria N títulos independentes, um por parcela — padrão ERP correto.
      // Cada tab_titulo_receber representa uma parcela com seu próprio valor e vencimento.
      const tipo_receita_id = await obterTipoReceitaPadrao(client)
      const obsTexto = `Recebimento de ${ids.length} consulta(s). ${payload.observacao || ''}`.trim()

      const criarTituloParc = async (numTitulo: string, valor: number, dataVenc: string): Promise<number> => {
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
            session.empresa_id_ativa, pacienteId, tipo_receita_id, numTitulo,
            dataMovimento, dataVenc, null,
            valor, 0, 0, 0, 0, 0,
            codTipoCobranca,
            'A', 'CLI', ids[0],
            obsTexto, session.nome ?? 'sistema',
          ],
        )
        return rows[0].id as number
      }

      if (entradaPct > 0 && numParcelas > 1) {
        const valorEntrada = Math.round(totalGeral * (entradaPct / 100) * 100) / 100
        titulo_id = await criarTituloParc(`${docNumero}-1/${numParcelas}`, valorEntrada, dataMovimento)

        const valorRestante = totalGeral - valorEntrada
        const numRestantes  = numParcelas - 1
        const valorParcela  = Math.round((valorRestante / numRestantes) * 100) / 100
        let acumulado = 0
        for (let i = 1; i <= numRestantes; i++) {
          const isUltima = i === numRestantes
          const valor    = isUltima ? Math.round((valorRestante - acumulado) * 100) / 100 : valorParcela
          acumulado += valorParcela
          await criarTituloParc(`${docNumero}-${i + 1}/${numParcelas}`, valor, addDias(dataMovimento, i * intervaloDias))
        }
      } else {
        const valorParcela = Math.round((totalGeral / numParcelas) * 100) / 100
        let acumulado = 0
        for (let i = 1; i <= numParcelas; i++) {
          const isUltima = i === numParcelas
          const valor    = isUltima ? Math.round((totalGeral - acumulado) * 100) / 100 : valorParcela
          acumulado += valorParcela
          const id = await criarTituloParc(`${docNumero}-${i}/${numParcelas}`, valor, addDias(dataMovimento, i * intervaloDias))
          if (i === 1) titulo_id = id
        }
      }
    } else if (isCartao) {
      // Débito/Crédito → gera a venda no cartão (com parcelas previstas via
      // trigger). Nenhum movimento de caixa/banco agora — o dinheiro só vira
      // saldo em conta quando a Fatura de Cartão for confirmada.
      // Débito é sempre 1x. Crédito: numParcelas veio da condição (=máximo
      // permitido) — o operador escolhe quantas parcelas usar até esse limite.
      const qtdParcelasCartao = tipoPagamento === 'credito'
        ? Math.min(Math.max(parseInt(String(payload.parcelas_cartao)) || numParcelas, 1), numParcelas)
        : 1
      try {
        const { rows: vendaRows } = await client.query(
          `INSERT INTO tab_venda_cartao (
            empresa_id, conta_banco_id, condicao_pagamento_id, valor_bruto,
            nsu, data_venda, observacao, created_by, qtd_parcelas
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING id`,
          [
            session.empresa_id_ativa, contaBancoCartaoId, payload.condicao_pagamento_id, totalGeral,
            payload.nsu ? payload.nsu.trim().toUpperCase() : null,
            dataMovimento, `Recebimento - ${ids.length} consulta(s)`, session.nome ?? 'sistema',
            qtdParcelasCartao,
          ],
        )
        venda_cartao_id = vendaRows[0].id
      } catch (err) {
        await client.query('ROLLBACK')
        const message = err instanceof Error ? err.message : 'Erro ao registrar venda no cartão'
        return NextResponse.json({ erro: message }, { status: 400 })
      }
    } else {
      // Pagamento à vista → movimento caixa ou banco (sem título)
      if (tipoPagamento === 'pix') {
        const { rows: movRows } = await client.query(
          `INSERT INTO tab_movimento_banco (
            empresa_id, conta_banco_id, pessoa_id, titulo_receber_id, tipo, valor,
            data_movimento, documento, observacao, conciliado, created_by,
            origem_modulo, origem_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          RETURNING id`,
          [
            session.empresa_id_ativa, contaBancoPixId, pacienteId, null, 'E',
            totalGeral, dataMovimento, `${docNumero}-PIX`,
            `PIX recebido - ${ids.length} consulta(s)`, false, session.nome ?? 'sistema',
            'CLI', ids[0],
          ],
        )
        movimento_banco_id = movRows[0]?.id
      } else {
        const { rows: movRows } = await client.query(
          `INSERT INTO tab_movimento_caixa (
            empresa_id, pessoa_id, titulo_receber_id, tipo, valor,
            data_movimento, documento, observacao, conciliado, created_by,
            origem_modulo, origem_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING id`,
          [
            session.empresa_id_ativa, pacienteId, null, 'E',
            totalGeral, dataMovimento, docNumero,
            `Recebimento - ${ids.length} consulta(s)`, false, session.nome ?? 'sistema',
            'CLI', ids[0],
          ],
        )
        movimento_id = movRows[0]?.id
      }
    }

    // batch_agendamento_id = agendamento raiz do lote (= origem_id nos títulos gerados)
    // Para à vista: é o próprio agendamento (ids[0])
    // Para a prazo: também ids[0], que é o mesmo valor gravado como origem_id nos N títulos
    const batchAgendamentoId = ids[0]

    const statusRecebimento = 'PAGO'
    for (const item of payload.itens) {
      await client.query(
        `INSERT INTO tab_recebimento_consulta (
          empresa_id, agendamento_id, paciente_id, condicao_pagamento_id,
          valor_original, valor_desconto, valor_acrescimo, valor_recebido, total_recebimento,
          batch_agendamento_id, movimento_caixa_id, movimento_banco_id, venda_cartao_id,
          data_recebimento, status_recebimento, observacao, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          session.empresa_id_ativa, item.agendamento_id, item.paciente_id, payload.condicao_pagamento_id,
          item.valor_original, item.valor_desconto, item.valor_acrescimo,
          item.valor_recebido, item.total_recebimento,
          batchAgendamentoId, movimento_id, movimento_banco_id, venda_cartao_id,
          item.data_recebimento, statusRecebimento,
          payload.observacao || null,
          session.nome ?? 'sistema',
        ],
      )
    }

    await client.query(
      `UPDATE tab_agendamento SET status = 'ATENDIDO', updated_at = NOW()
       WHERE id = ANY($1::int[]) AND empresa_id = $2`,
      [ids, session.empresa_id_ativa],
    )

    await client.query('COMMIT')

    return NextResponse.json({
      sucesso: true,
      titulo_receber_id: titulo_id,
      movimento_caixa_id: movimento_id,
      movimento_banco_id,
      venda_cartao_id,
      tipo_pagamento: tipoPagamento,
      total: totalGeral,
      agendamentos: ids.length,
      parcelas: isAPrazo ? numParcelas : null,
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

function addDias(dateStr: string, dias: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + dias)
  return date.toISOString().split('T')[0]
}

async function obterTipoReceitaPadrao(client: any): Promise<number> {
  try {
    const { rows } = await client.query(
      `SELECT id FROM tab_tipo_receita WHERE descricao ILIKE $1 OR descricao ILIKE $2 LIMIT 1`,
      ['%Consul%', '%Serviço%'],
    )
    if (rows.length > 0) return rows[0].id
    const { rows: fallback } = await client.query('SELECT id FROM tab_tipo_receita ORDER BY id ASC LIMIT 1')
    return fallback[0]?.id || 1
  } catch {
    return 1
  }
}
