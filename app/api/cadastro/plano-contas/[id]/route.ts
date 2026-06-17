import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { planoContasSchema } from '@/lib/validators/plano-contas.schema'

// GET /api/cadastro/plano-contas/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT pc.id, pc.empresa_id, pc.codigo, pc.descricao, pc.pai_id,
            p.descricao AS pai_desc, pc.tipo, pc.natureza,
            pc.classificacao, pc.grupo, pc.ativo, pc.created_at, pc.updated_at
     FROM tab_plano_contas pc
     LEFT JOIN tab_plano_contas p ON p.id = pc.pai_id
     WHERE pc.id = $1 AND pc.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/cadastro/plano-contas/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const json = await req.json()

  if ('ativo' in json && Object.keys(json).length === 1) {
    const db = getDb(session.database_name)
    await db.query(
      `UPDATE tab_plano_contas SET ativo = $1, updated_at = NOW()
       WHERE id = $2 AND empresa_id = $3`,
      [json.ativo, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const body = planoContasSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)
  const db = getDb(session.database_name)

  const result = await db.query(
    `UPDATE tab_plano_contas SET
       codigo=$1, descricao=$2, pai_id=$3, tipo=$4, natureza=$5,
       classificacao=$6, grupo=$7, ativo=$8, updated_at=NOW()
     WHERE id = $9 AND empresa_id = $10`,
    [
      up(d.codigo),
      up(d.descricao),
      d.pai_id ?? null,
      d.tipo,
      d.natureza,
      d.classificacao,
      up(d.grupo) ?? null,
      d.ativo,
      params.id,
      session.empresa_id_ativa,
    ],
  )

  if (result.rowCount === 0)
    return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true })
}

// DELETE /api/cadastro/plano-contas/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const result = await db.query(
    `DELETE FROM tab_plano_contas WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (result.rowCount === 0)
    return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
