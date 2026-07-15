import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// Venda no cartão é sempre gerada automaticamente pelo recebimento de
// consulta/receita/baixa de título (condição de pagamento débito/crédito)
// — não existe POST manual aqui, só consulta.

// GET /api/financeiro/cartao/vendas?busca=&status=&adquirente=&data_inicio=&data_fim=&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp          = req.nextUrl.searchParams
  const busca       = sp.get('busca')?.trim() || ''
  const status      = sp.get('status') || ''
  const adquirente  = sp.get('adquirente') || ''
  const data_inicio = sp.get('data_inicio') || ''
  const data_fim    = sp.get('data_fim') || ''
  const page        = Math.max(1, Number(sp.get('page') || 1))
  const limit       = Math.min(200, Number(sp.get('limit') || 50))
  const offset      = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = [`v.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (status) {
    conds.push(`v.status = $${pi++}`)
    params.push(status)
  }
  if (adquirente) {
    conds.push(`v.adquirente = $${pi++}`)
    params.push(adquirente)
  }
  if (data_inicio) {
    conds.push(`v.data_venda::date >= $${pi++}`)
    params.push(data_inicio)
  }
  if (data_fim) {
    conds.push(`v.data_venda::date <= $${pi++}`)
    params.push(data_fim)
  }
  if (busca) {
    conds.push(`(v.nsu ILIKE $${pi} OR v.codigo_autorizacao ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_venda_cartao v ${where}`, params),
    db.query(
      `SELECT v.id, cb.mnemonico AS conta_banco_desc, cp.descricao AS condicao_descricao,
              v.adquirente, v.bandeira, v.modalidade, v.qtd_parcelas, v.valor_bruto,
              v.nsu, TO_CHAR(v.data_venda, 'YYYY-MM-DD"T"HH24:MI:SS') AS data_venda, v.status,
              (SELECT CASE
                 WHEN v.status = 'CANCELADO' THEN 'CANCELADO'
                 WHEN count(*) FILTER (WHERE p.status = 'CONCILIADA') = count(*) THEN 'CONCILIADA'
                 WHEN count(*) FILTER (WHERE p.status IN ('FATURADA','CONCILIADA')) = count(*) THEN 'FATURADA'
                 WHEN count(*) FILTER (WHERE p.status IN ('FATURADA','CONCILIADA')) > 0 THEN 'PARCIAL'
                 ELSE 'PENDENTE'
               END
               FROM tab_venda_cartao_parcela p WHERE p.venda_cartao_id = v.id) AS status_parcelas
       FROM tab_venda_cartao v
       JOIN tab_conta_banco cb ON cb.id = v.conta_banco_id
       JOIN tab_condicao_pagamento cp ON cp.id = v.condicao_pagamento_id
       ${where}
       ORDER BY v.data_venda DESC, v.id DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}
