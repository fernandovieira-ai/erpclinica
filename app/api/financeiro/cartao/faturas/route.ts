import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/financeiro/cartao/faturas?status=&adquirente=&data_inicio=&data_fim=&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp          = req.nextUrl.searchParams
  const status      = sp.get('status') || ''
  const adquirente  = sp.get('adquirente') || ''
  const data_inicio = sp.get('data_inicio') || ''
  const data_fim    = sp.get('data_fim') || ''
  const page        = Math.max(1, Number(sp.get('page') || 1))
  const limit       = Math.min(200, Number(sp.get('limit') || 50))
  const offset      = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = [`f.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (status) {
    conds.push(`f.status = $${pi++}`)
    params.push(status)
  }
  if (adquirente) {
    conds.push(`f.adquirente = $${pi++}`)
    params.push(adquirente)
  }
  if (data_inicio) {
    conds.push(`f.data_prevista >= $${pi++}`)
    params.push(data_inicio)
  }
  if (data_fim) {
    conds.push(`f.data_prevista <= $${pi++}`)
    params.push(data_fim)
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_fatura_cartao f ${where}`, params),
    db.query(
      `SELECT f.id, cb.mnemonico AS conta_banco_desc, f.adquirente,
              TO_CHAR(f.data_prevista, 'YYYY-MM-DD') AS data_prevista,
              f.valor_previsto, f.valor_cobrado, f.qtd_parcelas, f.status, f.movimento_banco_id,
              TO_CHAR(agg.data_emissao_inicio, 'YYYY-MM-DD') AS data_emissao_inicio,
              TO_CHAR(agg.data_emissao_fim, 'YYYY-MM-DD')    AS data_emissao_fim,
              agg.nsus
       FROM tab_fatura_cartao f
       JOIN tab_conta_banco cb ON cb.id = f.conta_banco_id
       LEFT JOIN LATERAL (
         SELECT MIN(v.data_venda::date) AS data_emissao_inicio,
                MAX(v.data_venda::date) AS data_emissao_fim,
                string_agg(DISTINCT v.nsu, ', ' ORDER BY v.nsu) AS nsus
         FROM tab_venda_cartao_parcela p
         JOIN tab_venda_cartao v ON v.id = p.venda_cartao_id
         WHERE p.fatura_cartao_id = f.id
       ) agg ON true
       ${where}
       ORDER BY f.data_prevista DESC, f.id DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}
