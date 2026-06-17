import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { Receita, ReceitaParcela, ReceitaRateio } from '@/types/cadastros.types'
import ReceitaFormPage from '@/components/financeiro/ReceitaFormPage'

export default async function EditarReceitaPage({ params }: { params: { id: string } }) {
  const session = await requireSession()
  const db      = getDb(session.database_name)

  const [{ rows }, { rows: parcelas }, { rows: rateios }] = await Promise.all([
    db.query<Receita>(
      `SELECT r.id, r.empresa_id,
              r.pessoa_id, p.nome AS pessoa_nome,
              r.tipo_receita_id, tr.descricao AS tipo_receita_desc,
              tr.natureza AS tipo_receita_natureza,
              r.cod_tipo_cobranca, tc.des_tipo_cobranca AS tipo_cobranca_desc,
              r.centro_custo_id, cc.descricao AS centro_custo_desc,
              r.conta_banco_id, cb.mnemonico AS conta_banco_desc,
              r.ind_avista, r.destino,
              TO_CHAR(r.data_receita,     'YYYY-MM-DD') AS data_receita,
              TO_CHAR(r.data_competencia, 'YYYY-MM-DD') AS data_competencia,
              TO_CHAR(r.data_recebimento, 'YYYY-MM-DD') AS data_recebimento,
              r.documento, r.valor, r.num_parcelas, r.intervalo_dias,
              r.status, r.observacao, r.created_by, r.created_at, r.updated_at
       FROM tab_receita r
       LEFT JOIN tab_pessoa           p  ON p.id  = r.pessoa_id
       LEFT JOIN tab_tipo_receita     tr ON tr.id = r.tipo_receita_id
       LEFT JOIN tab_tipo_cobranca    tc ON tc.cod_tipo_cobranca = r.cod_tipo_cobranca
       LEFT JOIN tab_centro_custo     cc ON cc.id = r.centro_custo_id
       LEFT JOIN tab_conta_banco      cb ON cb.id = r.conta_banco_id
       WHERE r.id = $1 AND r.empresa_id = $2`,
      [params.id, session.empresa_id_ativa],
    ),
    db.query<ReceitaParcela>(
      `SELECT id, numero_parcela, TO_CHAR(data_vencimento,'YYYY-MM-DD') AS data_vencimento,
              valor, titulo_receber_id
       FROM tab_receita_parcela
       WHERE receita_id = $1
       ORDER BY numero_parcela`,
      [params.id],
    ),
    db.query<ReceitaRateio>(
      `SELECT rr.id, rr.centro_custo_id,
              cc.codigo, cc.descricao,
              rr.percentual, rr.valor
       FROM tab_receita_rateio rr
       LEFT JOIN tab_centro_custo cc ON cc.id = rr.centro_custo_id
       WHERE rr.receita_id = $1
       ORDER BY rr.id`,
      [params.id],
    ),
  ])

  if (!rows.length) redirect('/financeiro/receitas')

  return <ReceitaFormPage receita={{ ...rows[0], parcelas, rateios }} />
}
