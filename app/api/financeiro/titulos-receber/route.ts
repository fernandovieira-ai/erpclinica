import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { tituloReceberSchema } from '@/lib/validators/titulo-receber.schema'

// GET /api/financeiro/titulos-receber?busca=&status=&data_inicio=&data_fim=&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp          = req.nextUrl.searchParams
  const busca       = sp.get('busca')?.trim() || ''
  const status      = sp.get('status') || ''
  const data_inicio = sp.get('data_inicio') || ''
  const data_fim    = sp.get('data_fim') || ''
  const page        = Math.max(1, Number(sp.get('page') || 1))
  const limit       = Math.min(200, Number(sp.get('limit') || 50))
  const offset      = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = [`t.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (status) {
    conds.push(`t.status = $${pi++}`)
    params.push(status)
  }
  if (data_inicio) {
    conds.push(`t.data_vencimento >= $${pi++}`)
    params.push(data_inicio)
  }
  if (data_fim) {
    conds.push(`t.data_vencimento <= $${pi++}`)
    params.push(data_fim)
  }
  if (busca) {
    conds.push(`(t.numero_titulo ILIKE $${pi} OR t.num_documento ILIKE $${pi} OR p.nome ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS n
       FROM tab_titulo_receber t
       LEFT JOIN tab_pessoa p ON p.id = t.pessoa_id
       ${where}`,
      params,
    ),
    db.query(
      `SELECT t.id,
              t.numero_titulo,
              t.num_documento,
              p.nome                AS pessoa_nome,
              tr.descricao          AS tipo_receita_desc,
              tc.des_tipo_cobranca  AS tipo_cobranca_desc,
              cc.descricao          AS centro_custo_desc,
              TO_CHAR(t.data_emissao,    'YYYY-MM-DD') AS data_emissao,
              TO_CHAR(t.data_vencimento, 'YYYY-MM-DD') AS data_vencimento,
              TO_CHAR(t.data_liquidacao, 'YYYY-MM-DD') AS data_liquidacao,
              t.valor_original,
              t.valor_liquidado,
              t.status
       FROM tab_titulo_receber t
       LEFT JOIN tab_pessoa        p  ON p.id  = t.pessoa_id
       LEFT JOIN tab_tipo_receita  tr ON tr.id = t.tipo_receita_id
       LEFT JOIN tab_tipo_cobranca tc ON tc.cod_tipo_cobranca = t.cod_tipo_cobranca
       LEFT JOIN tab_centro_custo  cc ON cc.id = t.centro_custo_id
       ${where}
       ORDER BY t.data_vencimento DESC, t.id DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/financeiro/titulos-receber
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const raw  = await req.json()
  const body = tituloReceberSchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)
  const dt = (v?: string | null) => (v && v.trim() ? v : null)

  const { rows } = await db.query(
    `INSERT INTO tab_titulo_receber
       (empresa_id, pessoa_id, tipo_receita_id, cod_tipo_cobranca,
        centro_custo_id, conta_banco_id, receita_id,
        numero_titulo, num_documento,
        data_emissao, data_vencimento, data_liquidacao, data_competencia,
        valor_original, valor_juros, valor_multa, valor_desconto,
        valor_retencao, valor_liquidado,
        destino_liquidacao, conta_banco_liq_id,
        status, codigo_barras, nosso_numero, observacao, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
     RETURNING id`,
    [
      session.empresa_id_ativa,
      d.pessoa_id,
      d.tipo_receita_id   ?? null,
      d.cod_tipo_cobranca ?? null,
      d.centro_custo_id   ?? null,
      d.conta_banco_id    ?? null,
      d.receita_id        ?? null,
      d.numero_titulo     ?? null,
      d.num_documento     ?? null,
      d.data_emissao,
      d.data_vencimento,
      dt(d.data_liquidacao),
      dt(d.data_competencia),
      d.valor_original,
      d.valor_juros    ?? 0,
      d.valor_multa    ?? 0,
      d.valor_desconto ?? 0,
      d.valor_retencao ?? 0,
      d.valor_liquidado ?? 0,
      d.destino_liquidacao ?? null,
      d.conta_banco_liq_id ?? null,
      d.status ?? 'A',
      d.codigo_barras ?? null,
      d.nosso_numero  ?? null,
      d.observacao    ?? null,
      session.nome    ?? null,
    ],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
