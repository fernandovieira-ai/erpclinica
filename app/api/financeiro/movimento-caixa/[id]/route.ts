import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { movimentoCaixaSchema } from '@/lib/validators/movimento-caixa.schema'

// GET /api/financeiro/movimento-caixa/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT mc.id, mc.empresa_id,
            mc.tipo_operacao_id, toc.descricao         AS tipo_operacao_desc,
            mc.pessoa_id,        p.nome                AS pessoa_nome,
            mc.titulo_pagar_id,
            mc.titulo_receber_id,
            mc.despesa_id,
            mc.receita_id,
            mc.tipo,
            mc.valor,
            TO_CHAR(mc.data_movimento,   'YYYY-MM-DD') AS data_movimento,
            mc.documento,
            mc.observacao,
            mc.conciliado,
            TO_CHAR(mc.data_conciliacao, 'YYYY-MM-DD') AS data_conciliacao,
            mc.created_by,
            mc.created_at,
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
     LEFT JOIN tab_pessoa               p  ON p.id       = mc.pessoa_id
     LEFT JOIN tab_titulo_pagar         tp      ON tp.id   = mc.titulo_pagar_id
     LEFT JOIN tab_tipo_despesa         td_tp   ON td_tp.id = tp.tipo_despesa_id
     LEFT JOIN tab_titulo_receber       trec    ON trec.id  = mc.titulo_receber_id
     LEFT JOIN tab_tipo_receita         tr_trec ON tr_trec.id = trec.tipo_receita_id
     LEFT JOIN tab_despesa              desp    ON desp.id  = mc.despesa_id
     LEFT JOIN tab_tipo_despesa         td_desp ON td_desp.id = desp.tipo_despesa_id
     LEFT JOIN tab_receita              rec     ON rec.id   = mc.receita_id
     LEFT JOIN tab_tipo_receita         tr_rec  ON tr_rec.id = rec.tipo_receita_id
     WHERE mc.id = $1 AND mc.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/financeiro/movimento-caixa/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const raw = await req.json()
  const db  = getDb(session.database_name)

  if ('conciliado' in raw && Object.keys(raw).length <= 2) {
    const hoje = new Date().toISOString().slice(0, 10)
    await db.query(
      `UPDATE tab_movimento_caixa
         SET conciliado = $1, data_conciliacao = $2
       WHERE id = $3 AND empresa_id = $4`,
      [raw.conciliado, raw.conciliado ? (raw.data_conciliacao || hoje) : null, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const body = movimentoCaixaSchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const dt = (v?: string | null) => (v && v.trim() ? v : null)
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)

  await db.query(
    `UPDATE tab_movimento_caixa SET
       tipo_operacao_id = $1,
       pessoa_id        = $2,
       tipo             = $3,
       valor            = $4,
       data_movimento   = $5,
       documento        = $6,
       observacao       = $7,
       conciliado       = $8,
       data_conciliacao = $9
     WHERE id = $10 AND empresa_id = $11`,
    [
      d.tipo_operacao_id   ?? null,
      d.pessoa_id          ?? null,
      d.tipo,
      d.valor,
      d.data_movimento,
      up(d.documento),
      d.observacao         ?? null,
      d.conciliado         ?? false,
      dt(d.data_conciliacao),
      params.id,
      session.empresa_id_ativa,
    ],
  )

  return NextResponse.json({ ok: true })
}

// DELETE /api/financeiro/movimento-caixa/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rowCount } = await db.query(
    `DELETE FROM tab_movimento_caixa WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rowCount) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
