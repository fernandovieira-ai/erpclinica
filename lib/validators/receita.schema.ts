import { z } from 'zod'

export const receitaSchema = z.object({
  pessoa_id:          z.number().int().positive('Pessoa é obrigatória'),
  tipo_receita_id:    z.number().int().positive('Tipo de receita é obrigatório'),
  cod_tipo_cobranca:  z.number().int().positive().optional().nullable(),
  centro_custo_id:    z.number().int().positive().optional().nullable(),
  conta_banco_id:     z.number().int().positive().optional().nullable(),
  ind_avista:         z.boolean().default(false),
  destino:            z.enum(['C', 'B']).optional().nullable(),
  data_receita:       z.string().min(1, 'Data é obrigatória'),
  data_competencia:   z.string().optional().nullable(),
  data_recebimento:   z.string().optional().nullable(),
  documento:          z.string().max(50).optional().nullable(),
  valor:              z.number({ invalid_type_error: 'Valor inválido' }).positive('Valor deve ser maior que zero'),
  num_parcelas:       z.number().int().min(1, 'Mínimo 1 parcela').max(360).default(1),
  intervalo_dias:     z.number().int().min(1).default(30),
  status:             z.enum(['P', 'A', 'C']).default('A'),
  observacao:         z.string().max(5000).optional().nullable(),
})

export type ReceitaInput = z.infer<typeof receitaSchema>
