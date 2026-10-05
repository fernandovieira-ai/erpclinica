import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { examePadraoSchema } from '@/lib/validators/exame-padrao.schema'

type Params = { params: { id: string } }

// PATCH /api/clinica/exames-padrao/[id] — renomeia um exame do catalogo
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 })

  const body = examePadraoSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })
  const d = body.data

  const db = getDb(session.database_name)
  try {
    const { rows } = await db.query(
      `UPDATE tab_exame_padrao SET nome = $1 WHERE id = $2 AND empresa_id = $3 RETURNING id, nome, created_at`,
      [d.nome, id, session.empresa_id_ativa],
    )
    if (!rows[0]) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
    return NextResponse.json({ dados: rows[0] })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') {
      return NextResponse.json({ erro: 'Esse exame já está cadastrado' }, { status: 409 })
    }
    throw e
  }
}

// DELETE /api/clinica/exames-padrao/[id] — remove um exame do catalogo
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const id = Number(params.id)
  if (!Number.isInteger(id)) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 })

  const db = getDb(session.database_name)
  const { rowCount } = await db.query(
    `DELETE FROM tab_exame_padrao WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresa_id_ativa],
  )
  if (!rowCount) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
