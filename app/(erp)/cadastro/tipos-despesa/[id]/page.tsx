import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { TipoDespesa } from '@/types/cadastros.types'
import TipoDespesaFormPage from '@/components/cadastro/TipoDespesaFormPage'

export default async function EditarTipoDespesaPage({ params }: { params: { id: string } }) {
  const session = await requireSession()

  const db = getDb(session.database_name)
  const { rows } = await db.query<TipoDespesa>(
    `SELECT td.id, td.empresa_id, td.codigo, td.descricao, td.natureza,
            td.conta_id, pc.descricao AS conta_desc, pc.codigo AS conta_codigo,
            td.ind_pis_cofins, td.ind_imposto, td.tipo_imposto, td.ind_capex,
            td.pai_id, p.descricao AS pai_desc,
            td.ativo, td.created_at, td.updated_at
     FROM tab_tipo_despesa td
     LEFT JOIN tab_plano_contas pc ON pc.id = td.conta_id
     LEFT JOIN tab_tipo_despesa p  ON p.id  = td.pai_id
     WHERE td.id = $1 AND td.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) redirect('/cadastro/tipos-despesa')

  return <TipoDespesaFormPage tipo={rows[0]} />
}
