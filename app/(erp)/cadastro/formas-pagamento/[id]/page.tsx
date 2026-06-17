import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { TipoCobranca } from '@/types/cadastros.types'
import FormaPagamentoFormPage from '@/components/cadastro/FormaPagamentoFormPage'

export default async function EditarTipoCobrancaPage({ params }: { params: { id: string } }) {
  const session = await requireSession()

  const db = getDb(session.database_name)
  const { rows } = await db.query<TipoCobranca>(
    `SELECT cod_tipo_cobranca, des_tipo_cobranca, ind_status
     FROM tab_tipo_cobranca
     WHERE cod_tipo_cobranca = $1`,
    [Number(params.id)],
  )

  if (!rows.length) redirect('/cadastro/formas-pagamento')

  return <FormaPagamentoFormPage forma={rows[0]} />
}

