import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/cadastro/bancos?busca=&ativo=true
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp    = req.nextUrl.searchParams
  const busca = sp.get('busca')?.trim() || ''
  const ativo = sp.get('ativo') ?? 'true'

  const db = getDb(session.database_name)

  const conds: string[]   = []
  const params: unknown[] = []
  let pi = 1

  if (ativo !== 'all') {
    conds.push(`ativo = $${pi++}`)
    params.push(ativo !== 'false')
  }
  if (busca) {
    conds.push(`(codigo_compensacao ILIKE $${pi} OR nome ILIKE $${pi} OR nome_curto ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

  const { rows } = await db.query(
    `SELECT id, codigo_compensacao, nome, nome_curto, ativo
     FROM tab_banco ${where}
     ORDER BY codigo_compensacao`,
    params,
  )

  return NextResponse.json(rows)
}
