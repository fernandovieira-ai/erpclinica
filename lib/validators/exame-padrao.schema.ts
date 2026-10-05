import { z } from 'zod'
import { paraLatin1 } from './prontuario.schema'

// Catalogo (igual especialidade/tipo de atendimento) - nome salvo em maiusculo.
export const examePadraoSchema = z.object({
  nome: z.preprocess(
    v => paraLatin1(String(v ?? '')).trim().toUpperCase(),
    z.string().min(1, 'Nome é obrigatório').max(150),
  ),
})

export type ExamePadraoInput = z.infer<typeof examePadraoSchema>
