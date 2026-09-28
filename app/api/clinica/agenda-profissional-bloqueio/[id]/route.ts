import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'

// DELETE /api/clinica/agenda-profissional-bloqueio/[id] — libera a faixa de horário
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Id inválido' }, { status: 400 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `DELETE FROM tab_agenda_profissional_bloqueio WHERE id = $1 AND empresa_id = $2 RETURNING *`,
    [id, session.empresa_id_ativa],
  )
  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })

  await registrarAuditoria(db, session, {
    tabela: 'tab_agenda_profissional_bloqueio',
    registroId: id,
    acao: 'DELETE',
    dadosAntes: rows[0],
  })
  return NextResponse.json({ ok: true })
}
