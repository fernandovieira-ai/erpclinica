import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { especialidadeSchema } from '@/lib/validators/agendamento.schema'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT id, descricao, cor, ativo
     FROM tab_especialidade
     WHERE empresa_id = $1 AND ativo = true
     ORDER BY descricao`,
    [session.empresa_id_ativa],
  )

  return NextResponse.json({ dados: rows })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = especialidadeSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `INSERT INTO tab_especialidade (empresa_id, descricao, cor)
     VALUES ($1,$2,$3) RETURNING id`,
    [session.empresa_id_ativa, d.descricao.toUpperCase(), d.cor],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
