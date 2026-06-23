import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/agenda-profissional-pausa?profissional_id=X
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const profissionalId = req.nextUrl.searchParams.get('profissional_id')
  if (!profissionalId) return NextResponse.json({ erro: 'profissional_id obrigatório' }, { status: 400 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT id, dia_semana,
            TO_CHAR(hora_inicio, 'HH24:MI') AS hora_inicio,
            TO_CHAR(hora_fim,    'HH24:MI') AS hora_fim,
            descricao
     FROM tab_agenda_profissional_pausa
     WHERE profissional_id = $1 AND empresa_id = $2
     ORDER BY dia_semana, hora_inicio`,
    [profissionalId, session.empresa_id_ativa],
  )

  return NextResponse.json({ dados: rows })
}

// POST /api/clinica/agenda-profissional-pausa — cria pausa
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json()
  const { profissional_id, dia_semana, hora_inicio, hora_fim, descricao } = body

  if (profissional_id == null || dia_semana == null || !hora_inicio || !hora_fim) {
    return NextResponse.json({ erro: 'Campos obrigatórios: profissional_id, dia_semana, hora_inicio, hora_fim' }, { status: 400 })
  }

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `INSERT INTO tab_agenda_profissional_pausa
       (empresa_id, profissional_id, dia_semana, hora_inicio, hora_fim, descricao)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, dia_semana,
               TO_CHAR(hora_inicio, 'HH24:MI') AS hora_inicio,
               TO_CHAR(hora_fim,    'HH24:MI') AS hora_fim,
               descricao`,
    [session.empresa_id_ativa, profissional_id, dia_semana, hora_inicio, hora_fim, descricao ?? null],
  )

  return NextResponse.json(rows[0])
}
