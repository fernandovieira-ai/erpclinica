import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { movimentoBancoSchema } from '@/lib/validators/movimento-banco.schema'

// GET /api/financeiro/movimento-banco?busca=&tipo=&conciliado=&conta_banco_id=&data_inicio=&data_fim=&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp             = req.nextUrl.searchParams
  const busca          = sp.get('busca')?.trim() || ''
  const tipo           = sp.get('tipo') || ''
  const conciliado     = sp.get('conciliado') || ''
  const conta_banco_id = sp.get('conta_banco_id') || ''
  const data_inicio    = sp.get('data_inicio') || ''
  const data_fim       = sp.get('data_fim') || ''
  const page           = Math.max(1, Number(sp.get('page') || 1))
  const limit          = Math.min(200, Number(sp.get('limit') || 50))
  const offset         = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = [`mb.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (conta_banco_id) {
    conds.push(`mb.conta_banco_id = $${pi++}`)
    params.push(Number(conta_banco_id))
  }
  if (tipo) {
    conds.push(`mb.tipo = $${pi++}`)
    params.push(tipo)
  }
  if (conciliado === 'true') {
    conds.push(`mb.conciliado = true`)
  } else if (conciliado === 'false') {
    conds.push(`mb.conciliado = false`)
  }
  if (data_inicio) {
    conds.push(`mb.data_movimento >= $${pi++}`)
    params.push(data_inicio)
  }
  if (data_fim) {
    conds.push(`mb.data_movimento <= $${pi++}`)
    params.push(data_fim)
  }
  if (busca) {
    conds.push(`(mb.documento ILIKE $${pi} OR p.nome ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = 'WHERE ' + conds.join(' AND ')

  // Query otimizada: evita N+1 usando CTE para limitar primeiro, depois faz JOINs
  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS n
       FROM tab_movimento_banco mb
       ${where}`,
      params,
    ),
    db.query(
      `WITH mb_limitado AS (
        SELECT mb.* FROM tab_movimento_banco mb
        ${where}
        ORDER BY mb.data_movimento DESC, mb.id DESC
        LIMIT $${pi} OFFSET $${pi + 1}
      )
       SELECT mb.id,
              mb.conta_banco_id,
              cb.mnemonico          AS conta_banco_desc,
              toc.descricao         AS tipo_operacao_desc,
              p.nome                AS pessoa_nome,
              mb.titulo_pagar_id,
              mb.titulo_receber_id,
              mb.despesa_id,
              mb.receita_id,
              mb.tipo,
              mb.valor,
              TO_CHAR(mb.data_movimento, 'YYYY-MM-DD') AS data_movimento,
              mb.documento,
              mb.conciliado,
              mb.origem_modulo,
              CASE
                WHEN mb.origem_modulo = 'CLI'    THEN 'Clínica'
                WHEN mb.origem_modulo = 'REC'    THEN 'Recebimento'
                WHEN mb.origem_modulo = 'CARTAO' THEN 'Cartão'
                WHEN mb.titulo_pagar_id   IS NOT NULL THEN 'Tít. Pagar'
                WHEN mb.titulo_receber_id IS NOT NULL THEN 'Tít. Receber'
                WHEN mb.despesa_id        IS NOT NULL THEN 'Despesa'
                WHEN mb.receita_id        IS NOT NULL THEN 'Receita'
                ELSE 'Manual'
              END AS origem_tipo,
              CASE
                WHEN mb.origem_modulo = 'CLI'    THEN COALESCE(mb.observacao, 'Recebimento de consulta')
                WHEN mb.origem_modulo = 'REC'    THEN 'RECEBIMENTO (Clínica)'
                WHEN mb.origem_modulo = 'CARTAO' THEN mb.observacao
                WHEN mb.titulo_pagar_id IS NOT NULL THEN
                  COALESCE(td_tp.descricao, tp.num_documento, tp.numero_titulo)
                WHEN mb.titulo_receber_id IS NOT NULL THEN
                  COALESCE(tr_trec.descricao, trec.num_documento, trec.numero_titulo)
                WHEN mb.despesa_id IS NOT NULL THEN
                  COALESCE(td_desp.descricao, desp.documento)
                WHEN mb.receita_id IS NOT NULL THEN
                  tr_rec.descricao
                ELSE NULL
              END AS origem_desc
       FROM mb_limitado mb
       JOIN  tab_conta_banco         cb      ON cb.id      = mb.conta_banco_id
       LEFT JOIN tab_tipo_operacao_caixa toc ON toc.id     = mb.tipo_operacao_id
       LEFT JOIN tab_pessoa               p   ON p.id      = mb.pessoa_id
       LEFT JOIN tab_titulo_pagar         tp      ON tp.id   = mb.titulo_pagar_id
       LEFT JOIN tab_tipo_despesa         td_tp   ON td_tp.id = tp.tipo_despesa_id
       LEFT JOIN tab_titulo_receber       trec    ON trec.id  = mb.titulo_receber_id
       LEFT JOIN tab_tipo_receita         tr_trec ON tr_trec.id = trec.tipo_receita_id
       LEFT JOIN tab_despesa              desp    ON desp.id  = mb.despesa_id
       LEFT JOIN tab_tipo_despesa         td_desp ON td_desp.id = desp.tipo_despesa_id
       LEFT JOIN tab_receita              rec     ON rec.id   = mb.receita_id
       LEFT JOIN tab_tipo_receita         tr_rec  ON tr_rec.id = rec.tipo_receita_id
       ORDER BY mb.data_movimento DESC, mb.id DESC`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/financeiro/movimento-banco
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const raw  = await req.json()
  const body = movimentoBancoSchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)
  const dt = (v?: string | null) => (v && v.trim() ? v : null)
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)

  const { rows } = await db.query(
    `INSERT INTO tab_movimento_banco
       (empresa_id, conta_banco_id, tipo_operacao_id, pessoa_id,
        tipo, valor, data_movimento, data_predatado, data_referencia,
        documento, observacao, conciliado, data_conciliacao, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      session.empresa_id_ativa,
      d.conta_banco_id,
      d.tipo_operacao_id   ?? null,
      d.pessoa_id          ?? null,
      d.tipo,
      d.valor,
      d.data_movimento,
      dt(d.data_predatado),
      dt(d.data_referencia),
      up(d.documento),
      d.observacao         ?? null,
      d.conciliado         ?? false,
      dt(d.data_conciliacao),
      session.nome         ?? null,
    ],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
