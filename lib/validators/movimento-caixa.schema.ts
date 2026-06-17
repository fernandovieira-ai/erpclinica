import { z } from 'zod'

export const movimentoCaixaSchema = z.object({
  tipo_operacao_id: z.number().int().positive().optional().nullable(),
  pessoa_id:        z.number().int().positive().optional().nullable(),
  tipo:             z.enum(['E', 'S'], { required_error: 'Tipo é obrigatório' }),
  valor:            z.number({ invalid_type_error: 'Valor inválido' }).positive('Valor deve ser maior que zero'),
  data_movimento:   z.string().min(1, 'Data do movimento é obrigatória'),
  documento:        z.string().max(50).optional().nullable(),
  observacao:       z.string().max(5000).optional().nullable(),
  conciliado:       z.boolean().default(false),
  data_conciliacao: z.string().optional().nullable(),
})

export type MovimentoCaixaInput = z.infer<typeof movimentoCaixaSchema>
