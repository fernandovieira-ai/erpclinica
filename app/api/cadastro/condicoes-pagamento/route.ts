import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { condicaoPagamentoSchema } from '@/lib/validators/condicao-pagamento.schema'

// GET /api/cadastro/condicoes-pagamento?busca=&ativo=true&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const busca  = sp.get('busca')?.trim() || ''
  const ativo  = sp.get('ativo') ?? 'true'
  const page   = Math.max(1, Number(sp.get('page') || 1))
  const limit  = Math.min(200, Number(sp.get('limit') || 50))
  const offset = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = [`cp.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (ativo !== 'all') {
    conds.push(`cp.ativo = $${pi++}`)
    params.push(ativo !== 'false')
  }
  if (busca) {
    conds.push(`cp.descricao ILIKE $${pi++}`)
    params.push(`%${busca}%`)
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_condicao_pagamento cp ${where}`, params),
    db.query(
      `SELECT cp.id, cp.descricao, cp.tipo, cp.num_parcelas, cp.intervalo_dias, cp.entrada_pct, cp.ativo
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

  const numParcelas   = d.tipo === 'V' ? 1  : d.num_parcelas
  const intervaloDias = d.tipo === 'V' ? 0  : d.intervalo_dias
  const entradaPct    = d.tipo === 'V' ? 0  : d.entrada_pct

  const { rows } = await db.query(
    `INSERT INTO tab_condicao_pagamento
       (empresa_id, descricao, tipo, num_parcelas, intervalo_dias, entrada_pct, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [session.empresa_id_ativa, d.descricao.toUpperCase(), d.tipo, numParcelas, intervaloDias, entradaPct, d.ativo],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
