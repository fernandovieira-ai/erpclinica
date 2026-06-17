import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { Pessoa } from '@/types/cadastros.types'
import PessoaFormPage from '@/components/cadastro/PessoaFormPage'

export default async function EditarPessoaPage({ params }: { params: { id: string } }) {
  const session = await requireSession()

  const db = getDb(session.database_name)
  const { rows } = await db.query<Pessoa>(
    `SELECT id, tipo_pessoa, nome, nome_fantasia, cpf_cnpj,
            TO_CHAR(data_nascimento, 'YYYY-MM-DD') AS data_nascimento,
            rg_ie, im,
            ind_cliente, ind_fornecedor, ind_banco, ind_transportador, ind_paciente, ind_profissional,
            cep, logradouro, numero, complemento, bairro, cidade, uf, cod_ibge,
            telefone, celular, whatsapp, email, email_nfe,
            limite_credito, banco_nome, banco_agencia, banco_conta, banco_tipo, chave_pix,
            contribuinte_icms, optante_simples, obs, ativo, created_at, updated_at
     FROM tab_pessoa
     WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) redirect('/cadastro/pessoas')

  return <PessoaFormPage pessoa={rows[0]} />
}
