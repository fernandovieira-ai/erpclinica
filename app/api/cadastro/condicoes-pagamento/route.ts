import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { condicaoPagamentoSchema } from '@/lib/validators/condicao-pagamento.schema'

// GET /api/cadastro/condicoes-pagamento?busca=&ativo=true&tipo_pagamento=&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp            = req.nextUrl.searchParams
  const busca         = sp.get('busca')?.trim() || ''
  const ativo         = sp.get('ativo') ?? 'true'
  const tipoPagamento = sp.get('tipo_pagamento') || ''
  const page          = Math.max(1, Number(sp.get('page') || 1))
  const limit         = Math.min(200, Number(sp.get('limit') || 50))
  const offset        = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = [`cp.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (ativo !== 'all') {
    conds.push(`cp.ativo = $${pi++}`)
    params.push(ativo !== 'false')
  }
  if (tipoPagamento) {
    conds.push(`cp.tipo_pagamento = $${pi++}`)
    params.push(tipoPagamento)
  }
  if (busca) {
    conds.push(`cp.descricao ILIKE $${pi++}`)
    params.push(`%${busca}%`)
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_condicao_pagamento cp ${where}`, params),
    db.query(
      `SELECT cp.id, cp.descricao, cp.tipo, cp.num_parcelas, cp.intervalo_dias, cp.entrada_pct, cp.tipo_pagamento, cp.adquirente, cp.bandeira, cp.ativo
       FROM tab_condicao_pagamento cp
       ${where}
       ORDER BY cp.descricao
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/cadastro/condicoes-pagamento
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = condicaoPagamentoSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  // Crédito: num_parcelas passa a significar o máximo de parcelas que o
  // operador poderá escolher no recebimento (independe do campo tipo V/P).
  // Débito e demais tipos mantêm a regra original: tipo='V' força 1 parcela.
  const isCredito     = d.tipo_pagamento === 'credito'
  const numParcelas   = isCredito ? d.num_parcelas   : (d.tipo === 'V' ? 1 : d.num_parcelas)
  const intervaloDias = isCredito ? d.intervalo_dias : (d.tipo === 'V' ? 0 : d.intervalo_dias)
  const entradaPct    = d.tipo === 'V' ? 0  : d.entrada_pct
  const up            = (v?: string | null) => (v ? v.toUpperCase() : null)

  const { rows } = await db.query(
    `INSERT INTO tab_condicao_pagamento
       (empresa_id, descricao, tipo, num_parcelas, intervalo_dias, entrada_pct, tipo_pagamento, conta_banco_pix_id, conta_banco_cartao_id, adquirente, bandeira, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [session.empresa_id_ativa, d.descricao.toUpperCase(), d.tipo, numParcelas, intervaloDias, entradaPct, d.tipo_pagamento, d.conta_banco_pix_id || null, d.conta_banco_cartao_id || null, up(d.adquirente), d.bandeira.toUpperCase(), d.ativo],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
