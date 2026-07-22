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
  tipo_voa_clinical_type: string | null
  especialidade_id:      number | null
  especialidade_descricao: string | null
  especialidade_cor:     string | null
  data_hora_inicio:      string   // ISO string
  data_hora_fim:         string
  status:                       StatusAgendamento
  motivo:                       string | null
  observacao:                   string | null
  categoria_id:                 number | null
  categoria_descricao:          string | null
  horario_chegada:              string | null
  horario_inicio_atendimento:   string | null
  created_by:                   string | null
  created_at:                   string
  updated_at:                   string
}

export type AgendamentoListItem = Pick<
  Agendamento,
  | 'id' | 'paciente_id' | 'paciente_nome' | 'paciente_celular'
  | 'profissional_id' | 'profissional_nome'
  | 'tipo_id' | 'tipo_descricao' | 'tipo_cor' | 'tipo_voa_clinical_type'
  | 'especialidade_id' | 'especialidade_descricao'
  | 'data_hora_inicio' | 'data_hora_fim' | 'status' | 'motivo' | 'observacao'
  | 'categoria_id' | 'categoria_descricao'
  | 'horario_chegada' | 'horario_inicio_atendimento'
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
  id:                number
  descricao:         string
  duracao_min:       number
  cor:               string
  valor:             number | null
  ativo:             boolean
  voa_clinical_type: string | null
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

export interface Prontuario {
  id:                      number
  empresa_id:              number
  agendamento_id:          number
  paciente_id:             number
  profissional_id:         number
  queixas:                 string | null
  hda:                     string | null
  antecedentes_familiares: string | null
  antecedentes_pessoais:   string | null
  habitos:                 string | null
  alergias:                string | null
  exame_fisico:            string | null
  peso:                    number | null
  imc:                     number | null
  pressao:                 string | null
  exames:                  string | null
  diagnostico:             string | null
  medicacao:               string | null
  outras_condutas:         string | null
  created_by:              string | null
  created_at:              string
  updated_at:              string
}

export interface ProntuarioAnexo {
  id:             number
  agendamento_id: number
  nome_arquivo:   string
  tipo_mime:      string | null
  tamanho_bytes:  number | null
  created_by:     string | null
  created_at:     string
}

export interface ReceitaMedica {
  id:                   number
  empresa_id:           number
  agendamento_id:       number
  paciente_id:          number
  profissional_id:      number
  memed_prescricao_id:  string | null
  url_receita:          string | null
  medicamentos:         string | null
  created_by:           string | null
  created_at:           string
}

export interface ReceitaSistemaItem {
  id:                 number
  receita_id:         number
  medicamento_nome:   string
  codigo_produto:     string | null
  apresentacao:       string | null
  forma_farmaceutica: string | null
  via_administracao:  string | null
  posologia:          string
  duracao:            string | null
  quantidade:         string | null
  ordem:              number
}

export interface ReceitaSistemaRegistro {
  id:             number
  agendamento_id: number
  paciente_id:    number
  observacoes:    string | null
  created_by:     string | null
  created_at:     string
  itens:          ReceitaSistemaItem[]
}

export interface ProfissionalListItem {
  id:              number
  nome:            string
  especialidades:  { id: number; descricao: string; cor: string }[]
  agenda:          AgendaProfissional[]
}
