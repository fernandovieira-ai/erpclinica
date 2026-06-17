import { z } from 'zod'

export const tipoReceitaSchema = z.object({
  codigo:         z.string().min(1, 'Código é obrigatório').max(20),
  descricao:      z.string().min(1, 'Descrição é obrigatória').max(80),
  natureza:       z.enum(['O', 'F', 'E']).default('O'),
  conta_id:       z.number().int().positive().optional().nullable(),
  ind_pis_cofins: z.boolean().default(false),
  pai_id:         z.number().int().positive().optional().nullable(),
  ativo:          z.boolean().default(true),
})

export type TipoReceitaInput = z.infer<typeof tipoReceitaSchema>
