import { z } from 'zod'
import { paraLatin1 } from './prontuario.schema'

// Banco do cliente usa encoding LATIN1 (ver padroes.md secao 1) - exames/indicacao vem
// livres do textarea e podem trazer travessao/aspas curvas/emoji colados do Word/celular.
export const solicitacaoExameSchema = z.object({
  agendamento_id:    z.number().int().positive('Agendamento é obrigatório'),
  caracter:          z.enum(['ROTINA', 'URGENCIA']).default('ROTINA'),
  indicacao_clinica: z.preprocess(
    v => (v == null || v === '' ? null : paraLatin1(String(v)).trim()),
    z.string().max(500).nullable().optional(),
  ),
  exames: z.preprocess(
    v => paraLatin1(String(v ?? '')).trim(),
    z.string().min(1, 'Informe pelo menos um exame'),
  ),
})

export type SolicitacaoExameInput = z.infer<typeof solicitacaoExameSchema>
