import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { paraLatin1 } from '@/lib/validators/prontuario.schema'
import { addDias, obterTipoReceitaPadrao } from '@/lib/clinica/recebimento-helpers'

interface ReclassificarPayload {
  recebimento_id: number
  nova_condicao_pagamento_id: number
  motivo: string
  parcelas_cartao?: number | null
}

// POST /api/gerencial/fechamento-diario/reclassificar
// Corrige a forma de pagamento de um atendimento já recebido — estorna o
// recebimento original (mesma lógica de DELETE /api/clinica/recebimentos/[id])
// e recria com a nova condição de pagamento, preservando data e valores originais.
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  if (session.perfil !== 'admin') return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 })

  const payload: ReclassificarPayload = await req.json()
  if (!payload.recebimento_id || !payload.nova_condicao_pagamento_id || !payload.motivo?.trim()) {
    return NextResponse.json({ erro: 'Dados inválidos - recebimento, nova condição e motivo são obrigatórios' }, { status: 400 })
  }

  const empresaId = session.empresa_id_ativa
  const client     = await getDb(session.database_name).connect()

  try {
    // 1. Recebimento original
    const { rows: recRows } = await client.query(
      `SELECT rc.id, rc.agendamento_id, rc.paciente_id, rc.condicao_pagamento_id,
              rc.batch_agendamento_id, rc.movimento_caixa_id, rc.movimento_banco_id, rc.venda_cartao_id,
              rc.valor_original, rc.valor_desconto, rc.valor_acrescimo, rc.valor_recebido, rc.total_recebimento,
              TO_CHAR(rc.data_recebimento, 'YYYY-MM-DD') AS data_recebimento,
              rc.status_recebimento, rc.observacao,
              cpOld.tipo_pagamento AS tipo_pagamento_antigo
       FROM tab_recebimento_consulta rc
         LEFT JOIN tab_condicao_pagamento cpOld ON cpOld.id = rc.condicao_pagamento_id
       WHERE rc.id = $1 AND rc.empresa_id = $2`,
      [payload.recebimento_id, empresaId],
    )
    if (recRows.length === 0) {
      return NextResponse.json({ erro: 'Recebimento não encontrado' }, { status: 404 })
    }
    const rec = recRows[0]
    if (rec.status_recebimento !== 'PAGO') {
      return NextResponse.json({ erro: 'Recebimento não está com status PAGO' }, { status: 400 })
    }
    if (rec.condicao_pagamento_id === payload.nova_condicao_pagamento_id) {
      return NextResponse.json({ erro: 'A nova forma de pagamento é igual à atual' }, { status: 400 })
    }

    const batchAgendamentoId = (rec.batch_agendamento_id ?? rec.agendamento_id) as number

    // 2. Bloqueia lote multi-agendamento — reclassificar 1 de N quebraria a consistência do lote
    const { rows: batchRows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM tab_recebimento_consulta WHERE batch_agendamento_id = $1 AND empresa_id = $2`,
      [batchAgendamentoId, empresaId],
    )
    if (batchRows[0].n > 1) {
      return NextResponse.json({ erro: 'Este atendimento foi recebido em lote com outros agendamentos - estorne o lote completo na tela Recebimentos e refaça' }, { status: 400 })
    }

    // 3. Bloqueia se o dia já estiver fechado
    try {
      const { rows: fechRows } = await client.query(
        `SELECT status FROM tab_fechamento_caixa_diario WHERE empresa_id = $1 AND data = $2`,
        [empresaId, rec.data_recebimento],
      )
      if (fechRows[0]?.status === 'FECHADO') {
        return NextResponse.json({ erro: 'Caixa do dia já está fechado - reabra para corrigir' }, { status: 409 })
      }
    } catch { /* tabela ainda não existe = dia sempre aberto */ }

    // 4. Venda no cartão só pode ser desfeita enquanto nenhuma parcela tiver sido faturada/conciliada
    if (rec.venda_cartao_id) {
      const { rows: parcelasNaoPendentes } = await client.query(
        `SELECT 1 FROM tab_venda_cartao_parcela WHERE venda_cartao_id = $1 AND status <> 'PENDENTE' LIMIT 1`,
        [rec.venda_cartao_id],
      )
      if (parcelasNaoPendentes.length > 0) {
        return NextResponse.json({ erro: 'Este recebimento já tem parcela de cartão faturada/conciliada e não pode mais ser corrigido automaticamente' }, { status: 400 })
      }
    }

    // 5. Nova condição de pagamento
    const { rows: condRows } = await client.query(
      `SELECT tipo_pagamento, conta_banco_pix_id, conta_banco_cartao_id, num_parcelas, intervalo_dias, entrada_pct
       FROM tab_condicao_pagamento WHERE id = $1 AND empresa_id = $2`,
      [payload.nova_condicao_pagamento_id, empresaId],
    )
    if (condRows.length === 0) {
      return NextResponse.json({ erro: 'Condição de pagamento não encontrada' }, { status: 404 })
    }
    const tipoPagamento      = condRows[0].tipo_pagamento
    const contaBancoPixId    = condRows[0].conta_banco_pix_id
    const contaBancoCartaoId = condRows[0].conta_banco_cartao_id
    const numParcelas        = parseInt(condRows[0].num_parcelas) || 1
    const intervaloDias      = parseInt(condRows[0].intervalo_dias) || 30
    const entradaPct         = parseFloat(condRows[0].entrada_pct) || 0

    const isAPrazo = tipoPagamento === 'a_prazo'
    const isCartao = tipoPagamento === 'debito' || tipoPagamento === 'credito'

    if (tipoPagamento === 'pix' && !contaBancoPixId) {
      return NextResponse.json({ erro: 'PIX sem conta bancária configurada' }, { status: 400 })
    }
    if (isCartao && !contaBancoCartaoId) {
      return NextResponse.json({ erro: 'Condição de pagamento de cartão sem conta bancária configurada' }, { status: 400 })
    }

    const totalGeral    = Number(rec.total_recebimento)
    const dataMovimento = rec.data_recebimento as string
    const docNumero     = `AG-${rec.agendamento_id}`

    let codTipoCobranca: number | null = null
    const { rows: pessoaRows } = await client.query('SELECT cod_tipo_cobranca FROM tab_pessoa WHERE id = $1', [rec.paciente_id])
    codTipoCobranca = pessoaRows[0]?.cod_tipo_cobranca ?? null
    if (codTipoCobranca == null) {
      const { rows: empresaRows } = await client.query('SELECT cod_tipo_cobranca FROM tab_empresa WHERE id = $1', [empresaId])
      codTipoCobranca = empresaRows[0]?.cod_tipo_cobranca ?? null
    }

    await client.query('BEGIN')

    // 6. Estorna o recebimento original (mesmos passos do DELETE /api/clinica/recebimentos/[id],
    //    sem reverter tab_agendamento.status — o atendimento aconteceu, só a forma de pagamento muda)
    const { rows: tituloRows } = await client.query(
      `SELECT id, movimento_caixa_id, movimento_banco_id FROM tab_titulo_receber
       WHERE empresa_id = $1 AND origem_modulo = 'CLI' AND origem_id = $2`,
      [empresaId, batchAgendamentoId],
    )
    const tituloIds   = tituloRows.map((r: { id: number }) => r.id)
    const movCaixaIds = tituloRows.map((r: { movimento_caixa_id: number | null }) => r.movimento_caixa_id).filter((x: number | null): x is number => x != null)
    const movBancoIds = tituloRows.map((r: { movimento_banco_id: number | null }) => r.movimento_banco_id).filter((x: number | null): x is number => x != null)

    if (tituloIds.length > 0) {
      await client.query(
        `UPDATE tab_titulo_receber SET movimento_caixa_id = NULL, movimento_banco_id = NULL,
                destino_liquidacao = NULL, conta_banco_liq_id = NULL WHERE id = ANY($1::int[])`,
        [tituloIds],
      )
    }

    await client.query(`DELETE FROM tab_recebimento_consulta WHERE id = $1`, [rec.id])

    const allMovCaixaIds = [...new Set([...movCaixaIds, ...(rec.movimento_caixa_id != null ? [rec.movimento_caixa_id] : [])])]
    const allMovBancoIds = [...new Set([...movBancoIds, ...(rec.movimento_banco_id != null ? [rec.movimento_banco_id] : [])])]
    if (allMovCaixaIds.length > 0) {
      await client.query(`DELETE FROM tab_movimento_caixa WHERE id = ANY($1::int[])`, [allMovCaixaIds])
    }
    if (allMovBancoIds.length > 0) {
      await client.query(`DELETE FROM tab_movimento_banco WHERE id = ANY($1::int[])`, [allMovBancoIds])
    }
    if (tituloIds.length > 0) {
      await client.query(`DELETE FROM tab_movimento_caixa WHERE titulo_receber_id = ANY($1::int[])`, [tituloIds])
      await client.query(`DELETE FROM tab_movimento_banco WHERE titulo_receber_id = ANY($1::int[])`, [tituloIds])
      await client.query(`DELETE FROM tab_titulo_receber WHERE id = ANY($1::int[])`, [tituloIds])
    }
    if (rec.venda_cartao_id) {
      await client.query(`DELETE FROM tab_venda_cartao_parcela WHERE venda_cartao_id = $1`, [rec.venda_cartao_id])
      await client.query(`DELETE FROM tab_venda_cartao WHERE id = $1`, [rec.venda_cartao_id])
    }

    // 7. Recria o recebimento com a nova condição (mesma lógica de POST /api/clinica/recebimentos,
    //    para 1 item só, usando os valores e a data originais)
    let novoTituloId: number | null = null
    let novoMovimentoCaixaId: number | null = null
    let novoMovimentoBancoId: number | null = null
    let novaVendaCartaoId: number | null = null

    if (isAPrazo) {
      const tipoReceitaId = await obterTipoReceitaPadrao(client)
      const obsTexto = `Recebimento (correcao) - 1 consulta(s)`

      const criarTituloParc = async (numTitulo: string, valor: number, dataVenc: string): Promise<number> => {
        const { rows } = await client.query(
          `INSERT INTO tab_titulo_receber (
            empresa_id, pessoa_id, tipo_receita_id, numero_titulo,
            data_emissao, data_vencimento, data_liquidacao,
            valor_original, valor_juros, valor_multa, valor_desconto, valor_retencao, valor_liquidado,
            cod_tipo_cobranca, status, origem_modulo, origem_id, observacao, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          RETURNING id`,
          [
            empresaId, rec.paciente_id, tipoReceitaId, numTitulo,
            dataMovimento, dataVenc, null,
            valor, 0, 0, 0, 0, 0,
            codTipoCobranca, 'A', 'CLI', rec.agendamento_id,
            obsTexto, session.nome ?? 'sistema',
          ],
        )
        return rows[0].id as number
      }

      if (entradaPct > 0 && numParcelas > 1) {
        const valorEntrada = Math.round(totalGeral * (entradaPct / 100) * 100) / 100
        novoTituloId = await criarTituloParc(`${docNumero}-1/${numParcelas}`, valorEntrada, dataMovimento)

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
          if (i === 1) novoTituloId = id
        }
      }
    } else if (isCartao) {
      const qtdParcelasCartao = tipoPagamento === 'credito'
        ? Math.min(Math.max(parseInt(String(payload.parcelas_cartao)) || 1, 1), numParcelas)
        : 1
      const { rows: vendaRows } = await client.query(
        `INSERT INTO tab_venda_cartao (
          empresa_id, conta_banco_id, condicao_pagamento_id, valor_bruto,
          nsu, data_venda, observacao, created_by, qtd_parcelas
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id`,
        [
          empresaId, contaBancoCartaoId, payload.nova_condicao_pagamento_id, totalGeral,
          null, dataMovimento, `Recebimento (correcao) - 1 consulta(s)`, session.nome ?? 'sistema',
          qtdParcelasCartao,
        ],
      )
      novaVendaCartaoId = vendaRows[0].id
    } else if (tipoPagamento === 'pix') {
      const { rows: movRows } = await client.query(
        `INSERT INTO tab_movimento_banco (
          empresa_id, conta_banco_id, pessoa_id, titulo_receber_id, tipo, valor,
          data_movimento, documento, observacao, conciliado, created_by, origem_modulo, origem_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING id`,
        [
          empresaId, contaBancoPixId, rec.paciente_id, null, 'E',
          totalGeral, dataMovimento, `${docNumero}-PIX`,
          `PIX recebido (correcao) - 1 consulta(s)`, false, session.nome ?? 'sistema',
          'CLI', rec.agendamento_id,
        ],
      )
      novoMovimentoBancoId = movRows[0]?.id
    } else {
      const { rows: movRows } = await client.query(
        `INSERT INTO tab_movimento_caixa (
          empresa_id, pessoa_id, titulo_receber_id, tipo, valor,
          data_movimento, documento, observacao, conciliado, created_by, origem_modulo, origem_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING id`,
        [
          empresaId, rec.paciente_id, null, 'E',
          totalGeral, dataMovimento, docNumero,
          `Recebimento (correcao) - 1 consulta(s)`, false, session.nome ?? 'sistema',
          'CLI', rec.agendamento_id,
        ],
      )
      novoMovimentoCaixaId = movRows[0]?.id
    }

    const { rows: novoRecRows } = await client.query(
      `INSERT INTO tab_recebimento_consulta (
        empresa_id, agendamento_id, paciente_id, condicao_pagamento_id,
        valor_original, valor_desconto, valor_acrescimo, valor_recebido, total_recebimento,
        batch_agendamento_id, movimento_caixa_id, movimento_banco_id, venda_cartao_id,
        data_recebimento, status_recebimento, observacao, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING id`,
      [
        empresaId, rec.agendamento_id, rec.paciente_id, payload.nova_condicao_pagamento_id,
        rec.valor_original, rec.valor_desconto, rec.valor_acrescimo, rec.valor_recebido, rec.total_recebimento,
        rec.agendamento_id, novoMovimentoCaixaId, novoMovimentoBancoId, novaVendaCartaoId,
        dataMovimento, 'PAGO', rec.observacao ?? null, session.nome ?? 'sistema',
      ],
    )
    const recebimentoIdNovo = novoRecRows[0].id

    // 8. Auditoria
    await client.query(
      `INSERT INTO tab_reclassificacao_recebimento (
        empresa_id, data_original, agendamento_id, recebimento_id_novo,
        condicao_id_antiga, condicao_id_nova, tipo_pgto_antigo, tipo_pgto_novo,
        valor, motivo, reclassificado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        empresaId, dataMovimento, rec.agendamento_id, recebimentoIdNovo,
        rec.condicao_pagamento_id, payload.nova_condicao_pagamento_id,
        rec.tipo_pagamento_antigo, tipoPagamento,
        totalGeral, paraLatin1(payload.motivo.trim()), session.nome ?? 'sistema',
      ],
    )

    await client.query('COMMIT')

    return NextResponse.json({
      sucesso: true,
      recebimento_id_novo: recebimentoIdNovo,
      tipo_pagamento_novo: tipoPagamento,
      titulo_receber_id: novoTituloId,
    })
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* já finalizada */ }
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Erro ao reclassificar recebimento:', errorMessage)
    return NextResponse.json({ erro: 'Erro ao corrigir forma de pagamento', detalhes: errorMessage }, { status: 500 })
  } finally {
    client.release()
  }
}
