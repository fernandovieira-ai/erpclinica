import { z } from 'zod'

const usuarioBase = {
  nome:         z.string().min(3, 'Informe o nome completo'),
  email:        z.string().email('E-mail inválido'),
  perfil:       z.enum(['admin', 'financeiro', 'operador']),
  trocar_senha: z.boolean().default(false),
  ativo:        z.boolean().default(true),
  empresas_ids: z.array(z.number()).min(1, 'Selecione ao menos uma empresa'),
  profissional_id: z.number().nullable().optional(),
}

export const usuarioCreateSchema = z.object({
  ...usuarioBase,
  senha: z.string().min(6, 'Mínimo de 6 caracteres'),
})

export const usuarioUpdateSchema = z.object({
  ...usuarioBase,
  senha: z.union([z.string().min(6, 'Mínimo de 6 caracteres'), z.literal('')]).optional(),
})

export type UsuarioCreateInput = z.infer<typeof usuarioCreateSchema>
export type UsuarioUpdateInput = z.infer<typeof usuarioUpdateSchema>
