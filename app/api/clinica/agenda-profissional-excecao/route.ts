import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/agenda-profissional-excecao?profissional_id=X
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const profissionalId = req.nextUrl.searchParams.get('profissional_id')
  if (!profissionalId) return NextResponse.json({ erro: 'profissional_id obrigatório' }, { status: 400 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT id, data, descricao, nao_atende,
            TO_CHAR(hora_inicio, 'HH24:MI') AS hora_inicio,
            TO_CHAR(hora_fim,    'HH24:MI') AS hora_fim,
            intervalo_min
     FROM tab_agenda_profissional_excecao
     WHERE profissional_id = $1 AND empresa_id = $2
     ORDER BY data DESC`,
    [profissionalId, session.empresa_id_ativa],
  )

  return NextResponse.json({ dados: rows })
}

// POST /api/clinica/agenda-profissional-excecao — cria exceção
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json()
  const { profissional_id, data, descricao, nao_atende, hora_inicio, hora_fim, intervalo_min } = body

  if (!profissional_id || !data) {
    return NextResponse.json({ erro: 'Campos obrigatórios: profissional_id, data' }, { status: 400 })
  }

  if (!nao_atende && (!hora_inicio || !hora_fim)) {
    return NextResponse.json({ erro: 'Se atende neste dia, informe hora_inicio e hora_fim' }, { status: 400 })
  }

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `INSERT INTO tab_agenda_profissional_excecao
       (empresa_id, profissional_id, data, descricao, nao_atende, hora_inicio, hora_fim, intervalo_min)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (profissional_id, data) DO UPDATE SET
       descricao    = EXCLUDED.descricao,
       nao_atende   = EXCLUDED.nao_atende,
       hora_inicio  = EXCLUDED.hora_inicio,
       hora_fim     = EXCLUDED.hora_fim,
       intervalo_min = EXCLUDED.intervalo_min
     RETURNING id, data, descricao, nao_atende,
               TO_CHAR(hora_inicio, 'HH24:MI') AS hora_inicio,
               TO_CHAR(hora_fim,    'HH24:MI') AS hora_fim,
               intervalo_min`,
    [
      session.empresa_id_ativa,
      profissional_id,
      data,
      descricao ?? null,
      nao_atende ?? true,
      nao_atende ? null : hora_inicio,
      nao_atende ? null : hora_fim,
      intervalo_min ?? 30,
    ],
  )

  return NextResponse.json(rows[0])
}
