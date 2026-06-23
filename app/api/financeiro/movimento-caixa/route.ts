import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { movimentoCaixaSchema } from '@/lib/validators/movimento-caixa.schema'

// GET /api/financeiro/movimento-caixa?busca=&tipo=&conciliado=&data_inicio=&data_fim=&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp          = req.nextUrl.searchParams
  const busca       = sp.get('busca')?.trim() || ''
  const tipo        = sp.get('tipo') || ''
  const conciliado  = sp.get('conciliado') || ''
  const data_inicio = sp.get('data_inicio') || ''
  const data_fim    = sp.get('data_fim') || ''
  const page        = Math.max(1, Number(sp.get('page') || 1))
  const limit       = Math.min(200, Number(sp.get('limit') || 50))
  const offset      = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = [`mc.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (tipo) {
    conds.push(`mc.tipo = $${pi++}`)
    params.push(tipo)
  }
  if (conciliado === 'true') {
    conds.push(`mc.conciliado = true`)
  } else if (conciliado === 'false') {
    conds.push(`mc.conciliado = false`)
  }
  if (data_inicio) {
    conds.push(`mc.data_movimento >= $${pi++}`)
    params.push(data_inicio)
  }
  if (data_fim) {
    conds.push(`mc.data_movimento <= $${pi++}`)
    params.push(data_fim)
  }
  if (busca) {
    conds.push(`(mc.documento ILIKE $${pi} OR p.nome ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS n
       FROM tab_movimento_caixa mc
       LEFT JOIN tab_pessoa p ON p.id = mc.pessoa_id
       ${where}`,
      params,
    ),
    db.query(
      `SELECT mc.id,
              toc.descricao         AS tipo_operacao_desc,
              p.nome                AS pessoa_nome,
              mc.titulo_pagar_id,
              mc.titulo_receber_id,
              mc.despesa_id,
              mc.receita_id,
              mc.tipo,
              mc.valor,
              TO_CHAR(mc.data_movimento, 'YYYY-MM-DD') AS data_movimento,
              mc.documento,
              mc.conciliado,
              mc.origem_modulo,
              CASE
                WHEN mc.origem_modulo = 'REC' THEN 'Recebimento'
                WHEN mc.titulo_pagar_id   IS NOT NULL THEN 'Tít. Pagar'
                WHEN mc.titulo_receber_id IS NOT NULL THEN 'Tít. Receber'
                WHEN mc.despesa_id        IS NOT NULL THEN 'Despesa'
                WHEN mc.receita_id        IS NOT NULL THEN 'Receita'
                ELSE 'Manual'
              END AS origem_tipo,
              CASE
                WHEN mc.origem_modulo = 'REC' THEN 'RECEBIMENTO (Clínica)'
                WHEN mc.titulo_pagar_id IS NOT NULL THEN
                  COALESCE(td_tp.descricao, tp.num_documento, tp.numero_titulo)
                WHEN mc.titulo_receber_id IS NOT NULL THEN
                  COALESCE(tr_trec.descricao, trec.num_documento, trec.numero_titulo)
                WHEN mc.despesa_id IS NOT NULL THEN
                  COALESCE(td_desp.descricao, desp.documento)
                WHEN mc.receita_id IS NOT NULL THEN
                  tr_rec.descricao
                ELSE NULL
              END AS origem_desc
       FROM tab_movimento_caixa mc
       LEFT JOIN tab_tipo_operacao_caixa toc ON toc.id     = mc.tipo_operacao_id
       LEFT JOIN tab_pessoa               p   ON p.id      = mc.pessoa_id
       LEFT JOIN tab_titulo_pagar         tp      ON tp.id   = mc.titulo_pagar_id
       LEFT JOIN tab_tipo_despesa         td_tp   ON td_tp.id = tp.tipo_despesa_id
       LEFT JOIN tab_titulo_receber       trec    ON trec.id  = mc.titulo_receber_id
       LEFT JOIN tab_tipo_receita         tr_trec ON tr_trec.id = trec.tipo_receita_id
       LEFT JOIN tab_despesa              desp    ON desp.id  = mc.despesa_id
       LEFT JOIN tab_tipo_despesa         td_desp ON td_desp.id = desp.tipo_despesa_id
       LEFT JOIN tab_receita              rec     ON rec.id   = mc.receita_id
       LEFT JOIN tab_tipo_receita         tr_rec  ON tr_rec.id = rec.tipo_receita_id
       ${where}
       ORDER BY mc.data_movimento DESC, mc.id DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/financeiro/movimento-caixa
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const raw  = await req.json()
  const body = movimentoCaixaSchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)
  const dt = (v?: string | null) => (v && v.trim() ? v : null)
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)

  const { rows } = await db.query(
    `INSERT INTO tab_movimento_caixa
       (empresa_id, tipo_operacao_id, pessoa_id,
        tipo, valor, data_movimento,
        documento, observacao, conciliado, data_conciliacao, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      session.empresa_id_ativa,
      d.tipo_operacao_id   ?? null,
      d.pessoa_id          ?? null,
      d.tipo,
      d.valor,
      d.data_movimento,
      up(d.documento),
      d.observacao         ?? null,
      d.conciliado         ?? false,
      dt(d.data_conciliacao),
      session.nome         ?? null,
    ],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
