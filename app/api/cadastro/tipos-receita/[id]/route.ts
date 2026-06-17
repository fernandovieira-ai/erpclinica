import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { tipoReceitaSchema } from '@/lib/validators/tipo-receita.schema'

// GET /api/cadastro/tipos-receita/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT tr.id, tr.empresa_id, tr.codigo, tr.descricao, tr.natureza,
            tr.conta_id, pc.descricao AS conta_desc, pc.codigo AS conta_codigo,
            tr.ind_pis_cofins, tr.pai_id, p.descricao AS pai_desc,
            tr.ativo, tr.created_at, tr.updated_at
     FROM tab_tipo_receita tr
     LEFT JOIN tab_plano_contas pc ON pc.id = tr.conta_id
     LEFT JOIN tab_tipo_receita p  ON p.id  = tr.pai_id
     WHERE tr.id = $1 AND tr.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/cadastro/tipos-receita/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const json = await req.json()

  if ('ativo' in json && Object.keys(json).length === 1) {
    const db = getDb(session.database_name)
    await db.query(
      `UPDATE tab_tipo_receita SET ativo=$1, updated_at=NOW() WHERE id=$2 AND empresa_id=$3`,
      [json.ativo, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const body = tipoReceitaSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)
  const db = getDb(session.database_name)

  const result = await db.query(
    `UPDATE tab_tipo_receita SET
       codigo=$1, descricao=$2, natureza=$3, conta_id=$4,
       ind_pis_cofins=$5, pai_id=$6, ativo=$7, updated_at=NOW()
     WHERE id=$8 AND empresa_id=$9`,
    [
      up(d.codigo),
      up(d.descricao),
      d.natureza,
      d.conta_id ?? null,
      d.ind_pis_cofins,
      d.pai_id ?? null,
      d.ativo,
      params.id,
      session.empresa_id_ativa,
    ],
  )

  if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/cadastro/tipos-receita/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const result = await db.query(
    `DELETE FROM tab_tipo_receita WHERE id=$1 AND empresa_id=$2`,
    [params.id, session.empresa_id_ativa],
  )

  if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
