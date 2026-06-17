import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { CentroCusto } from '@/types/cadastros.types'
import CentroCustoFormPage from '@/components/cadastro/CentroCustoFormPage'

export default async function EditarCentroCustoPage({ params }: { params: { id: string } }) {
  const session = await requireSession()

  const db = getDb(session.database_name)
  const { rows } = await db.query<CentroCusto>(
    `SELECT cc.id, cc.empresa_id, cc.codigo, cc.descricao, cc.pai_id,
            p.descricao AS pai_desc, cc.tipo, cc.ativo, cc.created_at, cc.updated_at
     FROM tab_centro_custo cc
     LEFT JOIN tab_centro_custo p ON p.id = cc.pai_id
     WHERE cc.id = $1 AND cc.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) redirect('/cadastro/centros-custo')

  return <CentroCustoFormPage centro={rows[0]} />
}
