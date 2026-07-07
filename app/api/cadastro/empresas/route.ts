import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { empresaSchema } from '@/lib/validators/empresa.schema'

// GET /api/cadastro/empresas?busca=&ativo=true&page=1&limit=20
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const busca  = sp.get('busca')?.trim() || ''
  const ativo  = sp.get('ativo') ?? 'true'
  const page   = Math.max(1, Number(sp.get('page') || 1))
  const limit  = Math.min(100, Number(sp.get('limit') || 20))
  const offset = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = []
  const params: unknown[] = []
  let pi = 1

  if (ativo !== 'all') {
    conds.push(`e.ativo = $${pi++}`)
    params.push(ativo !== 'false')
  }
  if (busca) {
    conds.push(`(e.razao_social ILIKE $${pi} OR e.cnpj ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_empresa e ${where}`, params),
    db.query(
      `SELECT e.id, e.razao_social, e.nome_fantasia, e.cnpj,
              e.cidade, e.uf, e.telefone, e.ativo
       FROM tab_empresa e ${where}
       ORDER BY e.razao_social
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/cadastro/empresas
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = empresaSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const up = (v?: string | null) => (v ? v.toUpperCase() : v ?? null)
  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `INSERT INTO tab_empresa (
       razao_social, nome_fantasia, cnpj, ie, im,
       regime_tributario, crt,
       cep, logradouro, numero, complemento, bairro, cidade, uf, cod_ibge,
       telefone, email, email_nfe,
       ambiente_nfe, serie_nfe, prox_num_nfe,
       serie_nfce, prox_num_nfce, csc_nfce, id_token_nfce,
       voa_auth_token, voa_ambiente,
       ativo
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
       $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
     ) RETURNING id`,
    [
      up(d.razao_social), up(d.nome_fantasia), up(d.cnpj), up(d.ie), up(d.im),
      d.regime_tributario, d.crt,
      up(d.cep), up(d.logradouro), up(d.numero), up(d.complemento),
      up(d.bairro), up(d.cidade), up(d.uf), d.cod_ibge ?? null,
      d.telefone ?? null, d.email || null, d.email_nfe || null,
      d.ambiente_nfe, d.serie_nfe, d.prox_num_nfe,
      d.serie_nfce, d.prox_num_nfce, d.csc_nfce ?? null, d.id_token_nfce ?? null,
      d.voa_auth_token || null, d.voa_ambiente,
      d.ativo,
    ],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
