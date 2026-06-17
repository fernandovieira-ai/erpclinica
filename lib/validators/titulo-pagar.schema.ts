import { z } from 'zod'

export const tituloPagarSchema = z.object({
  pessoa_id:          z.number().int().positive('Pessoa é obrigatória'),
  tipo_despesa_id:    z.number().int().positive().optional().nullable(),
  cod_tipo_cobranca:  z.number().int().positive().optional().nullable(),
  centro_custo_id:    z.number().int().positive().optional().nullable(),
  conta_banco_id:     z.number().int().positive().optional().nullable(),
  despesa_id:         z.number().int().positive().optional().nullable(),
  numero_titulo:      z.string().max(30).optional().nullable(),
  num_documento:      z.string().max(50).optional().nullable(),
  data_emissao:       z.string().min(1, 'Data de emissão é obrigatória'),
  data_vencimento:    z.string().min(1, 'Data de vencimento é obrigatória'),
  data_liquidacao:    z.string().optional().nullable(),
  data_competencia:   z.string().optional().nullable(),
  valor_original:     z.number({ invalid_type_error: 'Valor inválido' }).positive('Valor deve ser maior que zero'),
  valor_juros:        z.number().min(0).default(0),
  valor_multa:        z.number().min(0).default(0),
  valor_desconto:     z.number().min(0).default(0),
  valor_retencao:     z.number().min(0).default(0),
  valor_liquidado:    z.number().min(0).default(0),
  destino_liquidacao: z.preprocess(v => (v === '' ? null : v), z.enum(['C', 'B']).optional().nullable()),
  conta_banco_liq_id: z.number().int().positive().optional().nullable(),
  status:             z.enum(['A', 'L', 'C']).default('A'),
  requer_aprovacao:   z.boolean().default(false),
  status_aprovacao:   z.enum(['P', 'A', 'R']).optional().nullable(),
  codigo_barras:      z.string().max(50).optional().nullable(),
  nosso_numero:       z.string().max(20).optional().nullable(),
  observacao:         z.string().max(5000).optional().nullable(),
})

export type TituloPagarInput = z.infer<typeof tituloPagarSchema>
