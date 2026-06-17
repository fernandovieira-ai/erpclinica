import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { tipoCobrancaSchema } from '@/lib/validators/forma-pagamento.schema'

// GET /api/cadastro/formas-pagamento?busca=&ativo=true&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp    = req.nextUrl.searchParams
  const busca = sp.get('busca')?.trim() || ''
  const ativo = sp.get('ativo') ?? 'true'
  const page  = Math.max(1, Number(sp.get('page') || 1))
  const limit = Math.min(200, Number(sp.get('limit') || 50))
  const offset = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = []
  const params: unknown[] = []
  let pi = 1

  if (ativo !== 'all') {
    conds.push(`tc.ind_status = $${pi++}`)
    params.push(ativo !== 'false' ? 'A' : 'I')
  }
  if (busca) {
    conds.push(`tc.des_tipo_cobranca ILIKE $${pi}`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_tipo_cobranca tc ${where}`, params),
    db.query(
      `SELECT tc.cod_tipo_cobranca AS id, tc.cod_tipo_cobranca, tc.des_tipo_cobranca, tc.ind_status
       FROM tab_tipo_cobranca tc
       ${where}
       ORDER BY tc.cod_tipo_cobranca
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/cadastro/formas-pagamento
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = tipoCobrancaSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `INSERT INTO tab_tipo_cobranca (cod_tipo_cobranca, des_tipo_cobranca, ind_status)
     VALUES ($1, $2, $3)
     RETURNING cod_tipo_cobranca AS id`,
    [d.cod_tipo_cobranca, d.des_tipo_cobranca.toUpperCase(), d.ind_status],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}

