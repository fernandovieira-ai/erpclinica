import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { tituloPagarSchema } from '@/lib/validators/titulo-pagar.schema'

// GET /api/financeiro/titulos-pagar/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT t.id, t.empresa_id,
            t.pessoa_id,            p.nome              AS pessoa_nome,
            t.tipo_despesa_id,      td.descricao          AS tipo_despesa_desc,
            t.cod_tipo_cobranca,    tc.des_tipo_cobranca  AS tipo_cobranca_desc,
            t.centro_custo_id,      cc.descricao          AS centro_custo_desc,
            t.conta_banco_id,       cb.mnemonico        AS conta_banco_desc,
            t.conta_banco_liq_id,   cbl.mnemonico       AS conta_banco_liq_desc,
            t.destino_liquidacao,
            t.despesa_id,
            t.numero_titulo, t.num_documento,
            t.origem_modulo, t.origem_id,
            TO_CHAR(t.data_emissao,    'YYYY-MM-DD') AS data_emissao,
            TO_CHAR(t.data_vencimento, 'YYYY-MM-DD') AS data_vencimento,
            TO_CHAR(t.data_liquidacao, 'YYYY-MM-DD') AS data_liquidacao,
            TO_CHAR(t.data_competencia,'YYYY-MM-DD') AS data_competencia,
            t.valor_original, t.valor_juros, t.valor_multa,
            t.valor_desconto, t.valor_retencao, t.valor_liquidado,
            t.status, t.requer_aprovacao, t.status_aprovacao,
            t.aprovado_por, t.aprovado_em,
            t.codigo_barras, t.nosso_numero,
            t.observacao, t.created_by, t.created_at, t.updated_at
     FROM tab_titulo_pagar t
     LEFT JOIN tab_pessoa           p  ON p.id  = t.pessoa_id
     LEFT JOIN tab_tipo_despesa     td ON td.id = t.tipo_despesa_id
     LEFT JOIN tab_tipo_cobranca     tc ON tc.cod_tipo_cobranca = t.cod_tipo_cobranca
     LEFT JOIN tab_centro_custo      cc ON cc.id = t.centro_custo_id
     LEFT JOIN tab_conta_banco       cb  ON cb.id = t.conta_banco_id
     LEFT JOIN tab_conta_banco       cbl ON cbl.id = t.conta_banco_liq_id
     WHERE t.id = $1 AND t.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/financeiro/titulos-pagar/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const raw = await req.json()
  const db  = getDb(session.database_name)

  // Atualização rápida de status apenas
  if ('status' in raw && Object.keys(raw).length === 1) {
    await db.query(
      `UPDATE tab_titulo_pagar SET status=$1, updated_at=NOW() WHERE id=$2 AND empresa_id=$3`,
      [raw.status, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const body = tituloPagarSchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const dt = (v?: string | null) => (v && v.trim() ? v : null)

  await db.query(
    `UPDATE tab_titulo_pagar SET
       pessoa_id          = $1,
       tipo_despesa_id    = $2,
       cod_tipo_cobranca  = $3,
       centro_custo_id    = $4,
       conta_banco_id     = $5,
       despesa_id         = $6,
       numero_titulo      = $7,
       num_documento      = $8,
       data_emissao       = $9,
       data_vencimento    = $10,
       data_liquidacao    = $11,
       data_competencia   = $12,
       valor_original     = $13,
       valor_juros        = $14,
       valor_multa        = $15,
       valor_desconto     = $16,
       valor_retencao     = $17,
       valor_liquidado    = $18,
       destino_liquidacao = $19,
       conta_banco_liq_id = $20,
       status             = $21,
       requer_aprovacao   = $22,
       status_aprovacao   = $23,
       codigo_barras      = $24,
       nosso_numero       = $25,
       observacao         = $26,
       updated_at         = NOW()
     WHERE id = $27 AND empresa_id = $28`,
    [
      d.pessoa_id,
      d.tipo_despesa_id   ?? null,
      d.cod_tipo_cobranca ?? null,
      d.centro_custo_id   ?? null,
      d.conta_banco_id     ?? null,
      d.despesa_id         ?? null,
      d.numero_titulo      ?? null,
      d.num_documento      ?? null,
      d.data_emissao,
      d.data_vencimento,
      dt(d.data_liquidacao),
      dt(d.data_competencia),
      d.valor_original,
      d.valor_juros   ?? 0,
      d.valor_multa   ?? 0,
      d.valor_desconto  ?? 0,
      d.valor_retencao  ?? 0,
      d.valor_liquidado ?? 0,
      d.destino_liquidacao ?? null,
      d.conta_banco_liq_id ?? null,
      d.status ?? 'A',
      d.requer_aprovacao ?? false,
      d.status_aprovacao ?? null,
      d.codigo_barras ?? null,
      d.nosso_numero  ?? null,
      d.observacao    ?? null,
      params.id,
      session.empresa_id_ativa,
    ],
  )

  return NextResponse.json({ ok: true })
}

// DELETE /api/financeiro/titulos-pagar/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rowCount } = await db.query(
    `DELETE FROM tab_titulo_pagar WHERE id=$1 AND empresa_id=$2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rowCount) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
