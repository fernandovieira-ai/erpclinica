import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { CondicaoPagamento } from '@/types/cadastros.types'
import CondicaoPagamentoFormPage from '@/components/cadastro/CondicaoPagamentoFormPage'

export default async function EditarCondicaoPagamentoPage({ params }: { params: { id: string } }) {
  const session = await requireSession()

  const db = getDb(session.database_name)
  const { rows } = await db.query<CondicaoPagamento>(
    `SELECT id, empresa_id, descricao, tipo, num_parcelas, intervalo_dias, entrada_pct, ativo, created_at
     FROM tab_condicao_pagamento
     WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) redirect('/cadastro/condicoes-pagamento')

  return <CondicaoPagamentoFormPage condicao={rows[0]} />
}
