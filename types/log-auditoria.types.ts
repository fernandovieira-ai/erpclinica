export type LogAuditoriaTabela =
  | 'tab_usuario'
  | 'tab_agendamento'
  | 'tab_despesa'
  | 'tab_receita'
  | 'tab_titulo_pagar'
  | 'tab_titulo_receber'
  | 'tab_recebimento_consulta'

export type LogAuditoriaAcao = 'INSERT' | 'UPDATE' | 'DELETE'

export interface LogAuditoriaItem {
  id:            number
  created_at:    string
  tabela:        LogAuditoriaTabela
  registro_id:   number
  acao:          LogAuditoriaAcao
  usuario_nome:  string | null
  dados_antes:   Record<string, unknown> | null
  dados_depois:  Record<string, unknown> | null
}

export interface LogAuditoriaListResponse {
  dados:  LogAuditoriaItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}
