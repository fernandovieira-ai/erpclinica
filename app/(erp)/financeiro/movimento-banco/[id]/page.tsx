import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { MovimentoBanco } from '@/types/cadastros.types'
import MovimentoBancoFormPage from '@/components/financeiro/MovimentoBancoFormPage'

export default async function EditarMovimentoBancoPage({ params }: { params: { id: string } }) {
  const session = await requireSession()
  const db      = getDb(session.database_name)

  const { rows } = await db.query<MovimentoBanco>(
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

  if (!rows.length) redirect('/financeiro/movimento-banco')

  return <MovimentoBancoFormPage movimento={rows[0]} />
}
