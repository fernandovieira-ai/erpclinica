import { z } from 'zod'

const textoOpcional = z.preprocess(v => (v === '' ? null : v), z.string().nullable().optional())

export const prontuarioSchema = z.object({
  agendamento_id:          z.number().int().positive('Agendamento é obrigatório'),
  paciente_id:             z.number().int().positive('Paciente é obrigatório'),
  profissional_id:         z.number().int().positive('Profissional é obrigatório'),
  queixas:                 textoOpcional,
  hda:                     textoOpcional,
  antecedentes_familiares: textoOpcional,
  antecedentes_pessoais:   textoOpcional,
  habitos:                 textoOpcional,
  alergias:                textoOpcional,
  exame_fisico:            textoOpcional,
  peso:                    z.preprocess(v => (v == null || v === '') ? null : Number(v), z.number().min(0).max(999).nullable().optional()),
  pressao:                 z.preprocess(v => (v === '' ? null : v), z.string().max(20).nullable().optional()),
  exames:                  textoOpcional,
  diagnostico:             textoOpcional,
  medicacao:               textoOpcional,
  outras_condutas:         textoOpcional,
})

export type ProntuarioInput = z.infer<typeof prontuarioSchema>
