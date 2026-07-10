import { z } from 'zod'

const emailOpcional = z.union([
  z.string().email('E-mail inválido'),
  z.literal(''),
  z.null(),
]).optional().nullable()

export const empresaSchema = z.object({
  razao_social:       z.string().min(1, 'Razão Social é obrigatória').max(150),
  nome_fantasia:      z.string().max(100).optional().nullable(),
  cnpj:               z.string().max(18).optional().nullable(),
  ie:                 z.string().max(20).optional().nullable(),
  im:                 z.string().max(20).optional().nullable(),
  regime_tributario:  z.enum(['SN', 'LP', 'LR']).default('SN'),
  crt:                z.enum(['1', '2', '3', '4']).default('1'),
  // Endereço
  cep:                z.string().max(9).optional().nullable(),
  logradouro:         z.string().max(255).optional().nullable(),
  numero:             z.string().max(10).optional().nullable(),
  complemento:        z.string().max(60).optional().nullable(),
  bairro:             z.string().max(80).optional().nullable(),
  cidade:             z.string().max(80).optional().nullable(),
  uf:                 z.string().max(2).optional().nullable(),
  cod_ibge:           z.string().max(7).optional().nullable(),
  // Contato
  telefone:           z.string().max(20).optional().nullable(),
  email:              emailOpcional,
  email_nfe:          emailOpcional,
  // NF-e
  ambiente_nfe:       z.enum(['1', '2']).default('2'),
  serie_nfe:          z.string().max(3).default('001'),
  prox_num_nfe:       z.number().int().min(1).default(1),
  serie_nfce:         z.string().max(3).default('001'),
  prox_num_nfce:      z.number().int().min(1).default(1),
  csc_nfce:           z.string().max(36).optional().nullable(),
  id_token_nfce:      z.string().max(6).optional().nullable(),
  cert_validade:      z.string().optional().nullable(),
  // Faturamento
  cod_tipo_cobranca:  z.number().int().optional().nullable(),
  // Integração
  voa_auth_token:     z.string().max(120).optional().nullable(),
  voa_ambiente:       z.enum(['desenvolvimento', 'producao']).default('desenvolvimento'),
  memed_api_key:      z.string().max(120).optional().nullable(),
  // Vazio = manter o secret atual (nunca é devolvido pelo GET, ver rota de empresas)
  memed_secret_key:   z.string().max(120).optional().nullable(),
  memed_ambiente:     z.enum(['homologacao', 'producao']).default('homologacao'),
  // Logo (data URL base64, redimensionada no cliente antes do envio)
  logo_base64:        z.string().max(700_000, 'Imagem muito grande').startsWith('data:image/').optional().nullable(),
  // Status
  ativo:              z.boolean().default(true),
})

export type EmpresaInput = z.infer<typeof empresaSchema>
