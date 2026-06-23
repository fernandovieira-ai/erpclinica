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

    // Marcar como estornado
    await client.query(
      `UPDATE tab_recebimento_consulta
       SET status_recebimento = $1,
           observacao = COALESCE(observacao, '') || ' | ESTORNADO: ' || $2
       WHERE id = $3`,
      ['ESTORNADO', payload.motivo_estorno, recebimentoId]
    )

    // Limpar os movimentos associados
    await client.query(
      `DELETE FROM tab_movimento_caixa
       WHERE titulo_receber_id IN (
         SELECT titulo_receber_id FROM tab_recebimento_consulta WHERE id = $1
       )`,
      [recebimentoId]
    )

    await client.query(
      `DELETE FROM tab_movimento_banco
       WHERE titulo_receber_id IN (
         SELECT titulo_receber_id FROM tab_recebimento_consulta WHERE id = $1
       )`,
      [recebimentoId]
    )

    // Reabrir o título a receber
    await client.query(
      `UPDATE tab_titulo_receber
       SET status = $1, data_liquidacao = NULL, valor_liquidado = 0, updated_at = NOW()
       WHERE id IN (
         SELECT titulo_receber_id FROM tab_recebimento_consulta WHERE id = $2
       )`,
      ['A', recebimentoId]
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
