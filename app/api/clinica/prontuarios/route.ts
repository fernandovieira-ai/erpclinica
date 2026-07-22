import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { prontuarioSchema } from '@/lib/validators/prontuario.schema'

// GET /api/clinica/prontuarios?paciente_id=X  ou  ?agendamento_id=X
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const pacienteId    = req.nextUrl.searchParams.get('paciente_id')
  const agendamentoId = req.nextUrl.searchParams.get('agendamento_id')

  if (!pacienteId && !agendamentoId) {
    return NextResponse.json({ erro: 'Informe paciente_id ou agendamento_id' }, { status: 400 })
  }

  const db = getDb(session.database_name)
  const cond   = pacienteId ? 'paciente_id = $2' : 'agendamento_id = $2'
  const valor  = pacienteId ? Number(pacienteId) : Number(agendamentoId)

  const { rows } = await db.query(
    `SELECT * FROM tab_prontuario WHERE empresa_id = $1 AND ${cond} ORDER BY created_at DESC`,
    [session.empresa_id_ativa, valor],
  )

  return NextResponse.json({ dados: rows })
}

// POST /api/clinica/prontuarios — cria ou atualiza o prontuário de um agendamento (upsert)
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = prontuarioSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  const { rows: agRows } = await db.query(
    'SELECT id FROM tab_agendamento WHERE id = $1 AND empresa_id = $2',
    [d.agendamento_id, session.empresa_id_ativa],
  )
  if (agRows.length === 0) {
    return NextResponse.json({ erro: 'Agendamento não encontrado' }, { status: 404 })
  }

  const { rows } = await db.query(
    `INSERT INTO tab_prontuario (
       empresa_id, agendamento_id, paciente_id, profissional_id,
       queixas, hda, antecedentes_familiares, antecedentes_pessoais,
       habitos, alergias, exame_fisico, peso, imc, pressao,
       exames, diagnostico, medicacao, outras_condutas, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (agendamento_id) DO UPDATE SET
       queixas                 = EXCLUDED.queixas,
       hda                     = EXCLUDED.hda,
       antecedentes_familiares = EXCLUDED.antecedentes_familiares,
       antecedentes_pessoais   = EXCLUDED.antecedentes_pessoais,
       habitos                 = EXCLUDED.habitos,
       alergias                = EXCLUDED.alergias,
       exame_fisico            = EXCLUDED.exame_fisico,
       peso                    = EXCLUDED.peso,
       imc                     = EXCLUDED.imc,
       pressao                 = EXCLUDED.pressao,
       exames                  = EXCLUDED.exames,
       diagnostico             = EXCLUDED.diagnostico,
       medicacao               = EXCLUDED.medicacao,
       outras_condutas         = EXCLUDED.outras_condutas
     RETURNING *`,
    [
      session.empresa_id_ativa, d.agendamento_id, d.paciente_id, d.profissional_id,
      d.queixas ?? null, d.hda ?? null, d.antecedentes_familiares ?? null, d.antecedentes_pessoais ?? null,
      d.habitos ?? null, d.alergias ?? null, d.exame_fisico ?? null, d.peso ?? null, d.imc ?? null, d.pressao ?? null,
      d.exames ?? null, d.diagnostico ?? null, d.medicacao ?? null, d.outras_condutas ?? null,
      session.nome ?? null,
    ],
  )

  return NextResponse.json(rows[0])
}
