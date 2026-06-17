import { z } from 'zod'

const emailOpcional = z.union([
  z.string().email('E-mail inválido'),
  z.literal(''),
  z.null(),
]).optional().nullable()

export const pessoaSchema = z.object({
  tipo_pessoa:        z.enum(['F', 'J']),
  nome:               z.string().min(1, 'Nome é obrigatório').max(150),
  nome_fantasia:      z.string().max(100).optional().nullable(),
  cpf_cnpj:           z.string().max(18).optional().nullable(),
  data_nascimento:    z.string().max(10).optional().nullable(),  // YYYY-MM-DD
  rg_ie:              z.string().max(30).optional().nullable(),
  im:                 z.string().max(20).optional().nullable(),

  // Papéis
  ind_cliente:        z.boolean().default(false),
  ind_fornecedor:     z.boolean().default(false),
  ind_banco:          z.boolean().default(false),
  ind_transportador:  z.boolean().default(false),
  ind_paciente:       z.boolean().default(false),
  ind_profissional:   z.boolean().default(false),

  // Endereço
  cep:                z.string().max(9).optional().nullable(),
  logradouro:         z.string().max(255).optional().nullable(),
  numero:             z.string().max(10).optional().nullable(),
  complemento:        z.string().max(60).optional().nullable(),
  bairro:             z.string().max(80).optional().nullable(),
  cidade:             z.string().max(80).optional().nullable(),
  uf:                 z.string().max(2).optional().nullable(),

  // Contato
  telefone:           z.string().max(20).optional().nullable(),
  celular:            z.string().max(20).optional().nullable(),
  whatsapp:           z.string().max(20).optional().nullable(),
  email:              emailOpcional,
  email_nfe:          emailOpcional,

  // Financeiro
  limite_credito:     z.number().min(0).default(0),
  banco_nome:         z.string().max(60).optional().nullable(),
  banco_agencia:      z.string().max(10).optional().nullable(),
  banco_conta:        z.string().max(20).optional().nullable(),
  banco_tipo:         z.enum(['C', 'P']).optional().nullable(),
  chave_pix:          z.string().max(100).optional().nullable(),

  // Fiscal
  contribuinte_icms:  z.boolean().default(false),
  optante_simples:    z.boolean().default(false),
  obs:                z.string().optional().nullable(),
})

export type PessoaInput = z.infer<typeof pessoaSchema>
