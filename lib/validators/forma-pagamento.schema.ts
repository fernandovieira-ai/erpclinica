import { z } from 'zod'

export const tipoCobrancaSchema = z.object({
  cod_tipo_cobranca: z.number().int().min(1, 'Código é obrigatório'),
  des_tipo_cobranca: z.string().min(1, 'Descrição é obrigatória').max(60),
  ind_status:        z.enum(['A', 'I']).default('A'),
})

export const tipoCobrancaUpdateSchema = tipoCobrancaSchema.omit({ cod_tipo_cobranca: true })

export type TipoCobrancaInput       = z.infer<typeof tipoCobrancaSchema>
export type TipoCobrancaUpdateInput = z.infer<typeof tipoCobrancaUpdateSchema>

// aliases de compatibilidade (evita renomear imports legados)
export const formaPagamentoSchema = tipoCobrancaSchema
export type  FormaPagamentoInput  = TipoCobrancaInput

