import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { taxaCartaoSchema } from '@/lib/validators/cartao.schema'

// GET /api/financeiro/cartao/taxas/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT t.id, t.condicao_pagamento_id, cp.descricao AS condicao_descricao,
            cp.adquirente, cp.bandeira,
            t.percentual_mdr, t.percentual_antecipacao_am, t.prazo_recebimento_dias,
            TO_CHAR(t.data_vigencia_inicio, 'YYYY-MM-DD') AS data_vigencia_inicio,
            TO_CHAR(t.data_vigencia_fim,    'YYYY-MM-DD') AS data_vigencia_fim,
            t.created_by, t.created_at
     FROM tab_taxa_cartao t
     JOIN tab_condicao_pagamento cp ON cp.id = t.condicao_pagamento_id
     WHERE t.id = $1 AND t.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/financeiro/cartao/taxas/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = taxaCartaoSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  const result = await db.query(
    `UPDATE tab_taxa_cartao
     SET condicao_pagamento_id=$1, percentual_mdr=$2, percentual_antecipacao_am=$3,
         prazo_recebimento_dias=$4, data_vigencia_inicio=$5, data_vigencia_fim=$6
     WHERE id=$7 AND empresa_id=$8`,
    [
      d.condicao_pagamento_id, d.percentual_mdr, d.percentual_antecipacao_am,
      d.prazo_recebimento_dias, d.data_vigencia_inicio, d.data_vigencia_fim || null,
      params.id, session.empresa_id_ativa,
    ],
  )

  if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/financeiro/cartao/taxas/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const result = await db.query(
    `DELETE FROM tab_taxa_cartao WHERE id=$1 AND empresa_id=$2`,
    [params.id, session.empresa_id_ativa],
  )

  if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
