import { z } from 'zod'

// Banco do cliente usa encoding LATIN1 (ver padroes.md secao 1) - texto narrativo do
// profissional vem livre do textarea e pode trazer travessao/aspas curvas/emoji colados
// do Word ou do celular, o que quebra o INSERT com 500 sem corpo de erro. Normaliza os
// equivalentes tipograficos comuns e descarta o que sobrar fora do intervalo Latin-1.
function paraLatin1(v: string): string {
  return v
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x00-\xFF]/g, '')
}

const textoOpcional = z.preprocess(
  v => (v == null || v === '' ? null : paraLatin1(String(v))),
  z.string().nullable().optional(),
)

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
  imc:                     z.preprocess(v => (v == null || v === '') ? null : Number(v), z.number().min(0).max(99.99).nullable().optional()),
  pressao:                 z.preprocess(v => (v == null || v === '' ? null : paraLatin1(String(v))), z.string().max(20).nullable().optional()),
  exames:                  textoOpcional,
  diagnostico:             textoOpcional,
  medicacao:               textoOpcional,
  outras_condutas:         textoOpcional,
})

export type ProntuarioInput = z.infer<typeof prontuarioSchema>
