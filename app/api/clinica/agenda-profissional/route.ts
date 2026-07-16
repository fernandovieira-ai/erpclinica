import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/agenda-profissional?profissional_id=X
// GET /api/clinica/agenda-profissional (sem profissional_id) — agrega a grade de TODOS
// os profissionais ativos da empresa por dia da semana: menor intervalo configurado e
// o intervalo de horário mais amplo (MIN hora_inicio / MAX hora_fim). Usado pela Visão
// Dia/Semana da agenda quando o filtro é "Todos os profissionais", para que a grade
// nunca fique mais grosseira que o menor intervalo de atendimento cadastrado.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const profissionalId = req.nextUrl.searchParams.get('profissional_id')
  const db = getDb(session.database_name)

  if (!profissionalId) {
    const { rows } = await db.query(
      `SELECT dia_semana,
              TO_CHAR(MIN(hora_inicio), 'HH24:MI') AS hora_inicio,
              TO_CHAR(MAX(hora_fim),    'HH24:MI') AS hora_fim,
              MIN(intervalo_min) AS intervalo_min
       FROM tab_agenda_profissional
       WHERE empresa_id = $1 AND ativo = true
       GROUP BY dia_semana
       ORDER BY dia_semana`,
      [session.empresa_id_ativa],
    )
    return NextResponse.json({ dados: rows.map(r => ({ ...r, ativo: true })) })
  }

  const { rows } = await db.query(
    `SELECT id, dia_semana,
            TO_CHAR(hora_inicio, 'HH24:MI') AS hora_inicio,
            TO_CHAR(hora_fim,    'HH24:MI') AS hora_fim,
            intervalo_min, ativo
     FROM tab_agenda_profissional
     WHERE profissional_id = $1 AND empresa_id = $2
     ORDER BY dia_semana`,
    [profissionalId, session.empresa_id_ativa],
  )

  return NextResponse.json({ dados: rows })
}

// POST /api/clinica/agenda-profissional — upsert por dia_semana
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json()
  const { profissional_id, dia_semana, hora_inicio, hora_fim, intervalo_min, ativo } = body

  if (profissional_id == null || dia_semana == null || !hora_inicio || !hora_fim) {
    return NextResponse.json({ erro: 'Campos obrigatórios: profissional_id, dia_semana, hora_inicio, hora_fim' }, { status: 400 })
  }

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `INSERT INTO tab_agenda_profissional
       (empresa_id, profissional_id, dia_semana, hora_inicio, hora_fim, intervalo_min, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (profissional_id, dia_semana) DO UPDATE SET
       hora_inicio   = EXCLUDED.hora_inicio,
       hora_fim      = EXCLUDED.hora_fim,
       intervalo_min = EXCLUDED.intervalo_min,
       ativo         = EXCLUDED.ativo
     RETURNING id, dia_semana,
               TO_CHAR(hora_inicio, 'HH24:MI') AS hora_inicio,
               TO_CHAR(hora_fim,    'HH24:MI') AS hora_fim,
               intervalo_min, ativo`,
    [session.empresa_id_ativa, profissional_id, dia_semana, hora_inicio, hora_fim, intervalo_min ?? 30, ativo ?? true],
  )

  return NextResponse.json(rows[0])
}
