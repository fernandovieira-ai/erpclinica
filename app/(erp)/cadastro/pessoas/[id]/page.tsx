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
            sexo, cor_raca, estado_civil, naturalidade, profissao, altura, peso, foto,
            pai_pessoa_id, pai_nome, pai_paciente,
            mae_pessoa_id, mae_nome, mae_paciente,
            conjuge_pessoa_id, conjuge_nome, conjuge_paciente,
            indicacao_pessoa_id, indicacao_nome, indicacao_fone, indicacao_ligacao,
            rg_ie, im,
            ind_cliente, ind_fornecedor, ind_banco, ind_transportador, ind_paciente, ind_profissional,
            cep, logradouro, numero, complemento, bairro, cidade, uf, cod_ibge,
            telefone, celular, whatsapp, email, email_nfe,
            limite_credito, cod_tipo_cobranca, banco_nome, banco_agencia, banco_conta, banco_tipo, chave_pix,
            contribuinte_icms, optante_simples, obs, ativo, created_at, updated_at
     FROM tab_pessoa
     WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) redirect('/cadastro/pessoas')

  return <PessoaFormPage pessoa={rows[0]} />
}
