import { z } from 'zod'

export const condicaoPagamentoSchema = z.object({
  descricao:           z.string().min(1, 'Descrição é obrigatória').max(80),
  tipo:                z.enum(['V', 'P']).default('V'),
  num_parcelas:        z.number().int().min(1, 'Mínimo 1 parcela').default(1),
  intervalo_dias:      z.number().int().min(0, 'Deve ser >= 0').default(30),
  entrada_pct:         z.number().min(0).max(100).default(0),
  tipo_pagamento:      z.enum(['dinheiro', 'debito', 'credito', 'pix', 'a_prazo']).default('dinheiro'),
  conta_banco_pix_id:  z.number().int().positive().optional().nullable(),
  ativo:               z.boolean().default(true),
})

export type CondicaoPagamentoInput = z.infer<typeof condicaoPagamentoSchema>
