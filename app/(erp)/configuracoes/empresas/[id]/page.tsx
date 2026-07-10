import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import type { Empresa } from '@/types/cadastros.types'
import EmpresaFormPage from '@/components/cadastro/EmpresaFormPage'

export default async function EditarEmpresaPage({ params }: { params: { id: string } }) {
  const session = await requireSession()

  const db = getDb(session.database_name)
  const { rows } = await db.query<Empresa>(
    `SELECT id, razao_social, nome_fantasia, cnpj, ie, im,
            regime_tributario, crt,
            cep, cod_ibge, cidade, uf, logradouro, numero, complemento, bairro,
            telefone, email, email_nfe,
            ambiente_nfe, serie_nfe, prox_num_nfe,
            serie_nfce, prox_num_nfce, csc_nfce, id_token_nfce,
            TO_CHAR(cert_validade, 'YYYY-MM-DD') AS cert_validade,
            cod_tipo_cobranca,
            voa_auth_token, voa_ambiente,
            memed_api_key, memed_ambiente,
            (memed_secret_key IS NOT NULL) AS memed_secret_key_configured,
            logo_base64,
            ativo, created_at, updated_at
     FROM tab_empresa
     WHERE id = $1`,
    [params.id],
  )

  if (!rows.length) redirect('/configuracoes/empresas')

  return <EmpresaFormPage empresa={rows[0]} />
}
