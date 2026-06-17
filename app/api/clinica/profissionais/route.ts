import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/profissionais?busca=
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const busca = req.nextUrl.searchParams.get('busca')?.trim() || ''
  const db    = getDb(session.database_name)

  const params: unknown[] = [session.empresa_id_ativa]
  let buscaCond = ''
  if (busca) {
    buscaCond = ` AND p.nome ILIKE $2`
    params.push(`%${busca}%`)
  }

  const { rows: profissionais } = await db.query(
    `SELECT p.id, p.nome, p.celular, p.email
     FROM tab_pessoa p
     WHERE p.empresa_id = $1 AND p.ind_profissional = true AND p.ativo = true
     ${buscaCond}
     ORDER BY p.nome`,
    params,
  )

  if (!profissionais.length) return NextResponse.json({ dados: [] })

  const ids = profissionais.map(p => p.id)

  const [{ rows: especialidades }, { rows: agenda }] = await Promise.all([
    db.query(
      `SELECT pe.pessoa_id, e.id, e.descricao, e.cor
       FROM tab_profissional_especialidade pe
       JOIN tab_especialidade e ON e.id = pe.especialidade_id
       WHERE pe.pessoa_id = ANY($1)`,
      [ids],
    ),
    db.query(
      `SELECT ag.profissional_id, ag.id, ag.dia_semana,
              TO_CHAR(ag.hora_inicio,'HH24:MI') AS hora_inicio,
              TO_CHAR(ag.hora_fim,'HH24:MI')    AS hora_fim,
              ag.intervalo_min, ag.ativo
       FROM tab_agenda_profissional ag
       WHERE ag.profissional_id = ANY($1) AND ag.ativo = true
       ORDER BY ag.profissional_id, ag.dia_semana`,
      [ids],
    ),
  ])

  const espMap  = new Map<number, typeof especialidades>()
  const agMap   = new Map<number, typeof agenda>()

  for (const e of especialidades) {
    if (!espMap.has(e.pessoa_id)) espMap.set(e.pessoa_id, [])
    espMap.get(e.pessoa_id)!.push({ id: e.id, descricao: e.descricao, cor: e.cor })
  }
  for (const a of agenda) {
    if (!agMap.has(a.profissional_id)) agMap.set(a.profissional_id, [])
    agMap.get(a.profissional_id)!.push(a)
  }

  const dados = profissionais.map(p => ({
    ...p,
    especialidades: espMap.get(p.id) ?? [],
    agenda:         agMap.get(p.id)  ?? [],
  }))

  return NextResponse.json({ dados })
}
