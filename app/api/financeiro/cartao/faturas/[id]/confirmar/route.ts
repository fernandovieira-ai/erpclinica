import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { confirmarFaturaCartaoSchema } from '@/lib/validators/cartao.schema'

// POST /api/financeiro/cartao/faturas/[id]/confirmar
// Confere o valor que a operadora realmente cobrou/depositou (se
// divergente do previsto) e gera o movimento bancário de entrada.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = confirmarFaturaCartaoSchema.safeParse(await req.json().catch(() => ({})))
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const db = getDb(session.database_name)

  const fatura = await db.query(
    `SELECT id FROM tab_fatura_cartao WHERE id = $1 AND empresa_id = $2 AND status = 'ABERTA'`,
    [params.id, session.empresa_id_ativa],
  )
  if (!fatura.rows.length) {
    return NextResponse.json({ erro: 'Fatura não encontrada ou já confirmada' }, { status: 400 })
  }

  try {
    const { rows } = await db.query(
      `SELECT fn_confirmar_fatura_cartao($1, $2, $3) AS movimento_banco_id`,
      [params.id, body.data.valor_cobrado ?? null, session.nome ?? null],
    )
    return NextResponse.json({ movimento_banco_id: rows[0].movimento_banco_id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao confirmar fatura'
    return NextResponse.json({ erro: message }, { status: 400 })
  }
}
