import { z } from 'zod'

const textoOpcional = z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional())

export const receitaMedicaSchema = z.object({
  agendamento_id:      z.number().int().positive('Agendamento é obrigatório'),
  memed_prescricao_id: textoOpcional,
  url_receita:         textoOpcional,
  medicamentos:        textoOpcional,
})

export type ReceitaMedicaInput = z.infer<typeof receitaMedicaSchema>
