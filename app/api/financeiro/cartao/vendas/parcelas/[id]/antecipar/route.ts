import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { antecipaParcelaCartaoSchema } from '@/lib/validators/cartao.schema'

// POST /api/financeiro/cartao/vendas/parcelas/[id]/antecipar  — body: { nova_data_prevista: string }
// Aplica a taxa de antecipação (percentual_antecipacao_am da condição, pro-rata
// pelos dias antecipados) sobre o valor líquido atual da parcela e adianta a
// data prevista. Só funciona em parcelas PENDENTE (ainda não faturadas).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = antecipaParcelaCartaoSchema.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const db = getDb(session.database_name)

  const parcela = await db.query(
    `SELECT p.id FROM tab_venda_cartao_parcela p
     JOIN tab_venda_cartao v ON v.id = p.venda_cartao_id
     WHERE p.id = $1 AND v.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )
  if (!parcela.rows.length) return NextResponse.json({ erro: 'Parcela não encontrada' }, { status: 404 })

  try {
    const { rows } = await db.query(
      `SELECT * FROM fn_antecipar_parcela_cartao($1, $2, $3)`,
      [params.id, body.data.nova_data_prevista, session.nome ?? null],
    )
    return NextResponse.json(rows[0])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao antecipar parcela'
    return NextResponse.json({ erro: message }, { status: 400 })
  }
}
