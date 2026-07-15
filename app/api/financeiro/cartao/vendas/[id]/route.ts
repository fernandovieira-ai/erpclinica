import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/financeiro/cartao/vendas/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT v.id, v.empresa_id,
            v.conta_banco_id, cb.mnemonico AS conta_banco_desc,
            v.condicao_pagamento_id, cp.descricao AS condicao_descricao,
            v.titulo_receber_id,
            v.adquirente, v.bandeira, v.modalidade, v.qtd_parcelas,
            v.valor_bruto, v.nsu, v.codigo_autorizacao,
            TO_CHAR(v.data_venda, 'YYYY-MM-DD"T"HH24:MI:SS') AS data_venda,
            v.percentual_mdr_aplicado, v.status, v.observacao,
            v.created_by, v.created_at,
            (SELECT taxa.percentual_antecipacao_am FROM fn_taxa_cartao_vigente(v.condicao_pagamento_id, v.data_venda::date) taxa) AS percentual_antecipacao_am,
            (SELECT CASE
               WHEN v.status = 'CANCELADO' THEN 'CANCELADO'
               WHEN count(*) FILTER (WHERE p.status = 'CONCILIADA') = count(*) THEN 'CONCILIADA'
               WHEN count(*) FILTER (WHERE p.status IN ('FATURADA','CONCILIADA')) = count(*) THEN 'FATURADA'
               WHEN count(*) FILTER (WHERE p.status IN ('FATURADA','CONCILIADA')) > 0 THEN 'PARCIAL'
               ELSE 'PENDENTE'
             END
             FROM tab_venda_cartao_parcela p WHERE p.venda_cartao_id = v.id) AS status_parcelas,
            COALESCE((
              SELECT json_agg(
                       json_build_object(
                         'id', p.id,
                         'numero_parcela', p.numero_parcela,
                         'valor', p.valor,
                         'valor_liquido', p.valor_liquido,
                         'valor_liquido_original', p.valor_liquido_original,
                         'data_prevista', TO_CHAR(p.data_prevista, 'YYYY-MM-DD'),
                         'data_prevista_original', TO_CHAR(p.data_prevista_original, 'YYYY-MM-DD'),
                         'status', p.status,
                         'fatura_cartao_id', p.fatura_cartao_id,
                         'antecipado', p.antecipado,
                         'percentual_antecipacao_aplicado', p.percentual_antecipacao_aplicado
                       ) ORDER BY p.numero_parcela
                     )
              FROM tab_venda_cartao_parcela p
              WHERE p.venda_cartao_id = v.id
            ), '[]') AS parcelas
     FROM tab_venda_cartao v
     JOIN tab_conta_banco cb ON cb.id = v.conta_banco_id
     JOIN tab_condicao_pagamento cp ON cp.id = v.condicao_pagamento_id
     WHERE v.id = $1 AND v.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/financeiro/cartao/vendas/[id]  — body: { action: 'cancelar' }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json()
  if (body.action !== 'cancelar') {
    return NextResponse.json({ erro: 'Ação inválida' }, { status: 400 })
  }

  const db = getDb(session.database_name)

  const parcelasFaturadas = await db.query(
    `SELECT 1 FROM tab_venda_cartao_parcela p
     JOIN tab_venda_cartao v ON v.id = p.venda_cartao_id
     WHERE p.venda_cartao_id = $1 AND v.empresa_id = $2 AND p.status <> 'PENDENTE' LIMIT 1`,
    [params.id, session.empresa_id_ativa],
  )
  if (parcelasFaturadas.rows.length) {
    return NextResponse.json({ erro: 'Venda já tem parcela faturada/conciliada — não pode mais ser cancelada' }, { status: 400 })
  }

  const result = await db.query(
    `UPDATE tab_venda_cartao
     SET status = 'CANCELADO'
     WHERE id = $1 AND empresa_id = $2 AND status = 'PENDENTE'`,
    [params.id, session.empresa_id_ativa],
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ erro: 'Venda não encontrada ou já cancelada' }, { status: 400 })
  }

  await db.query(
    `UPDATE tab_venda_cartao_parcela p
     SET status = 'CANCELADA'
     FROM tab_venda_cartao v
     WHERE p.venda_cartao_id = v.id AND p.venda_cartao_id = $1 AND v.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  return NextResponse.json({ ok: true })
}
