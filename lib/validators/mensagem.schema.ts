import { z } from 'zod'
import { paraLatin1 } from './prontuario.schema'

// Sentinel pra "destino = grupo Recepção" (nunca colide com id real de tab_usuario,
// que é SERIAL a partir de 1). Mensagem de grupo nasce com destinatario_id NULL no
// banco (ver novos/84_mensagens_recepcao.sql) - esse número só existe no contrato
// da API entre front e back, nunca é gravado como está.
export const DESTINATARIO_GRUPO_RECEPCAO = -1

// Mensagem de chat é texto narrativo livre do usuário — preserva o case original
// digitado (mesma exceção do prontuário clínico), só normaliza pra LATIN1.
export const mensagemSchema = z.object({
  destinatario_id: z.number().int().refine(
    v => v === DESTINATARIO_GRUPO_RECEPCAO || v > 0,
    'Destinatário é obrigatório',
  ),
  texto: z.preprocess(
    v => paraLatin1(String(v ?? '')).trim(),
    z.string().min(1, 'Mensagem não pode ser vazia').max(2000, 'Mensagem muito longa'),
  ),
})

export type MensagemInput = z.infer<typeof mensagemSchema>
