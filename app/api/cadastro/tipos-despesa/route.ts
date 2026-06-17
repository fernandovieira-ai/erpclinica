import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { tipoDespesaSchema } from '@/lib/validators/tipo-despesa.schema'

// GET /api/cadastro/tipos-despesa?busca=&ativo=true&page=1&limit=50
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

  const conds: string[]   = [`td.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (ativo !== 'all') {
    conds.push(`td.ativo = $${pi++}`)
    params.push(ativo !== 'false')
  }
  if (busca) {
    conds.push(`(td.codigo ILIKE $${pi} OR td.descricao ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_tipo_despesa td ${where}`, params),
    db.query(
      `SELECT td.id, td.codigo, td.descricao, td.natureza,
              pc.descricao AS conta_desc, pc.codigo AS conta_codigo,
              td.ind_pis_cofins, td.ind_imposto, td.tipo_imposto,
              td.ind_capex, td.pai_id,
              p.descricao AS pai_desc, td.ativo
       FROM tab_tipo_despesa td
       LEFT JOIN tab_plano_contas pc ON pc.id = td.conta_id
       LEFT JOIN tab_tipo_despesa p  ON p.id  = td.pai_id
       ${where}
       ORDER BY td.codigo
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/cadastro/tipos-despesa
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = tipoDespesaSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)
  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `INSERT INTO tab_tipo_despesa
       (empresa_id, codigo, descricao, natureza, conta_id, ind_pis_cofins, ind_imposto, tipo_imposto, ind_capex, pai_id, ativo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      session.empresa_id_ativa,
      up(d.codigo),
      up(d.descricao),
      d.natureza,
      d.conta_id ?? null,
      d.ind_pis_cofins,
      d.ind_imposto,
      d.ind_imposto ? (d.tipo_imposto ?? null) : null,
      d.ind_capex,
      d.pai_id ?? null,
      d.ativo,
    ],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
