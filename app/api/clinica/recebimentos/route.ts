import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

interface RecebimentoPayload {
  agendamento_id: number
  paciente_id: number
  condicao_pagamento_id: number
  valor_original: number
  valor_desconto: number
  valor_acrescimo: number
  valor_recebido: number
  total_recebimento: number
  data_recebimento: string
  observacao?: string
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const client = await getDb(session.database_name).connect()

  try {
    const payload: RecebimentoPayload = await req.json()

    if (!payload.agendamento_id || !payload.paciente_id || !payload.condicao_pagamento_id || payload.valor_recebido <= 0) {
      return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 })
    }

    await client.query('BEGIN')

    // Verificar se agendamento existe
    const { rows: agendamentos } = await client.query(
      'SELECT id FROM tab_agendamento WHERE id = $1 AND empresa_id = $2',
      [payload.agendamento_id, session.empresa_id_ativa],
    )

    if (agendamentos.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Agendamento não encontrado' }, { status: 404 })
    }

    // Obter tipo, tipo_pagamento e conta PIX da condição
    const { rows: condRows } = await client.query(
      'SELECT tipo, tipo_pagamento, conta_banco_pix_id FROM tab_condicao_pagamento WHERE id = $1',
      [payload.condicao_pagamento_id],
    )

    if (condRows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Condição de pagamento não encontrada' }, { status: 404 })
    }

    const tipoCondicao = condRows[0].tipo  // 'V' = À Vista, 'P' = Parcelado
    const tipoPagamento = condRows[0].tipo_pagamento  // 'dinheiro', 'pix', 'debito', 'credito'
    const contaBancoPixId = condRows[0].conta_banco_pix_id

    // Validar PIX
    if (tipoPagamento === 'pix' && !contaBancoPixId) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'PIX sem conta bancária configurada' }, { status: 400 })
    }

    // Determinar se deve criar título a receber (apenas para parcelado ou crédito)
    const deveCriarTitulo = tipoCondicao === 'P' || tipoPagamento === 'credito'

    // Atualizar status do agendamento para ATENDIDO
    await client.query(
      'UPDATE tab_agendamento SET status = $1, updated_at = NOW() WHERE id = $2',
      ['ATENDIDO', payload.agendamento_id],
    )

    let titulo_id: number | null = null
    let movimento_id: number | null = null
    let movimento_banco_id: number | null = null

    if (deveCriarTitulo) {
      // Criar título apenas para parcelado ou crédito
      const tipo_receita_id = await obterTipoReceitaPadrao(client)
      const numeroTitulo = `AG-${payload.agendamento_id}-${Date.now().toString().slice(-6)}`

      const { rows: tituloRows } = await client.query(
        `INSERT INTO tab_titulo_receber (
          empresa_id, pessoa_id, tipo_receita_id, numero_titulo,
          data_emissao, data_vencimento, data_liquidacao,
          valor_original, valor_juros, valor_multa, valor_desconto, valor_retencao, valor_liquidado,
          status, origem_modulo, origem_id, observacao, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id`,
        [
          session.empresa_id_ativa, payload.paciente_id, tipo_receita_id, numeroTitulo,
          payload.data_recebimento, payload.data_recebimento, payload.data_recebimento,
          payload.valor_original, payload.valor_acrescimo > 0 ? payload.valor_acrescimo : 0, 0, payload.valor_desconto, 0, payload.total_recebimento,
          'L', 'CLI', payload.agendamento_id, `Recebimento de consulta. ${payload.observacao || ''}`, session.nome ?? 'sistema',
        ],
      )
      titulo_id = tituloRows[0]?.id
    } else {
      // À vista: criar movimento direto sem título a receber
      if (tipoPagamento === 'pix') {
        const { rows: movBancoRows } = await client.query(
          `INSERT INTO tab_movimento_banco (
            empresa_id, conta_banco_id, pessoa_id, tipo, valor,
            data_movimento, documento, observacao, conciliado, created_by,
            origem_modulo, origem_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id`,
          [
            session.empresa_id_ativa, contaBancoPixId, payload.paciente_id, 'E',
            payload.total_recebimento, payload.data_recebimento, `AG-${payload.agendamento_id}-PIX`,
            `PIX recebido da consulta`, false, session.nome ?? 'sistema',
            'CLI', payload.agendamento_id,
          ],
        )
        movimento_banco_id = movBancoRows[0]?.id
      } else {
        // Dinheiro, débito, etc: criar movimento em caixa
        const { rows: movCaixaRows } = await client.query(
          `INSERT INTO tab_movimento_caixa (
            empresa_id, pessoa_id, tipo, valor,
            data_movimento, documento, observacao, conciliado, created_by,
            origem_modulo, origem_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id`,
          [
            session.empresa_id_ativa, payload.paciente_id, 'E',
            payload.total_recebimento, payload.data_recebimento, `AG-${payload.agendamento_id}`,
            `Recebimento de consulta`, false, session.nome ?? 'sistema',
            'CLI', payload.agendamento_id,
          ],
        )
        movimento_id = movCaixaRows[0]?.id
      }
    }

    // Se foi criado título, criar movimentos asociados
    if (titulo_id) {
      if (tipoPagamento === 'pix') {
        const { rows: movBancoRows } = await client.query(
          `INSERT INTO tab_movimento_banco (
            empresa_id, conta_banco_id, pessoa_id, titulo_receber_id, tipo, valor,
            data_movimento, documento, observacao, conciliado, created_by,
            origem_modulo, origem_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id`,
          [
            session.empresa_id_ativa, contaBancoPixId, payload.paciente_id, titulo_id, 'E',
            payload.total_recebimento, payload.data_recebimento, `AG-${payload.agendamento_id}-PIX`,
            `PIX recebido da consulta`, false, session.nome ?? 'sistema',
            'CLI', payload.agendamento_id,
          ],
        )
        movimento_banco_id = movBancoRows[0]?.id
      } else {
        const { rows: movCaixaRows } = await client.query(
          `INSERT INTO tab_movimento_caixa (
            empresa_id, pessoa_id, titulo_receber_id, tipo, valor,
            data_movimento, documento, observacao, conciliado, created_by,
            origem_modulo, origem_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id`,
          [
            session.empresa_id_ativa, payload.paciente_id, titulo_id, 'E',
            payload.total_recebimento, payload.data_recebimento, `AG-${payload.agendamento_id}`,
            `Recebimento de consulta`, false, session.nome ?? 'sistema',
            'CLI', payload.agendamento_id,
          ],
        )
        movimento_id = movCaixaRows[0]?.id
      }
    }

    // Atualizar status do agendamento para ATENDIDO
    await client.query(
      'UPDATE tab_agendamento SET status = $1, updated_at = NOW() WHERE id = $2',
      ['ATENDIDO', payload.agendamento_id],
    )

    await client.query('COMMIT')

    // Nota: O recebimento será criado automaticamente pela trigger
    // quando o movimento for inserido com origem_modulo='CLI'
    return NextResponse.json({
      sucesso: true,
      titulo_receber_id: titulo_id,
      movimento_caixa_id: movimento_id,
      movimento_banco_id,
      tipo_pagamento: tipoPagamento,
      mensagem: 'Movimento registrado com sucesso. Recebimento será processado automaticamente.',
    })
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Transaction já foi finalizada
    }
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Erro ao processar recebimento:', errorMessage, error)
    return NextResponse.json({
      erro: 'Erro ao processar recebimento',
      detalhes: errorMessage
    }, { status: 500 })
  } finally {
    client.release()
  }
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
