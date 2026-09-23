import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/agendamentos/parametros
// Endpoint dedicado (não usa /api/auth/me) para não onerar as demais telas que
// chamam a sessão — só o modal de agendamento precisa deste flag.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT permite_agendamento_retroativo FROM tab_empresa WHERE id = $1`,
    [session.empresa_id_ativa],
  )

  return NextResponse.json({
    permite_agendamento_retroativo: rows[0]?.permite_agendamento_retroativo ?? false,
  })
}
