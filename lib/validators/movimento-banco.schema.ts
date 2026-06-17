import { z } from 'zod'

export const movimentoBancoSchema = z.object({
  conta_banco_id:   z.number().int().positive('Conta bancária é obrigatória'),
  tipo_operacao_id: z.number().int().positive().optional().nullable(),
  pessoa_id:        z.number().int().positive().optional().nullable(),
  tipo:             z.enum(['E', 'S'], { required_error: 'Tipo é obrigatório' }),
  valor:            z.number({ invalid_type_error: 'Valor inválido' }).positive('Valor deve ser maior que zero'),
  data_movimento:   z.string().min(1, 'Data do movimento é obrigatória'),
  data_predatado:   z.string().optional().nullable(),
  data_referencia:  z.string().optional().nullable(),
  documento:        z.string().max(50).optional().nullable(),
  observacao:       z.string().max(5000).optional().nullable(),
  conciliado:       z.boolean().default(false),
  data_conciliacao: z.string().optional().nullable(),
})

export type MovimentoBancoInput = z.infer<typeof movimentoBancoSchema>
