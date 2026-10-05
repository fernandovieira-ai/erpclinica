import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { solicitacaoExameSchema } from '@/lib/validators/solicitacao-exame.schema'

// GET /api/clinica/solicitacoes-exame?agendamento_id=X  ou  ?paciente_id=X
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const agId  = req.nextUrl.searchParams.get('agendamento_id')
  const pacId = req.nextUrl.searchParams.get('paciente_id')
  if (!agId && !pacId) {
    return NextResponse.json({ erro: 'Informe agendamento_id ou paciente_id' }, { status: 400 })
  }

  const valor = Number(agId ?? pacId)
  if (!Number.isInteger(valor)) {
    return NextResponse.json({ erro: 'Parâmetro inválido' }, { status: 400 })
  }

  const db    = getDb(session.database_name)
  const cond  = agId ? 'agendamento_id = $2' : 'paciente_id = $2'

  const { rows } = await db.query(
    `SELECT id, agendamento_id, paciente_id, caracter, indicacao_clinica, exames,
            created_by, created_at
     FROM tab_solicitacao_exame
     WHERE empresa_id = $1 AND ${cond}
     ORDER BY created_at DESC`,
    [session.empresa_id_ativa, valor],
  )

  return NextResponse.json({ dados: rows })
}

// POST /api/clinica/solicitacoes-exame — salva nova solicitação de exame
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = solicitacaoExameSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })
  const d = body.data

  const db = getDb(session.database_name)

  const { rows: agRows } = await db.query(
    'SELECT id, paciente_id, profissional_id FROM tab_agendamento WHERE id = $1 AND empresa_id = $2',
    [d.agendamento_id, session.empresa_id_ativa],
  )
  if (!agRows.length) {
    return NextResponse.json({ erro: 'Agendamento não encontrado' }, { status: 404 })
  }
  const ag = agRows[0]

  const { rows } = await db.query(
    `INSERT INTO tab_solicitacao_exame
       (empresa_id, agendamento_id, paciente_id, profissional_id,
        caracter, indicacao_clinica, exames, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      session.empresa_id_ativa, ag.id, ag.paciente_id, ag.profissional_id,
      d.caracter, d.indicacao_clinica ?? null, d.exames, session.nome ?? null,
    ],
  )

  return NextResponse.json({ id: rows[0].id })
}
