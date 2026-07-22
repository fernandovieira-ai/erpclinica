import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { agendamentoTipoSchema } from '@/lib/validators/agendamento.schema'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const url    = new URL(req.url)
  const busca  = url.searchParams.get('busca') ?? ''
  const ativo  = url.searchParams.get('ativo') ?? 'true'
  const page   = Math.max(1, Number(url.searchParams.get('page') ?? '1'))
  const limit  = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '50')))
  const offset = (page - 1) * limit

  const db = getDb(session.database_name)

  const conditions = ['empresa_id = $1']
  const params: unknown[] = [session.empresa_id_ativa]

  if (ativo !== 'all') {
    params.push(ativo === 'true')
    conditions.push(`ativo = $${params.length}`)
  }
  if (busca.trim()) {
    params.push(`%${busca.trim().toUpperCase()}%`)
    conditions.push(`UPPER(descricao) LIKE $${params.length}`)
  }

  const where = conditions.join(' AND ')

  const [{ rows }, { rows: cnt }] = await Promise.all([
    db.query(
      `SELECT id, descricao, duracao_min, cor, valor, ativo, voa_clinical_type
       FROM tab_agendamento_tipo
       WHERE ${where}
       ORDER BY descricao
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM tab_agendamento_tipo WHERE ${where}`, params),
  ])

  const total = cnt[0].total
  return NextResponse.json({ dados: rows, total, pages: Math.ceil(total / limit) })
}

export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = agendamentoTipoSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `INSERT INTO tab_agendamento_tipo (empresa_id, descricao, duracao_min, cor, valor, voa_clinical_type)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [session.empresa_id_ativa, d.descricao.toUpperCase(), d.duracao_min, d.cor, d.valor ?? null, d.voa_clinical_type ?? null],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
