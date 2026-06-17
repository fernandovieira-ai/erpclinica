import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { movimentoBancoSchema } from '@/lib/validators/movimento-banco.schema'

// GET /api/financeiro/movimento-banco/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT mb.id, mb.empresa_id,
            mb.conta_banco_id,   cb.mnemonico          AS conta_banco_desc,
            mb.tipo_operacao_id, toc.descricao         AS tipo_operacao_desc,
            mb.pessoa_id,        p.nome                AS pessoa_nome,
            mb.titulo_pagar_id,
            mb.titulo_receber_id,
            mb.despesa_id,
            mb.receita_id,
            mb.tipo,
            mb.valor,
            TO_CHAR(mb.data_movimento,   'YYYY-MM-DD') AS data_movimento,
            TO_CHAR(mb.data_predatado,   'YYYY-MM-DD') AS data_predatado,
            TO_CHAR(mb.data_referencia,  'YYYY-MM-DD') AS data_referencia,
            mb.documento,
            mb.observacao,
            mb.conciliado,
            TO_CHAR(mb.data_conciliacao, 'YYYY-MM-DD') AS data_conciliacao,
            mb.conciliado_por,
            mb.created_by,
            mb.created_at,
            CASE
              WHEN mb.titulo_pagar_id   IS NOT NULL THEN 'Tít. Pagar'
              WHEN mb.titulo_receber_id IS NOT NULL THEN 'Tít. Receber'
              WHEN mb.despesa_id        IS NOT NULL THEN 'Despesa'
              WHEN mb.receita_id        IS NOT NULL THEN 'Receita'
              ELSE 'Manual'
            END AS origem_tipo,
            CASE
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
     FROM tab_movimento_banco mb
     JOIN  tab_conta_banco         cb      ON cb.id      = mb.conta_banco_id
     LEFT JOIN tab_tipo_operacao_caixa toc ON toc.id     = mb.tipo_operacao_id
     LEFT JOIN tab_pessoa               p  ON p.id       = mb.pessoa_id
     LEFT JOIN tab_titulo_pagar         tp      ON tp.id   = mb.titulo_pagar_id
     LEFT JOIN tab_tipo_despesa         td_tp   ON td_tp.id = tp.tipo_despesa_id
     LEFT JOIN tab_titulo_receber       trec    ON trec.id  = mb.titulo_receber_id
     LEFT JOIN tab_tipo_receita         tr_trec ON tr_trec.id = trec.tipo_receita_id
     LEFT JOIN tab_despesa              desp    ON desp.id  = mb.despesa_id
     LEFT JOIN tab_tipo_despesa         td_desp ON td_desp.id = desp.tipo_despesa_id
     LEFT JOIN tab_receita              rec     ON rec.id   = mb.receita_id
     LEFT JOIN tab_tipo_receita         tr_rec  ON tr_rec.id = rec.tipo_receita_id
     WHERE mb.id = $1 AND mb.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/financeiro/movimento-banco/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const raw = await req.json()
  const db  = getDb(session.database_name)

  // Ação rápida de conciliar
  if ('conciliado' in raw && Object.keys(raw).length <= 2) {
    const hoje = new Date().toISOString().slice(0, 10)
    await db.query(
      `UPDATE tab_movimento_banco
         SET conciliado = $1, data_conciliacao = $2, conciliado_por = $3
       WHERE id = $4 AND empresa_id = $5`,
      [raw.conciliado, raw.conciliado ? (raw.data_conciliacao || hoje) : null, raw.conciliado ? (session.nome ?? null) : null, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const body = movimentoBancoSchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const dt = (v?: string | null) => (v && v.trim() ? v : null)
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)

  await db.query(
    `UPDATE tab_movimento_banco SET
       conta_banco_id   = $1,
       tipo_operacao_id = $2,
       pessoa_id        = $3,
       tipo             = $4,
       valor            = $5,
       data_movimento   = $6,
       data_predatado   = $7,
       data_referencia  = $8,
       documento        = $9,
       observacao       = $10,
       conciliado       = $11,
       data_conciliacao = $12
     WHERE id = $13 AND empresa_id = $14`,
    [
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
      params.id,
      session.empresa_id_ativa,
    ],
  )

  return NextResponse.json({ ok: true })
}

// DELETE /api/financeiro/movimento-banco/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rowCount } = await db.query(
    `DELETE FROM tab_movimento_banco WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rowCount) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
