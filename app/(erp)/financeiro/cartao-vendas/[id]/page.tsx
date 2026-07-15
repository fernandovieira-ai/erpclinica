import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { VendaCartao } from '@/types/cartao.types'
import VendaCartaoFormPage from '@/components/financeiro/cartao/VendaCartaoFormPage'

export default async function VendaCartaoDetalhePage({ params }: { params: { id: string } }) {
  const session = await requireSession()
  const db      = getDb(session.database_name)

  const { rows } = await db.query<VendaCartao>(
    `SELECT v.id, v.empresa_id,
            v.conta_banco_id, cb.mnemonico AS conta_banco_desc,
            v.condicao_pagamento_id, cp.descricao AS condicao_descricao,
            v.titulo_receber_id,
            v.adquirente, v.bandeira, v.modalidade, v.qtd_parcelas,
            v.valor_bruto, v.nsu, v.codigo_autorizacao,
            TO_CHAR(v.data_venda, 'YYYY-MM-DD"T"HH24:MI:SS') AS data_venda,
            v.percentual_mdr_aplicado, v.status, v.observacao,
            v.created_by, v.created_at,
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
                         'data_prevista', TO_CHAR(p.data_prevista, 'YYYY-MM-DD'),
                         'status', p.status,
                         'fatura_cartao_id', p.fatura_cartao_id
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

  if (!rows.length) redirect('/financeiro/cartao-vendas')

  return <VendaCartaoFormPage venda={rows[0]} />
}
