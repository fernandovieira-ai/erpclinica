import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/medicamentos/apresentacoes?codigo_produto=X — apresentações de um medicamento
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const codigoProduto = req.nextUrl.searchParams.get('codigo_produto')?.trim() ?? ''
  if (!codigoProduto) return NextResponse.json({ dados: [] })

  const db = getDb(session.database_name)

  try {
    const { rows } = await db.query(
      `SELECT codigo_apresentacao, TRIM(descricao) AS descricao, forma_farmaceutica, quantidade
       FROM tab_medicamento_apresentacao
       WHERE codigo_produto = $1 AND ativa = TRUE
       ORDER BY descricao
       LIMIT 40`,
      [codigoProduto],
    )
    return NextResponse.json({ dados: rows })
  } catch {
    return NextResponse.json({ dados: [] })
  }
}
