import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// DELETE /api/clinica/agenda-profissional-pausa/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  await db.query(
    'DELETE FROM tab_agenda_profissional_pausa WHERE id = $1 AND empresa_id = $2',
    [params.id, session.empresa_id_ativa],
  )

  return NextResponse.json({ ok: true })
}
