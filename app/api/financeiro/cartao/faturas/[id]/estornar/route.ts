import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// POST /api/financeiro/cartao/faturas/[id]/estornar
// Decide a ação pelo status atual da fatura:
//   CONFIRMADA -> estorna a confirmação (apaga o movimento bancário, volta parcelas pra FATURADA)
//   ABERTA     -> cancela a fatura (desfaz a geração, parcelas voltam pra PENDENTE p/ re-agrupar)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)

  const fatura = await db.query(
    `SELECT id FROM tab_fatura_cartao WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )
  if (!fatura.rows.length) {
    return NextResponse.json({ erro: 'Fatura não encontrada' }, { status: 404 })
  }

  try {
    const { rows } = await db.query(
      `SELECT fn_estornar_fatura_cartao($1, $2) AS acao`,
      [params.id, session.nome ?? null],
    )
    return NextResponse.json({ acao: rows[0].acao })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao estornar fatura'
    return NextResponse.json({ erro: message }, { status: 400 })
  }
}
