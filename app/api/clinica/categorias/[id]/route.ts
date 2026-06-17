import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { categoriaSchema } from '@/lib/validators/agendamento.schema'

type Params = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT id, descricao, ativo FROM tab_categoria WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows[0]) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json()
  const db   = getDb(session.database_name)

  if ('ativo' in body && Object.keys(body).length === 1) {
    await db.query(
      `UPDATE tab_categoria SET ativo = $1 WHERE id = $2 AND empresa_id = $3`,
      [body.ativo, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const parsed = categoriaSchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ erro: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data
  await db.query(
    `UPDATE tab_categoria
     SET descricao = COALESCE($1, descricao),
         ativo     = COALESCE($2, ativo)
     WHERE id = $3 AND empresa_id = $4`,
    [
      d.descricao ? d.descricao.toUpperCase() : null,
      (d as Record<string, unknown>).ativo ?? null,
      params.id,
      session.empresa_id_ativa,
    ],
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  try {
    await db.query(
      `DELETE FROM tab_categoria WHERE id = $1 AND empresa_id = $2`,
      [params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ erro: 'Erro ao excluir — verifique se não há agendamentos vinculados' }, { status: 409 })
  }
}
