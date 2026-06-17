import { z } from 'zod'

export const centroCustoSchema = z.object({
  codigo:    z.string().min(1, 'Código é obrigatório').max(20),
  descricao: z.string().min(1, 'Descrição é obrigatória').max(80),
  pai_id:    z.number().int().positive().optional().nullable(),
  tipo:      z.enum(['A', 'S']).default('A'),
  ativo:     z.boolean().default(true),
})

export type CentroCustoInput = z.infer<typeof centroCustoSchema>
