import { z } from 'zod'

const TIPOS_IMPOSTO = ['IRPJ','IRRF','CSLL','PIS','COFINS','INSS','FGTS','ISS','ICMS','IPI','IOF','CIDE','CSRF','DARF','OUTROS'] as const

export const tipoDespesaSchema = z.object({
  codigo:         z.string().min(1, 'Código é obrigatório').max(20),
  descricao:      z.string().min(1, 'Descrição é obrigatória').max(80),
  natureza:       z.enum(['A', 'F', 'I']).default('A'),
  conta_id:       z.number().int().positive().optional().nullable(),
  ind_pis_cofins: z.boolean().default(false),
  ind_imposto:    z.boolean().default(false),
  tipo_imposto:   z.enum(TIPOS_IMPOSTO).optional().nullable(),
  ind_capex:      z.boolean().default(false),
  pai_id:         z.number().int().positive().optional().nullable(),
  ativo:          z.boolean().default(true),
})

export type TipoDespesaInput = z.infer<typeof tipoDespesaSchema>
