export interface Especialidade {
  id:         number
  empresa_id: number
  descricao:  string
  cor:        string
  ativo:      boolean
  created_at: string
}

export interface AgendamentoTipo {
  id:          number
  empresa_id:  number
  descricao:   string
  duracao_min: number
  cor:         string
  valor:       number | null
  ativo:       boolean
  created_at:  string
}

export interface AgendaProfissional {
  id:              number
  empresa_id:      number
  profissional_id: number
  dia_semana:      number   // 0=Dom ... 6=Sáb
  hora_inicio:     string   // "HH:MM"
  hora_fim:        string
  intervalo_min:   number
  ativo:           boolean
}

export type StatusAgendamento =
  | 'AGENDADO'
  | 'CONFIRMADO'
  | 'AGUARDANDO'
  | 'ATENDIDO'
  | 'FALTOU'
  | 'CANCELADO'

export interface Agendamento {
  id:                    number
  empresa_id:            number
  paciente_id:           number
  paciente_nome:         string
  paciente_celular:      string | null
  paciente_cpf:          string | null
  profissional_id:       number
  profissional_nome:     string
  tipo_id:               number | null
  tipo_descricao:        string | null
  tipo_cor:              string | null
  tipo_duracao_min:      number | null
  especialidade_id:      number | null
  especialidade_descricao: string | null
  especialidade_cor:     string | null
  data_hora_inicio:      string   // ISO string
  data_hora_fim:         string
  status:                StatusAgendamento
  motivo:                string | null
  observacao:            string | null
  categoria_id:          number | null
  categoria_descricao:   string | null
  created_by:            string | null
  created_at:            string
  updated_at:            string
}

export type AgendamentoListItem = Pick<
  Agendamento,
  | 'id' | 'paciente_id' | 'paciente_nome' | 'paciente_celular'
  | 'profissional_id' | 'profissional_nome'
  | 'tipo_id' | 'tipo_descricao' | 'tipo_cor'
  | 'especialidade_id' | 'especialidade_descricao'
  | 'data_hora_inicio' | 'data_hora_fim' | 'status' | 'motivo' | 'observacao'
  | 'categoria_id' | 'categoria_descricao'
> & {
  tipo_valor?: number | null
  tipo_valor_prazo?: number | null
  recebimento_id?: number | null
  status_recebimento?: string | null
  total_recebimento?: number | null
  movimento_caixa_id?: number | null
  movimento_banco_id?: number | null
  batch_agendamento_id?: number | null
}

export interface AgendamentoListResponse {
  dados: AgendamentoListItem[]
  total: number
}

export interface CategoriaListItem {
  id:        number
  descricao: string
  ativo:     boolean
}

export interface CategoriaListResponse {
  dados:  CategoriaListItem[]
  total:  number
  pages:  number
}

export interface TipoAtendimentoListItem {
  id:          number
  descricao:   string
  duracao_min: number
  cor:         string
  valor:       number | null
  ativo:       boolean
}

export interface TipoAtendimentoListResponse {
  dados:  TipoAtendimentoListItem[]
  total:  number
  pages:  number
}

export interface TipoCategoriaValorItem {
  categoria_id: number
  descricao:    string
  valor:        number | null
  valor_prazo:  number | null
}

export interface ProfissionalListItem {
  id:              number
  nome:            string
  especialidades:  { id: number; descricao: string; cor: string }[]
  agenda:          AgendaProfissional[]
}
