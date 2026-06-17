import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { planoContasSchema } from '@/lib/validators/plano-contas.schema'

// GET /api/cadastro/plano-contas?busca=&ativo=true&tipo=&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const busca  = sp.get('busca')?.trim() || ''
  const ativo  = sp.get('ativo') ?? 'true'
  const tipo   = sp.get('tipo') || ''
  const page   = Math.max(1, Number(sp.get('page') || 1))
  const limit  = Math.min(200, Number(sp.get('limit') || 50))
  const offset = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = [`pc.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (ativo !== 'all') {
    conds.push(`pc.ativo = $${pi++}`)
    params.push(ativo !== 'false')
  }
  if (tipo) {
    conds.push(`pc.tipo = $${pi++}`)
    params.push(tipo)
  }
  if (busca) {
    conds.push(`(pc.codigo ILIKE $${pi} OR pc.descricao ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_plano_contas pc ${where}`, params),
    db.query(
      `SELECT pc.id, pc.codigo, pc.descricao, pc.pai_id,
              p.descricao AS pai_desc, pc.tipo, pc.natureza,
              pc.classificacao, pc.grupo, pc.ativo
       FROM tab_plano_contas pc
       LEFT JOIN tab_plano_contas p ON p.id = pc.pai_id
       ${where}
       ORDER BY pc.codigo
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/cadastro/plano-contas
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = planoContasSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)
  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `INSERT INTO tab_plano_contas
       (empresa_id, codigo, descricao, pai_id, tipo, natureza, classificacao, grupo, ativo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      session.empresa_id_ativa,
      up(d.codigo),
      up(d.descricao),
      d.pai_id ?? null,
      d.tipo,
      d.natureza,
      d.classificacao,
      up(d.grupo) ?? null,
      d.ativo,
    ],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
