import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// POST /api/financeiro/cartao/vendas/parcelas/[id]/estornar-antecipacao
// Desfaz a antecipação: volta valor_liquido/data_prevista para o snapshot
// original (o que existia antes de qualquer antecipação).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)

  const parcela = await db.query(
    `SELECT p.id FROM tab_venda_cartao_parcela p
     JOIN tab_venda_cartao v ON v.id = p.venda_cartao_id
     WHERE p.id = $1 AND v.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )
  if (!parcela.rows.length) return NextResponse.json({ erro: 'Parcela não encontrada' }, { status: 404 })

  try {
    await db.query(`SELECT fn_estornar_antecipacao_parcela_cartao($1)`, [params.id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao estornar antecipação'
    return NextResponse.json({ erro: message }, { status: 400 })
  }
}
