import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import TipoAtendimentoFormPage from '@/components/clinica/TipoAtendimentoFormPage'
import type { TipoAtendimentoListItem } from '@/types/clinica.types'

export default async function EditarTipoAtendimentoPage({ params }: { params: { id: string } }) {
  const session  = await requireSession()
  const db       = getDb(session.database_name)

  const { rows } = await db.query(
    `SELECT id, descricao, duracao_min, cor, valor, ativo
     FROM tab_agendamento_tipo
     WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) redirect('/clinica/tipos-atendimento')

  return <TipoAtendimentoFormPage tipo={rows[0] as TipoAtendimentoListItem} />
}
