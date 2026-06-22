import { z } from 'zod'

export const agendamentoSchema = z.object({
  paciente_id:      z.number().int().positive('Paciente é obrigatório'),
  profissional_id:  z.number().int().positive('Profissional é obrigatório'),
  tipo_id:          z.number().int().positive().optional().nullable(),
  especialidade_id: z.number().int().positive().optional().nullable(),
  data_hora_inicio: z.string().min(1, 'Data/hora de início é obrigatória'),
  data_hora_fim:    z.string().min(1, 'Data/hora de fim é obrigatória'),
  status:           z.enum(['AGENDADO','CONFIRMADO','AGUARDANDO','ATENDIDO','FALTOU','CANCELADO']).default('AGENDADO'),
  motivo:           z.string().max(255).optional().nullable(),
  observacao:       z.string().optional().nullable(),
  categoria_id: z.number().int().positive().optional().nullable(),
})

export type AgendamentoInput = z.infer<typeof agendamentoSchema>

export const agendamentoTipoSchema = z.object({
  descricao:   z.string().min(1).max(80),
  duracao_min: z.number().int().positive().default(30),
  cor:         z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#0EA5E9'),
  valor:       z.preprocess(
    v => (v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))) ? null : Number(v),
    z.number().nonnegative().nullable(),
  ).optional(),
  ativo:       z.boolean().default(true),
})

export type AgendamentoTipoInput = z.infer<typeof agendamentoTipoSchema>

export const categoriaSchema = z.object({
  descricao: z.string().min(1, 'Descrição é obrigatória').max(80),
  ativo:     z.boolean().default(true),
})

export type CategoriaInput = z.infer<typeof categoriaSchema>

export const especialidadeSchema = z.object({
  descricao: z.string().min(1).max(80),
  cor:       z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6366F1'),
})

export const agendaProfissionalSchema = z.object({
  profissional_id: z.number().int().positive(),
  dia_semana:      z.number().int().min(0).max(6),
  hora_inicio:     z.string().regex(/^\d{2}:\d{2}$/),
  hora_fim:        z.string().regex(/^\d{2}:\d{2}$/),
  intervalo_min:   z.number().int().positive().default(30),
})
