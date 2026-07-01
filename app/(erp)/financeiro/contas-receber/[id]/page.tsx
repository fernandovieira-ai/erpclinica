import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { TituloReceber } from '@/types/cadastros.types'
import TituloReceberFormPage from '@/components/financeiro/TituloReceberFormPage'

export default async function EditarTituloReceberPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await requireSession()
  const db      = getDb(session.database_name)

  const { rows } = await db.query<TituloReceber>(
    `SELECT t.id, t.empresa_id,
            t.pessoa_id,            p.nome               AS pessoa_nome,
            t.tipo_receita_id,      tr.descricao         AS tipo_receita_desc,
            t.cod_tipo_cobranca,    tc.des_tipo_cobranca AS tipo_cobranca_desc,
            t.centro_custo_id,      cc.descricao         AS centro_custo_desc,
            t.conta_banco_id,       cb.mnemonico         AS conta_banco_desc,
            t.destino_liquidacao,
            t.conta_banco_liq_id,   cbl.mnemonico        AS conta_banco_liq_desc,
            t.receita_id,
            t.numero_titulo, t.num_documento,
            t.origem_modulo, t.origem_id,
            TO_CHAR(t.data_emissao,    'YYYY-MM-DD') AS data_emissao,
            TO_CHAR(t.data_vencimento, 'YYYY-MM-DD') AS data_vencimento,
            TO_CHAR(t.data_liquidacao, 'YYYY-MM-DD') AS data_liquidacao,
            TO_CHAR(t.data_competencia,'YYYY-MM-DD') AS data_competencia,
            t.valor_original, t.valor_juros, t.valor_multa,
            t.valor_desconto, t.valor_retencao, t.valor_liquidado,
            t.status,
            t.codigo_barras, t.nosso_numero, t.linha_digitavel,
            t.observacao, t.created_by, t.created_at, t.updated_at
     FROM tab_titulo_receber t
     LEFT JOIN tab_pessoa        p   ON p.id  = t.pessoa_id
     LEFT JOIN tab_tipo_receita  tr  ON tr.id = t.tipo_receita_id
     LEFT JOIN tab_tipo_cobranca tc  ON tc.cod_tipo_cobranca = t.cod_tipo_cobranca
     LEFT JOIN tab_centro_custo  cc  ON cc.id = t.centro_custo_id
     LEFT JOIN tab_conta_banco   cb  ON cb.id = t.conta_banco_id
     LEFT JOIN tab_conta_banco   cbl ON cbl.id = t.conta_banco_liq_id
     WHERE t.id = $1 AND t.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) redirect('/financeiro/contas-receber')

  return <TituloReceberFormPage titulo={rows[0]} />
}
