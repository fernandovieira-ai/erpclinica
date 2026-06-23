import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

interface EstornoPayload {
  motivo_estorno: string
}

// GET - Buscar recebimento específico
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const client = await getDb(session.database_name).connect()

  try {
    const { id } = await params
    const recebimentoId = parseInt(id)

    const { rows } = await client.query(
      `SELECT
        rc.id, rc.agendamento_id, rc.paciente_id,
        rc.valor_original, rc.valor_desconto, rc.valor_acrescimo,
        rc.valor_recebido, rc.total_recebimento,
        rc.status_recebimento, rc.data_recebimento, rc.observacao,
        rc.created_at,
        ag.status AS agendamento_status,
        pac.nome AS paciente_nome,
        prof.nome AS profissional_nome,
        cp.descricao AS condicao_pagamento_desc
      FROM tab_recebimento_consulta rc
        JOIN tab_agendamento ag ON ag.id = rc.agendamento_id
        JOIN tab_pessoa pac ON pac.id = ag.paciente_id
        JOIN tab_pessoa prof ON prof.id = ag.profissional_id
        JOIN tab_condicao_pagamento cp ON cp.id = rc.condicao_pagamento_id
      WHERE rc.id = $1 AND rc.empresa_id = $2`,
      [recebimentoId, session.empresa_id_ativa]
    )

    if (rows.length === 0) {
      return NextResponse.json({ erro: 'Recebimento não encontrado' }, { status: 404 })
    }

    return NextResponse.json({ dados: rows[0] })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Erro ao buscar recebimento:', errorMessage)
    return NextResponse.json({
      erro: 'Erro ao buscar recebimento',
      detalhes: errorMessage
    }, { status: 500 })
  } finally {
    client.release()
  }
}

// DELETE - Estornar recebimento
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const client = await getDb(session.database_name).connect()

  try {
    const { id } = await params
    const recebimentoId = parseInt(id)
    const payload: EstornoPayload = await req.json()

    if (!payload.motivo_estorno) {
      return NextResponse.json({ erro: 'Motivo do estorno é obrigatório' }, { status: 400 })
    }

    // Verificar se recebimento existe e pertence à empresa
    const { rows: recRows } = await client.query(
      `SELECT id, status_recebimento, agendamento_id
       FROM tab_recebimento_consulta
       WHERE id = $1 AND empresa_id = $2`,
      [recebimentoId, session.empresa_id_ativa]
    )

    if (recRows.length === 0) {
      return NextResponse.json({ erro: 'Recebimento não encontrado' }, { status: 404 })
    }

    const status = recRows[0].status_recebimento
    if (status === 'ESTORNADO') {
      return NextResponse.json({ erro: 'Este recebimento já foi estornado' }, { status: 400 })
    }

    await client.query('BEGIN')

    // Buscar dados antes de deletar
    const { rows: recRows2 } = await client.query(
      `SELECT titulo_receber_id, movimento_caixa_id, movimento_banco_id
       FROM tab_recebimento_consulta WHERE id = $1`,
      [recebimentoId]
    )
    const tituloId = recRows2[0]?.titulo_receber_id
    const movimentoCaixaId = recRows2[0]?.movimento_caixa_id
    const movimentoBancoId = recRows2[0]?.movimento_banco_id

    // Primeiro, remover as referências do recebimento
    await client.query(
      `UPDATE tab_recebimento_consulta
       SET movimento_caixa_id = NULL, movimento_banco_id = NULL
       WHERE id = $1`,
      [recebimentoId]
    )

    // Deletar os movimentos direto pelo ID (funciona para parcelado e à vista)
    if (movimentoCaixaId) {
      await client.query(
        `DELETE FROM tab_movimento_caixa WHERE id = $1`,
        [movimentoCaixaId]
      )
    }

    if (movimentoBancoId) {
      await client.query(
        `DELETE FROM tab_movimento_banco WHERE id = $1`,
        [movimentoBancoId]
      )
    }

    // Reabrir o título a receber (se existir)
    if (tituloId) {
      await client.query(
        `UPDATE tab_titulo_receber
         SET status = $1, data_liquidacao = NULL, valor_liquidado = 0
         WHERE id = $2`,
        ['A', tituloId]
      )
    }

    // Deletar o recebimento (limpeza total)
    await client.query(
      `DELETE FROM tab_recebimento_consulta WHERE id = $1`,
      [recebimentoId]
    )

    await client.query('COMMIT')

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Recebimento estornado com sucesso'
    })
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Transaction já foi finalizada
    }
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Erro ao estornar recebimento:', errorMessage)
    return NextResponse.json({
      erro: 'Erro ao estornar recebimento',
      detalhes: errorMessage
    }, { status: 500 })
  } finally {
    client.release()
  }
}
