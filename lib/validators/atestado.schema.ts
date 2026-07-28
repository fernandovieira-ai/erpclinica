import { z } from 'zod'

export const atestadoSchema = z.object({
  agendamento_id:   z.number().int().positive('Agendamento é obrigatório'),
  tipo:             z.enum(['AFASTAMENTO', 'COMPARECIMENTO', 'PERSONALIZADO']),
  dias_afastamento: z.preprocess(v => (v === '' || v == null) ? null : Number(v), z.number().int().positive().nullable().optional()),
  data_inicio:      z.string().min(1, 'Data é obrigatória'),
  cid:              z.preprocess(v => (v === '' || v == null) ? null : v, z.string().max(10).nullable().optional()),
  texto:            z.string().trim().min(1, 'Texto do atestado é obrigatório'),
})

export type AtestadoInput = z.infer<typeof atestadoSchema>
