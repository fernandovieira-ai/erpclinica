import { z } from 'zod'

export const planoContasSchema = z.object({
  codigo:        z.string().min(1, 'Código é obrigatório').max(30),
  descricao:     z.string().min(1, 'Descrição é obrigatória').max(100),
  pai_id:        z.number().int().positive().optional().nullable(),
  tipo:          z.enum(['S', 'A']).default('A'),
  natureza:      z.enum(['D', 'C']).default('D'),
  classificacao: z.enum(['01', '02', '03', '04', '05', '09']).default('09'),
  grupo:         z.string().max(20).optional().nullable(),
  ativo:         z.boolean().default(true),
})

export type PlanoContasInput = z.infer<typeof planoContasSchema>
