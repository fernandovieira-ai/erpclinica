import { z } from 'zod'
import { paraLatin1 } from './prontuario.schema'

// Mensagem de chat é texto narrativo livre do usuário — preserva o case original
// digitado (mesma exceção do prontuário clínico), só normaliza pra LATIN1.
export const mensagemSchema = z.object({
  destinatario_id: z.number().int().positive('Destinatário é obrigatório'),
  texto: z.preprocess(
    v => paraLatin1(String(v ?? '')).trim(),
    z.string().min(1, 'Mensagem não pode ser vazia').max(2000, 'Mensagem muito longa'),
  ),
})

export type MensagemInput = z.infer<typeof mensagemSchema>
