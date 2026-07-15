// Módulo: Controle de Cartão de Crédito/Débito
// Ver novos/35_controle_cartao.sql e novos/36_fatura_cartao.sql para a modelagem completa.
//
// Fluxo: recebimento (consulta/receita/baixa de título) com condição de
// pagamento débito/crédito → gera automaticamente uma VendaCartao (com
// parcelas previstas) → fn_gerar_faturas_cartao agrupa as parcelas em
// FaturaCartao por conta+adquirente+data prevista → ao confirmar a fatura
// (conferindo contra o que a operadora realmente cobrou) gera o
// movimento bancário de entrada.

export interface TaxaCartao {
  id:                        number
  empresa_id:                number
  condicao_pagamento_id:     number
  condicao_descricao:        string | null
  adquirente:                string | null
  bandeira:                  string | null
  percentual_mdr:            string
  percentual_antecipacao_am: string
  prazo_recebimento_dias:    number
  data_vigencia_inicio:      string
  data_vigencia_fim:         string | null
  created_by:                string | null
  created_at:                string
}

export type TaxaCartaoListItem = Pick<
  TaxaCartao,
  | 'id' | 'condicao_pagamento_id' | 'condicao_descricao' | 'adquirente' | 'bandeira'
  | 'percentual_mdr' | 'percentual_antecipacao_am' | 'prazo_recebimento_dias'
  | 'data_vigencia_inicio' | 'data_vigencia_fim'
>

export interface TaxaCartaoListResponse {
  dados: TaxaCartaoListItem[]
  total: number
  page:  number
  limit: number
  pages: number
}

export type VendaCartaoParcelaStatus = 'PENDENTE' | 'FATURADA' | 'CONCILIADA' | 'CANCELADA'

export interface VendaCartaoParcela {
  id:                              number
  numero_parcela:                  number
  valor:                           string
  valor_liquido:                   string
  valor_liquido_original:          string
  data_prevista:                   string
  data_prevista_original:          string
  status:                          VendaCartaoParcelaStatus
  fatura_cartao_id:                number | null
  antecipado:                      boolean
  percentual_antecipacao_aplicado: string | null
}

export type VendaCartaoModalidade = 'DEBITO' | 'CREDITO_VISTA' | 'CREDITO_PARCELADO'
export type VendaCartaoStatus     = 'PENDENTE' | 'CANCELADO'
// Resumo do andamento das parcelas (venda.status por si só nunca sai de
// PENDENTE até ser cancelada — quem carrega o progresso real é a parcela).
export type VendaCartaoStatusParcelas = 'PENDENTE' | 'PARCIAL' | 'FATURADA' | 'CONCILIADA' | 'CANCELADO'

export interface VendaCartao {
  id:                      number
  empresa_id:              number
  conta_banco_id:          number
  conta_banco_desc:        string | null
  condicao_pagamento_id:   number
  condicao_descricao:      string | null
  titulo_receber_id:       number | null
  adquirente:              string | null
  bandeira:                string | null
  modalidade:              VendaCartaoModalidade | null
  qtd_parcelas:            number | null
  valor_bruto:             string
  nsu:                     string | null
  codigo_autorizacao:      string | null
  data_venda:              string
  percentual_mdr_aplicado: string | null
  percentual_antecipacao_am: string | null
  parcelas:                VendaCartaoParcela[]
  status:                  VendaCartaoStatus
  status_parcelas:         VendaCartaoStatusParcelas
  observacao:              string | null
  created_by:              string | null
  created_at:              string
}

export type VendaCartaoListItem = Pick<
  VendaCartao,
  | 'id' | 'conta_banco_desc' | 'condicao_descricao' | 'adquirente' | 'bandeira' | 'modalidade'
  | 'qtd_parcelas' | 'valor_bruto' | 'nsu' | 'data_venda' | 'status' | 'status_parcelas'
>

export interface VendaCartaoListResponse {
  dados: VendaCartaoListItem[]
  total: number
  page:  number
  limit: number
  pages: number
}

export type FaturaCartaoStatus = 'ABERTA' | 'CONFIRMADA' | 'CANCELADA'

export interface FaturaCartaoParcelaItem {
  id:               number
  venda_cartao_id:  number
  numero_parcela:   number
  valor:            string
  valor_liquido:    string
  data_venda:       string
  data_prevista:    string
  nsu:              string | null
}

export interface FaturaCartao {
  id:                    number
  empresa_id:            number
  conta_banco_id:        number
  conta_banco_desc:      string | null
  adquirente:            string
  data_prevista:         string
  data_emissao_inicio:   string | null
  data_emissao_fim:      string | null
  nsus:                  string | null
  valor_previsto:        string
  valor_cobrado:         string | null
  qtd_parcelas:           number
  status:                FaturaCartaoStatus
  movimento_banco_id:    number | null
  data_confirmacao:      string | null
  observacao:            string | null
  created_by:            string | null
  created_at:            string
  parcelas?:             FaturaCartaoParcelaItem[]
}

export type FaturaCartaoListItem = Pick<
  FaturaCartao,
  | 'id' | 'conta_banco_desc' | 'adquirente' | 'data_prevista' | 'data_emissao_inicio' | 'data_emissao_fim' | 'nsus'
  | 'valor_previsto' | 'valor_cobrado' | 'qtd_parcelas' | 'status' | 'movimento_banco_id'
>

export interface FaturaCartaoListResponse {
  dados: FaturaCartaoListItem[]
  total: number
  page:  number
  limit: number
  pages: number
}

export interface GerarFaturasCartaoResultado {
  faturas_geradas: number
  valor_total:     number
}

export interface AntecipacaoParcelaResultado {
  valor_liquido_anterior: number
  valor_liquido_novo:     number
  percentual_aplicado:    number
  dias_antecipados:       number
}

export interface VendaCartaoPendenteFatura {
  parcela_id:         number
  venda_cartao_id:    number
  conta_banco_id:     number
  conta_banco_desc:   string
  adquirente:         string
  bandeira:           string | null
  modalidade:         VendaCartaoModalidade | null
  nsu:                string | null
  codigo_autorizacao: string | null
  data_venda:         string
  data_prevista:      string
  numero_parcela:     number
  valor:              string
  valor_liquido:      string
}

export interface VendaCartaoPendenteFaturaResponse {
  dados:       VendaCartaoPendenteFatura[]
  total:       number
  valor_total: number
}
