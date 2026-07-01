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
    return NextResponse.json({ erro: 'Erro ao buscar recebimento', detalhes: errorMessage }, { status: 500 })
  } finally {
    client.release()
  }
}

// DELETE - Estornar recebimento e todos os demais vinculados ao mesmo movimento
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

    // 1. Busca o recebimento clicado
    const { rows: recRows } = await client.query(
      `SELECT id, status_recebimento, agendamento_id, batch_agendamento_id, movimento_caixa_id, movimento_banco_id
       FROM tab_recebimento_consulta
       WHERE id = $1 AND empresa_id = $2`,
      [recebimentoId, session.empresa_id_ativa]
    )

    if (recRows.length === 0) {
      return NextResponse.json({ erro: 'Recebimento não encontrado' }, { status: 404 })
    }
    if (recRows[0].status_recebimento === 'ESTORNADO') {
      return NextResponse.json({ erro: 'Este recebimento já foi estornado' }, { status: 400 })
    }

    // batch_agendamento_id é o grupo do lote — igual ao origem_id de todos os N títulos gerados
    const batchAgendamentoId = (recRows[0].batch_agendamento_id ?? recRows[0].agendamento_id) as number

    // 2. Todos os N títulos do lote (origem_id = batchAgendamentoId)
    const { rows: tituloRows } = await client.query(
      `SELECT id, movimento_caixa_id, movimento_banco_id FROM tab_titulo_receber
       WHERE empresa_id = $1 AND origem_modulo = 'CLI' AND origem_id = $2`,
      [session.empresa_id_ativa, batchAgendamentoId]
    )
    const tituloIds   = tituloRows.map((r: { id: number }) => r.id)
    const movCaixaIds = tituloRows.map((r: { movimento_caixa_id: number | null }) => r.movimento_caixa_id).filter((x): x is number => x != null)
    const movBancoIds = tituloRows.map((r: { movimento_banco_id: number | null }) => r.movimento_banco_id).filter((x): x is number => x != null)

    // 3. Todos os recebimentos do lote (mesmo batch_agendamento_id)
    const { rows: todosRecRows } = await client.query(
      `SELECT id, movimento_caixa_id, movimento_banco_id FROM tab_recebimento_consulta
       WHERE empresa_id = $1 AND batch_agendamento_id = $2`,
      [session.empresa_id_ativa, batchAgendamentoId]
    )
    const todosRecIds    = todosRecRows.map((r: { id: number }) => r.id)
    const recMovCaixaIds = todosRecRows.map((r: { movimento_caixa_id: number | null }) => r.movimento_caixa_id).filter((x): x is number => x != null)
    const recMovBancoIds = todosRecRows.map((r: { movimento_banco_id: number | null }) => r.movimento_banco_id).filter((x): x is number => x != null)

    await client.query('BEGIN')

    // A. Zera FK dos títulos para movimentos (sem mudar status — trigger não dispara)
    if (tituloIds.length > 0) {
      await client.query(
        `UPDATE tab_titulo_receber
         SET movimento_caixa_id = NULL, movimento_banco_id = NULL,
             destino_liquidacao  = NULL, conta_banco_liq_id = NULL
         WHERE id = ANY($1::int[])`,
        [tituloIds]
      )
    }

    // B. Deleta recebimentos — libera FK para tab_movimento_caixa e tab_titulo_receber
    if (todosRecIds.length > 0) {
      await client.query(
        `DELETE FROM tab_recebimento_consulta WHERE id = ANY($1::int[])`,
        [todosRecIds]
      )
    }

    // C. Deleta movimentos (IDs coletados de títulos + recebimentos)
    const allMovCaixaIds = [...new Set([...movCaixaIds, ...recMovCaixaIds])]
    const allMovBancoIds = [...new Set([...movBancoIds, ...recMovBancoIds])]
    if (allMovCaixaIds.length > 0) {
      await client.query(`DELETE FROM tab_movimento_caixa WHERE id = ANY($1::int[])`, [allMovCaixaIds])
    }
    if (allMovBancoIds.length > 0) {
      await client.query(`DELETE FROM tab_movimento_banco WHERE id = ANY($1::int[])`, [allMovBancoIds])
    }
    // Belt-and-suspenders: movimentos via titulo_receber_id (caso trigger tenha gerado)
    if (tituloIds.length > 0) {
      await client.query(`DELETE FROM tab_movimento_caixa WHERE titulo_receber_id = ANY($1::int[])`, [tituloIds])
      await client.query(`DELETE FROM tab_movimento_banco WHERE titulo_receber_id = ANY($1::int[])`, [tituloIds])
    }

    // D. Deleta títulos
    if (tituloIds.length > 0) {
      await client.query(`DELETE FROM tab_titulo_receber WHERE id = ANY($1::int[])`, [tituloIds])
    }

    await client.query('COMMIT')

    return NextResponse.json({
      sucesso: true,
      mensagem: `${todosRecIds.length} recebimento(s) e ${tituloIds.length} título(s) estornados com sucesso`,
      total_estornados: todosRecIds.length,
    })
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* já finalizada */ }
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Erro ao estornar recebimento:', errorMessage)
    return NextResponse.json({ erro: 'Erro ao estornar recebimento', detalhes: errorMessage }, { status: 500 })
  } finally {
    client.release()
  }
}
