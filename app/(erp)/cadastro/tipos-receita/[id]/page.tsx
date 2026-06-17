import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { TipoReceita } from '@/types/cadastros.types'
import TipoReceitaFormPage from '@/components/cadastro/TipoReceitaFormPage'

export default async function EditarTipoReceitaPage({ params }: { params: { id: string } }) {
  const session = await requireSession()

  const db = getDb(session.database_name)
  const { rows } = await db.query<TipoReceita>(
    `SELECT tr.id, tr.empresa_id, tr.codigo, tr.descricao, tr.natureza,
            tr.conta_id, pc.descricao AS conta_desc, pc.codigo AS conta_codigo,
            tr.ind_pis_cofins, tr.pai_id, p.descricao AS pai_desc,
            tr.ativo, tr.created_at, tr.updated_at
     FROM tab_tipo_receita tr
     LEFT JOIN tab_plano_contas pc ON pc.id = tr.conta_id
     LEFT JOIN tab_tipo_receita p  ON p.id  = tr.pai_id
     WHERE tr.id = $1 AND tr.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) redirect('/cadastro/tipos-receita')

  return <TipoReceitaFormPage tipo={rows[0]} />
}
