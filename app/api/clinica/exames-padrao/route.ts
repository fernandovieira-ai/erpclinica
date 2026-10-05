import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { examePadraoSchema } from '@/lib/validators/exame-padrao.schema'

// GET /api/clinica/exames-padrao — catalogo de exames padrao da empresa ativa
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT id, nome, created_at
     FROM tab_exame_padrao
     WHERE empresa_id = $1
     ORDER BY id`,
    [session.empresa_id_ativa],
  )

  return NextResponse.json({ dados: rows })
}

// POST /api/clinica/exames-padrao — cadastra novo exame no catalogo
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = examePadraoSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })
  const d = body.data

  const db = getDb(session.database_name)
  try {
    const { rows } = await db.query(
      `INSERT INTO tab_exame_padrao (empresa_id, nome) VALUES ($1,$2) RETURNING id, nome, created_at`,
      [session.empresa_id_ativa, d.nome],
    )
    return NextResponse.json({ dados: rows[0] }, { status: 201 })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      return NextResponse.json({ erro: 'Esse exame já está cadastrado' }, { status: 409 })
    }
    throw e
  }
}
