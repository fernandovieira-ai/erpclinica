import { z } from 'zod'
import { paraLatin1 } from './prontuario.schema'

// Banco do cliente usa encoding LATIN1 (ver padroes.md secao 1) - a prescricao vem livre
// do textarea e pode trazer travessao/aspas curvas/emoji colados do Word/celular.
export const receituarioEspecialSchema = z.object({
  agendamento_id:    z.number().int().positive('Agendamento é obrigatório'),
  prescricao:        z.preprocess(
    v => paraLatin1(String(v ?? '')).trim(),
    z.string().min(1, 'A prescrição não pode ficar vazia'),
  ),
  paciente_endereco: z.preprocess(
    v => (v == null || v === '' ? null : paraLatin1(String(v)).trim()),
    z.string().max(300).nullable().optional(),
  ),
})

export type ReceituarioEspecialInput = z.infer<typeof receituarioEspecialSchema>
