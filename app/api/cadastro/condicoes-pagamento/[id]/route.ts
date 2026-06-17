import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { condicaoPagamentoSchema } from '@/lib/validators/condicao-pagamento.schema'

// GET /api/cadastro/condicoes-pagamento/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT id, empresa_id, descricao, tipo, num_parcelas, intervalo_dias, entrada_pct, ativo, created_at
     FROM tab_condicao_pagamento
     WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/cadastro/condicoes-pagamento/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const json = await req.json()

  if ('ativo' in json && Object.keys(json).length === 1) {
    const db = getDb(session.database_name)
    await db.query(
      `UPDATE tab_condicao_pagamento SET ativo=$1 WHERE id=$2 AND empresa_id=$3`,
      [json.ativo, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const body = condicaoPagamentoSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d             = body.data
  const numParcelas   = d.tipo === 'V' ? 1 : d.num_parcelas
  const intervaloDias = d.tipo === 'V' ? 0 : d.intervalo_dias
  const entradaPct    = d.tipo === 'V' ? 0 : d.entrada_pct
  const db            = getDb(session.database_name)

  const result = await db.query(
    `UPDATE tab_condicao_pagamento
     SET descricao=$1, tipo=$2, num_parcelas=$3, intervalo_dias=$4, entrada_pct=$5, ativo=$6
     WHERE id=$7 AND empresa_id=$8`,
    [d.descricao.toUpperCase(), d.tipo, numParcelas, intervaloDias, entradaPct, d.ativo, params.id, session.empresa_id_ativa],
  )

  if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/cadastro/condicoes-pagamento/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const result = await db.query(
    `DELETE FROM tab_condicao_pagamento WHERE id=$1 AND empresa_id=$2`,
    [params.id, session.empresa_id_ativa],
  )

  if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
