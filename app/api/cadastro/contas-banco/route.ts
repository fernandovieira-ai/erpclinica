import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { contaBancoSchema } from '@/lib/validators/conta-banco.schema'

// GET /api/cadastro/contas-banco?busca=&ativo=true&page=1&limit=20
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

  const conds: string[]   = [`cb.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (ativo !== 'all') {
    conds.push(`cb.ativo = $${pi++}`)
    params.push(ativo !== 'false')
  }
  if (busca) {
    conds.push(`(cb.mnemonico ILIKE $${pi} OR b.nome ILIKE $${pi} OR b.codigo_compensacao ILIKE $${pi} OR cb.agencia ILIKE $${pi} OR cb.conta ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_conta_banco cb LEFT JOIN tab_banco b ON b.id = cb.banco_id ${where}`, params),
    db.query(
      `SELECT cb.id, cb.mnemonico, b.nome AS banco_nome, b.codigo_compensacao AS banco_codigo,
              cb.agencia, cb.conta, cb.tipo, cb.saldo_atual, cb.ativo
       FROM tab_conta_banco cb
       LEFT JOIN tab_banco b ON b.id = cb.banco_id
       ${where}
       ORDER BY cb.mnemonico
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/cadastro/contas-banco
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = contaBancoSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const up = (v?: string | null) => (v ? v.toUpperCase() : v ?? null)
  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `INSERT INTO tab_conta_banco (
       empresa_id, banco_id, mnemonico, agencia, agencia_dv,
       conta, conta_dv, tipo, nome_gerente, telefone,
       saldo_inicial, num_convenio, limite, ativo
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
     ) RETURNING id`,
    [
      session.empresa_id_ativa,
      d.banco_id,
      up(d.mnemonico),
      up(d.agencia),
      up(d.agencia_dv) ?? null,
      up(d.conta),
      up(d.conta_dv) ?? null,
      d.tipo,
      up(d.nome_gerente) ?? null,
      d.telefone || null,
      d.saldo_inicial,
      up(d.num_convenio) ?? null,
      d.limite,
      d.ativo,
    ],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
