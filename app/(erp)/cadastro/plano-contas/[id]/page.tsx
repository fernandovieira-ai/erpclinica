import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { PlanoContas } from '@/types/cadastros.types'
import PlanoContasFormPage from '@/components/cadastro/PlanoContasFormPage'

export default async function EditarContaPage({ params }: { params: { id: string } }) {
  const session = await requireSession()

  const db = getDb(session.database_name)
  const { rows } = await db.query<PlanoContas>(
    `SELECT pc.id, pc.empresa_id, pc.codigo, pc.descricao, pc.pai_id,
            p.descricao AS pai_desc, pc.tipo, pc.natureza,
            pc.classificacao, pc.grupo, pc.ativo, pc.created_at, pc.updated_at
     FROM tab_plano_contas pc
     LEFT JOIN tab_plano_contas p ON p.id = pc.pai_id
     WHERE pc.id = $1 AND pc.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) redirect('/cadastro/plano-contas')

  return <PlanoContasFormPage conta={rows[0]} />
}
