import { z } from 'zod'

export const taxaCartaoSchema = z.object({
  condicao_pagamento_id:     z.number({ invalid_type_error: 'Condição de pagamento é obrigatória' }).int().positive('Condição de pagamento é obrigatória'),
  percentual_mdr:            z.number({ invalid_type_error: 'MDR inválido' }).min(0, 'MDR deve ser >= 0').max(100, 'MDR deve ser <= 100'),
  percentual_antecipacao_am: z.number().min(0).max(100).default(0),
  prazo_recebimento_dias:    z.number().int().min(0, 'Deve ser >= 0'),
  parcelas_de:               z.number().int().min(1, 'Mínimo 1 parcela').default(1),
  parcelas_ate:              z.number().int().min(1, 'Mínimo 1 parcela').default(99),
}).refine(d => d.parcelas_ate >= d.parcelas_de, { message: 'Parcelas "até" deve ser >= "de"', path: ['parcelas_ate'] })

export type TaxaCartaoInput = z.infer<typeof taxaCartaoSchema>

export const gerarFaturasSelecaoSchema = z.object({
  parcela_ids: z.array(z.number().int().positive()).min(1, 'Selecione ao menos uma venda').max(500, 'Seleção muito grande'),
})

export type GerarFaturasSelecaoInput = z.infer<typeof gerarFaturasSelecaoSchema>

export const confirmarFaturaCartaoSchema = z.object({
  valor_cobrado: z.number({ invalid_type_error: 'Valor cobrado inválido' }).positive('Valor cobrado deve ser maior que zero').optional().nullable(),
})

export type ConfirmarFaturaCartaoInput = z.infer<typeof confirmarFaturaCartaoSchema>

export const antecipaParcelaCartaoSchema = z.object({
  nova_data_prevista: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
    .refine(v => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), 'Data inválida'),
})

export type AntecipaParcelaCartaoInput = z.infer<typeof antecipaParcelaCartaoSchema>
