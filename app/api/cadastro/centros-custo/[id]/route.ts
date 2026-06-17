import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { centroCustoSchema } from '@/lib/validators/centro-custo.schema'

// GET /api/cadastro/centros-custo/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT cc.id, cc.empresa_id, cc.codigo, cc.descricao, cc.pai_id,
            p.descricao AS pai_desc, cc.tipo, cc.ativo, cc.created_at, cc.updated_at
     FROM tab_centro_custo cc
     LEFT JOIN tab_centro_custo p ON p.id = cc.pai_id
     WHERE cc.id = $1 AND cc.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/cadastro/centros-custo/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const json = await req.json()

  if ('ativo' in json && Object.keys(json).length === 1) {
    const db = getDb(session.database_name)
    await db.query(
      `UPDATE tab_centro_custo SET ativo = $1, updated_at = NOW()
       WHERE id = $2 AND empresa_id = $3`,
      [json.ativo, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const body = centroCustoSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)
  const db = getDb(session.database_name)

  const result = await db.query(
    `UPDATE tab_centro_custo
     SET codigo=$1, descricao=$2, pai_id=$3, tipo=$4, ativo=$5, updated_at=NOW()
     WHERE id = $6 AND empresa_id = $7`,
    [
      up(d.codigo),
      up(d.descricao),
      d.pai_id ?? null,
      d.tipo,
      d.ativo,
      params.id,
      session.empresa_id_ativa,
    ],
  )

  if (result.rowCount === 0)
    return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true })
}

// DELETE /api/cadastro/centros-custo/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const result = await db.query(
    `DELETE FROM tab_centro_custo WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (result.rowCount === 0)
    return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
