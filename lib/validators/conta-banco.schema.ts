import { z } from 'zod'

export const contaBancoSchema = z.object({
  banco_id:     z.number().int().positive('Banco é obrigatório'),
  mnemonico:    z.string().min(1, 'Mnemônico é obrigatório').max(10),
  agencia:      z.string().min(1, 'Agência é obrigatória').max(10),
  agencia_dv:   z.string().max(2).optional().nullable(),
  conta:        z.string().min(1, 'Conta é obrigatória').max(20),
  conta_dv:     z.string().max(2).optional().nullable(),
  tipo:         z.enum(['C', 'P']).default('C'),
  nome_gerente: z.string().max(80).optional().nullable(),
  telefone:     z.string().max(20).optional().nullable(),
  saldo_inicial: z.number().default(0),
  num_convenio: z.string().max(20).optional().nullable(),
  limite:       z.number().default(0),
  ativo:        z.boolean().default(true),
})

export type ContaBancoInput = z.infer<typeof contaBancoSchema>
