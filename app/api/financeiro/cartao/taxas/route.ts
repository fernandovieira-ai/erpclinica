import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { taxaCartaoSchema } from '@/lib/validators/cartao.schema'

// GET /api/financeiro/cartao/taxas?condicao_pagamento_id=&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp                  = req.nextUrl.searchParams
  const condicaoPagamentoId = sp.get('condicao_pagamento_id') || ''
  const page                = Math.max(1, Number(sp.get('page') || 1))
  const limit                = Math.min(200, Number(sp.get('limit') || 50))
  const offset               = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = [`t.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (condicaoPagamentoId) {
    conds.push(`t.condicao_pagamento_id = $${pi++}`)
    params.push(Number(condicaoPagamentoId))
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_taxa_cartao t ${where}`, params),
    db.query(
      `SELECT t.id, t.condicao_pagamento_id, cp.descricao AS condicao_descricao,
              cp.adquirente, cp.bandeira,
              t.percentual_mdr, t.percentual_antecipacao_am, t.prazo_recebimento_dias,
              TO_CHAR(t.data_vigencia_inicio, 'YYYY-MM-DD') AS data_vigencia_inicio,
              TO_CHAR(t.data_vigencia_fim,    'YYYY-MM-DD') AS data_vigencia_fim
       FROM tab_taxa_cartao t
       JOIN tab_condicao_pagamento cp ON cp.id = t.condicao_pagamento_id
       ${where}
       ORDER BY cp.descricao, t.data_vigencia_inicio DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/financeiro/cartao/taxas
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = taxaCartaoSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  // confere que a condição de pagamento pertence à empresa ativa e é de cartão
  const cond = await db.query(
    `SELECT tipo_pagamento FROM tab_condicao_pagamento WHERE id = $1 AND empresa_id = $2`,
    [d.condicao_pagamento_id, session.empresa_id_ativa],
  )
  if (!cond.rows.length) return NextResponse.json({ erro: 'Condição de pagamento não encontrada' }, { status: 404 })
  if (!['debito', 'credito'].includes(cond.rows[0].tipo_pagamento)) {
    return NextResponse.json({ erro: 'Condição de pagamento não é de Débito/Crédito' }, { status: 400 })
  }

  const { rows } = await db.query(
    `INSERT INTO tab_taxa_cartao
       (condicao_pagamento_id, percentual_mdr, percentual_antecipacao_am, prazo_recebimento_dias,
        data_vigencia_inicio, data_vigencia_fim, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      d.condicao_pagamento_id, d.percentual_mdr, d.percentual_antecipacao_am, d.prazo_recebimento_dias,
      d.data_vigencia_inicio, d.data_vigencia_fim || null, session.nome ?? null,
    ],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
