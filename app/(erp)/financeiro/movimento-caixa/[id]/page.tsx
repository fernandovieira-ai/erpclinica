import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { MovimentoCaixa } from '@/types/cadastros.types'
import MovimentoCaixaFormPage from '@/components/financeiro/MovimentoCaixaFormPage'

export default async function EditarMovimentoCaixaPage({ params }: { params: { id: string } }) {
  const session = await requireSession()
  const db      = getDb(session.database_name)

  const { rows } = await db.query<MovimentoCaixa>(
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
            CASE
              WHEN mc.titulo_pagar_id   IS NOT NULL THEN 'Tít. Pagar'
              WHEN mc.titulo_receber_id IS NOT NULL THEN 'Tít. Receber'
              WHEN mc.despesa_id        IS NOT NULL THEN 'Despesa'
              WHEN mc.receita_id        IS NOT NULL THEN 'Receita'
              ELSE 'Manual'
            END AS origem_tipo,
            CASE
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

  if (!rows.length) redirect('/financeiro/movimento-caixa')

  return <MovimentoCaixaFormPage movimento={rows[0]} />
}
