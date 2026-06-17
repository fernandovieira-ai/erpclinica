import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { tipoDespesaSchema } from '@/lib/validators/tipo-despesa.schema'

// GET /api/cadastro/tipos-despesa/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT td.id, td.empresa_id, td.codigo, td.descricao, td.natureza,
            td.conta_id, pc.descricao AS conta_desc, pc.codigo AS conta_codigo,
            td.ind_pis_cofins, td.ind_imposto, td.tipo_imposto, td.ind_capex,
            td.pai_id, p.descricao AS pai_desc,
            td.ativo, td.created_at, td.updated_at
     FROM tab_tipo_despesa td
     LEFT JOIN tab_plano_contas pc ON pc.id = td.conta_id
     LEFT JOIN tab_tipo_despesa p  ON p.id  = td.pai_id
     WHERE td.id = $1 AND td.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/cadastro/tipos-despesa/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const json = await req.json()

  if ('ativo' in json && Object.keys(json).length === 1) {
    const db = getDb(session.database_name)
    await db.query(
      `UPDATE tab_tipo_despesa SET ativo=$1, updated_at=NOW() WHERE id=$2 AND empresa_id=$3`,
      [json.ativo, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const body = tipoDespesaSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)
  const db = getDb(session.database_name)

  const result = await db.query(
    `UPDATE tab_tipo_despesa SET
       codigo=$1, descricao=$2, natureza=$3, conta_id=$4,
       ind_pis_cofins=$5, ind_imposto=$6, tipo_imposto=$7,
       ind_capex=$8, pai_id=$9, ativo=$10, updated_at=NOW()
     WHERE id=$11 AND empresa_id=$12`,
    [
      up(d.codigo),
      up(d.descricao),
      d.natureza,
      d.conta_id ?? null,
      d.ind_pis_cofins,
      d.ind_imposto,
      d.ind_imposto ? (d.tipo_imposto ?? null) : null,
      d.ind_capex,
      d.pai_id ?? null,
      d.ativo,
      params.id,
      session.empresa_id_ativa,
    ],
  )

  if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/cadastro/tipos-despesa/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const result = await db.query(
    `DELETE FROM tab_tipo_despesa WHERE id=$1 AND empresa_id=$2`,
    [params.id, session.empresa_id_ativa],
  )

  if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
