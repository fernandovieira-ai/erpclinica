import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { ContaBanco } from '@/types/cadastros.types'
import ContaBancoFormPage from '@/components/cadastro/ContaBancoFormPage'

export default async function EditarContaBancoPage({ params }: { params: { id: string } }) {
  const session = await requireSession()

  const db = getDb(session.database_name)
  const { rows } = await db.query<ContaBanco>(
    `SELECT cb.id, cb.empresa_id, cb.banco_id,
            b.nome AS banco_nome, b.codigo_compensacao AS banco_codigo,
            cb.mnemonico, cb.agencia, cb.agencia_dv, cb.conta, cb.conta_dv,
            cb.tipo, cb.nome_gerente, cb.telefone,
            cb.saldo_inicial, cb.saldo_atual, cb.num_convenio,
            cb.carteira, cb.limite, cb.ativo,
            cb.created_at, cb.updated_at
     FROM tab_conta_banco cb
     LEFT JOIN tab_banco b ON b.id = cb.banco_id
     WHERE cb.id = $1`,
    [params.id],
  )

  if (!rows.length) redirect('/cadastro/contas-banco')

  return <ContaBancoFormPage conta={rows[0]} />
}
