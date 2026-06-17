import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import CategoriaFormPage from '@/components/clinica/CategoriaFormPage'
import type { CategoriaListItem } from '@/types/clinica.types'

export default async function EditarCategoriaPage({ params }: { params: { id: string } }) {
  const session  = await requireSession()
  const db       = getDb(session.database_name)

  const { rows } = await db.query(
    `SELECT id, descricao, ativo
     FROM tab_categoria
     WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) redirect('/clinica/categorias')

  return <CategoriaFormPage categoria={rows[0] as CategoriaListItem} />
}
