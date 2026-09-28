import { z } from 'zod'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export const bloqueioHorarioSchema = z.object({
  profissional_id: z.number().int().positive('Profissional é obrigatório'),
  data:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  hora_inicio:     z.string().regex(HHMM, 'Hora inicial inválida (HH:MM)'),
  hora_fim:        z.string().regex(HHMM, 'Hora final inválida (HH:MM)'),
  motivo:          z.string().max(100).optional().nullable(),
}).refine(d => d.hora_fim > d.hora_inicio, {
  message: 'A hora final deve ser maior que a hora inicial',
  path: ['hora_fim'],
})

export type BloqueioHorarioInput = z.infer<typeof bloqueioHorarioSchema>
