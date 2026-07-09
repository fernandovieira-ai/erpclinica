import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { receitaMedicaSchema } from '@/lib/validators/receita-medica.schema'

// GET /api/clinica/receitas?paciente_id=X  ou  ?agendamento_id=X
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const pacienteId    = req.nextUrl.searchParams.get('paciente_id')
  const agendamentoId = req.nextUrl.searchParams.get('agendamento_id')

  if (!pacienteId && !agendamentoId) {
    return NextResponse.json({ erro: 'Informe paciente_id ou agendamento_id' }, { status: 400 })
  }

  const db = getDb(session.database_name)
  const cond  = pacienteId ? 'paciente_id = $2' : 'agendamento_id = $2'
  const valor = pacienteId ? Number(pacienteId) : Number(agendamentoId)

  const { rows } = await db.query(
    `SELECT * FROM tab_receita_medica WHERE empresa_id = $1 AND ${cond} ORDER BY created_at DESC`,
    [session.empresa_id_ativa, valor],
  )

  return NextResponse.json({ dados: rows })
}

// POST /api/clinica/receitas — registra no histórico uma receita emitida pela
// Memed (evento prescricaoImpressa). paciente_id/profissional_id são derivados
// do agendamento no servidor, nunca vêm do client.
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = receitaMedicaSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  const { rows: agRows } = await db.query(
    'SELECT id, paciente_id, profissional_id FROM tab_agendamento WHERE id = $1 AND empresa_id = $2',
    [d.agendamento_id, session.empresa_id_ativa],
  )
  if (agRows.length === 0) {
    return NextResponse.json({ erro: 'Agendamento não encontrado' }, { status: 404 })
  }
  const ag = agRows[0]

  const { rows } = await db.query(
    `INSERT INTO tab_receita_medica (
       empresa_id, agendamento_id, paciente_id, profissional_id,
       memed_prescricao_id, url_receita, medicamentos, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      session.empresa_id_ativa, d.agendamento_id, ag.paciente_id, ag.profissional_id,
      d.memed_prescricao_id ?? null, d.url_receita ?? null, d.medicamentos ?? null,
      session.nome ?? null,
    ],
  )

  return NextResponse.json(rows[0])
}
