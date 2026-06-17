import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { contaBancoSchema } from '@/lib/validators/conta-banco.schema'

// GET /api/cadastro/contas-banco/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT cb.id, cb.empresa_id, cb.banco_id,
            b.nome AS banco_nome, b.codigo_compensacao AS banco_codigo,
            cb.mnemonico, cb.agencia, cb.agencia_dv, cb.conta, cb.conta_dv,
            cb.tipo, cb.nome_gerente, cb.telefone,
            cb.saldo_inicial, cb.saldo_atual, cb.num_convenio,
            cb.carteira, cb.limite, cb.ativo,
            cb.created_at, cb.updated_at
     FROM tab_conta_banco cb
     LEFT JOIN tab_banco b ON b.id = cb.banco_id
     WHERE cb.id = $1`,
    [params.id],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/cadastro/contas-banco/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const json = await req.json()

  if ('ativo' in json && Object.keys(json).length === 1) {
    const db = getDb(session.database_name)
    await db.query(
      `UPDATE tab_conta_banco SET ativo = $1, updated_at = NOW() WHERE id = $2`,
      [json.ativo, params.id],
    )
    return NextResponse.json({ ok: true })
  }

  const body = contaBancoSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const up = (v?: string | null) => (v ? v.toUpperCase() : v ?? null)
  const db = getDb(session.database_name)

  await db.query(
    `UPDATE tab_conta_banco SET
       banco_id=$1, mnemonico=$2, agencia=$3, agencia_dv=$4,
       conta=$5, conta_dv=$6, tipo=$7, nome_gerente=$8, telefone=$9,
       saldo_inicial=$10, num_convenio=$11, limite=$12,
       ativo=$13, updated_at=NOW()
     WHERE id = $14`,
    [
      d.banco_id,
      up(d.mnemonico),
      up(d.agencia),
      up(d.agencia_dv) ?? null,
      up(d.conta),
      up(d.conta_dv) ?? null,
      d.tipo,
      up(d.nome_gerente) ?? null,
      d.telefone || null,
      d.saldo_inicial,
      up(d.num_convenio) ?? null,
      d.limite,
      d.ativo,
      params.id,
    ],
  )

  return NextResponse.json({ ok: true })
}

// DELETE /api/cadastro/contas-banco/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const result = await db.query(
    `DELETE FROM tab_conta_banco WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (result.rowCount === 0)
    return NextResponse.json({ erro: 'Registro não encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
