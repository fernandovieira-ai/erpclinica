import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { centroCustoSchema } from '@/lib/validators/centro-custo.schema'

// GET /api/cadastro/centros-custo?busca=&ativo=true&page=1&limit=50
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

  const conds: string[]   = [`cc.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (ativo !== 'all') {
    conds.push(`cc.ativo = $${pi++}`)
    params.push(ativo !== 'false')
  }
  if (busca) {
    conds.push(`(cc.codigo ILIKE $${pi} OR cc.descricao ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS n FROM tab_centro_custo cc ${where}`,
      params,
    ),
    db.query(
      `SELECT cc.id, cc.codigo, cc.descricao, cc.pai_id,
              p.descricao AS pai_desc, cc.tipo, cc.ativo
       FROM tab_centro_custo cc
       LEFT JOIN tab_centro_custo p ON p.id = cc.pai_id
       ${where}
       ORDER BY cc.codigo
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/cadastro/centros-custo
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = centroCustoSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)
  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `INSERT INTO tab_centro_custo (empresa_id, codigo, descricao, pai_id, tipo, ativo)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      session.empresa_id_ativa,
      up(d.codigo),
      up(d.descricao),
      d.pai_id ?? null,
      d.tipo,
      d.ativo,
    ],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
