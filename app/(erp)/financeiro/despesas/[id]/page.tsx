import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { Despesa, DespesaParcela, DespesaRateio } from '@/types/cadastros.types'
import DespesaFormPage from '@/components/financeiro/DespesaFormPage'

export default async function EditarDespesaPage({ params }: { params: { id: string } }) {
  const session = await requireSession()
  const db      = getDb(session.database_name)

  const [{ rows }, { rows: parcelas }, { rows: rateios }] = await Promise.all([
    db.query<Despesa>(
      `SELECT d.id, d.empresa_id,
              d.pessoa_id, p.nome AS pessoa_nome,
              d.tipo_despesa_id, td.descricao AS tipo_despesa_desc,
              td.natureza AS tipo_despesa_natureza,
              d.cod_tipo_cobranca, tc.des_tipo_cobranca AS tipo_cobranca_desc,
              d.centro_custo_id, cc.descricao AS centro_custo_desc,
              d.conta_banco_id, cb.mnemonico AS conta_banco_desc,
              d.ind_avista, d.destino,
              TO_CHAR(d.data_despesa,     'YYYY-MM-DD') AS data_despesa,
              TO_CHAR(d.data_competencia, 'YYYY-MM-DD') AS data_competencia,
              TO_CHAR(d.data_pagamento,   'YYYY-MM-DD') AS data_pagamento,
              d.documento, d.valor, d.num_parcelas, d.intervalo_dias,
              d.status, d.observacao, d.created_by, d.created_at, d.updated_at
       FROM tab_despesa d
       LEFT JOIN tab_pessoa           p  ON p.id  = d.pessoa_id
       LEFT JOIN tab_tipo_despesa     td ON td.id = d.tipo_despesa_id
       LEFT JOIN tab_tipo_cobranca    tc ON tc.cod_tipo_cobranca = d.cod_tipo_cobranca
       LEFT JOIN tab_centro_custo     cc ON cc.id = d.centro_custo_id
       LEFT JOIN tab_conta_banco      cb ON cb.id = d.conta_banco_id
       WHERE d.id = $1 AND d.empresa_id = $2`,
      [params.id, session.empresa_id_ativa],
    ),
    db.query<DespesaParcela>(
      `SELECT id, numero_parcela, TO_CHAR(data_vencimento,'YYYY-MM-DD') AS data_vencimento,
              valor, titulo_pagar_id
       FROM tab_despesa_parcela
       WHERE despesa_id = $1
       ORDER BY numero_parcela`,
      [params.id],
    ),
    db.query<DespesaRateio>(
      `SELECT dr.id, dr.centro_custo_id,
              cc.codigo, cc.descricao,
              dr.percentual, dr.valor
       FROM tab_despesa_rateio dr
       LEFT JOIN tab_centro_custo cc ON cc.id = dr.centro_custo_id
       WHERE dr.despesa_id = $1
       ORDER BY dr.id`,
      [params.id],
    ),
  ])

  if (!rows.length) redirect('/financeiro/despesas')

  return <DespesaFormPage despesa={{ ...rows[0], parcelas, rateios }} />
}
