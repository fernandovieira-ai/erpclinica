export interface Pessoa {
  id:                number
  empresa_id:        number
  tipo_pessoa:       'F' | 'J'
  nome:              string
  nome_fantasia:     string | null
  cpf_cnpj:          string | null
  data_nascimento:   string | null   // YYYY-MM-DD
  rg_ie:             string | null
  im:                string | null
  ind_cliente:       boolean
  ind_fornecedor:    boolean
  ind_banco:         boolean
  ind_transportador: boolean
  ind_paciente:      boolean
  ind_profissional:  boolean
  logradouro:        string | null
  numero:            string | null
  complemento:       string | null
  bairro:            string | null
  cidade:            string | null
  uf:                string | null
  cep:               string | null
  cod_ibge:          string | null
  telefone:          string | null
  celular:           string | null
  whatsapp:          string | null
  email:             string | null
  email_nfe:         string | null
  limite_credito:    string   // NUMERIC retorna como string no pg
  banco_nome:        string | null
  banco_agencia:     string | null
  banco_conta:       string | null
  banco_tipo:        'C' | 'P' | null
  chave_pix:         string | null
  contribuinte_icms: boolean
  optante_simples:   boolean
  obs:               string | null
  ativo:             boolean
  created_at:        string
  updated_at:        string
}

export type PessoaListItem = Pick<
  Pessoa,
  | 'id' | 'tipo_pessoa' | 'nome' | 'nome_fantasia' | 'cpf_cnpj'
  | 'cidade' | 'uf' | 'telefone' | 'celular' | 'email'
  | 'ind_cliente' | 'ind_fornecedor' | 'ind_banco' | 'ind_transportador'
  | 'ind_paciente' | 'ind_profissional'
  | 'ativo'
>

export interface PessoaListResponse {
  dados:  PessoaListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface Empresa {
  id:                number
  razao_social:      string
  nome_fantasia:     string | null
  cnpj:              string | null
  ie:                string | null
  im:                string | null
  regime_tributario: string
  crt:               string
  cep:               string | null
  logradouro:        string | null
  numero:            string | null
  complemento:       string | null
  bairro:            string | null
  cidade:            string | null
  uf:                string | null
  cod_ibge:          string | null
  telefone:          string | null
  email:             string | null
  email_nfe:         string | null
  ambiente_nfe:      string
  serie_nfe:         string
  prox_num_nfe:      number
  serie_nfce:        string
  prox_num_nfce:     number
  csc_nfce:          string | null
  id_token_nfce:     string | null
  cert_validade:     string | null
  ativo:             boolean
  created_at:        string
  updated_at:        string
}

export type EmpresaListItem = Pick<
  Empresa,
  'id' | 'razao_social' | 'nome_fantasia' | 'cnpj' | 'cidade' | 'uf' | 'telefone' | 'ativo'
>

export interface EmpresaListResponse {
  dados:  EmpresaListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface TipoReceita {
  id:             number
  empresa_id:     number
  codigo:         string
  descricao:      string
  natureza:       'O' | 'F' | 'E'
  conta_id:       number | null
  conta_desc:     string | null
  conta_codigo:   string | null
  ind_pis_cofins: boolean
  pai_id:         number | null
  pai_desc:       string | null
  ativo:          boolean
  created_at:     string
  updated_at:     string
}

export type TipoReceitaListItem = Pick<
  TipoReceita,
  'id' | 'codigo' | 'descricao' | 'natureza' | 'conta_desc' | 'ind_pis_cofins' | 'pai_desc' | 'ativo'
>

export interface TipoReceitaListResponse {
  dados:  TipoReceitaListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface TipoDespesa {
  id:             number
  empresa_id:     number
  codigo:         string
  descricao:      string
  natureza:       'A' | 'F' | 'I'
  conta_id:       number | null
  conta_desc:     string | null
  conta_codigo:   string | null
  ind_pis_cofins: boolean
  ind_imposto:    boolean
  tipo_imposto:   string | null
  ind_capex:      boolean
  pai_id:         number | null
  pai_desc:       string | null
  ativo:          boolean
  created_at:     string
  updated_at:     string
}

export type TipoDespesaListItem = Pick<
  TipoDespesa,
  'id' | 'codigo' | 'descricao' | 'natureza' | 'conta_desc' | 'ind_pis_cofins' | 'ind_imposto' | 'tipo_imposto' | 'ind_capex' | 'pai_desc' | 'ativo'
>

export interface TipoDespesaListResponse {
  dados:  TipoDespesaListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface PlanoContas {
  id:             number
  empresa_id:     number
  codigo:         string
  descricao:      string
  pai_id:         number | null
  pai_desc:       string | null
  tipo:           'S' | 'A'
  natureza:       'D' | 'C'
  classificacao:  '01' | '02' | '03' | '04' | '05' | '09'
  grupo:          string | null
  ativo:          boolean
  created_at:     string
  updated_at:     string
}

export type PlanoContasListItem = Pick<
  PlanoContas,
  'id' | 'codigo' | 'descricao' | 'pai_id' | 'pai_desc' | 'tipo' | 'natureza' | 'classificacao' | 'grupo' | 'ativo'
>

export interface PlanoContasListResponse {
  dados:  PlanoContasListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface CentroCusto {
  id:         number
  empresa_id: number
  codigo:     string
  descricao:  string
  pai_id:     number | null
  pai_desc:   string | null
  tipo:       'A' | 'S'
  ativo:      boolean
  created_at: string
  updated_at: string
}

export type CentroCustoListItem = Pick<
  CentroCusto,
  'id' | 'codigo' | 'descricao' | 'pai_id' | 'pai_desc' | 'tipo' | 'ativo'
>

export interface CentroCustoListResponse {
  dados:  CentroCustoListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface Banco {
  id:                  number
  codigo_compensacao:  string
  nome:                string
  nome_curto:          string | null
  ativo:               boolean
}

export interface ContaBanco {
  id:            number
  empresa_id:    number
  banco_id:      number
  banco_nome:    string | null
  banco_codigo:  string | null
  mnemonico:     string
  agencia:       string
  agencia_dv:    string | null
  conta:         string
  conta_dv:      string | null
  tipo:          'C' | 'P'
  nome_gerente:  string | null
  telefone:      string | null
  saldo_inicial: string
  saldo_atual:   string
  num_convenio:  string | null
  carteira:      string | null
  limite:        string
  ativo:         boolean
  created_at:    string
  updated_at:    string
}

export type ContaBancoListItem = Pick<
  ContaBanco,
  | 'id' | 'mnemonico' | 'banco_nome' | 'banco_codigo'
  | 'agencia' | 'conta' | 'tipo' | 'saldo_atual' | 'ativo'
>

export interface ContaBancoListResponse {
  dados:  ContaBancoListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface TipoCobranca {
  cod_tipo_cobranca: number
  des_tipo_cobranca: string
  ind_status:        'A' | 'I'
}

export type TipoCobrancaListItem = TipoCobranca

export interface TipoCobrancaListResponse {
  dados:  TipoCobrancaListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

// aliases de compatibilidade
export type FormaPagamentoTipo         = never
export type FormaPagamento             = TipoCobranca
export type FormaPagamentoListItem     = TipoCobrancaListItem
export type FormaPagamentoListResponse = TipoCobrancaListResponse

export interface DespesaParcela {
  id:              number
  numero_parcela:  number
  data_vencimento: string
  valor:           string
  titulo_pagar_id: number | null
}

export interface DespesaRateio {
  id:              number
  centro_custo_id: number
  codigo:          string
  descricao:       string
  percentual:      string
  valor:           string
}

export interface Despesa {
  id:                  number
  empresa_id:          number
  pessoa_id:           number
  pessoa_nome:         string | null
  tipo_despesa_id:       number
  tipo_despesa_desc:     string | null
  tipo_despesa_natureza: string | null
  cod_tipo_cobranca:     number | null
  tipo_cobranca_desc:  string | null
  centro_custo_id:     number | null
  centro_custo_desc:   string | null
  conta_banco_id:      number | null
  conta_banco_desc:    string | null
  ind_avista:          boolean
  destino:             'C' | 'B' | null
  data_despesa:        string
  data_competencia:    string | null
  data_pagamento:      string | null
  documento:           string | null
  valor:               string   // NUMERIC retorna como string no pg
  num_parcelas:        number
  intervalo_dias:      number
  status:              'P' | 'A' | 'C'
  observacao:          string | null
  created_by:          string | null
  created_at:          string
  updated_at:          string
  parcelas?:           DespesaParcela[]
  rateios?:            DespesaRateio[]
}

export type DespesaListItem = Pick<
  Despesa,
  | 'id' | 'data_despesa' | 'documento' | 'pessoa_nome' | 'tipo_despesa_desc'
  | 'tipo_cobranca_desc' | 'valor' | 'num_parcelas' | 'status'
>

export interface DespesaListResponse {
  dados:  DespesaListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface ReceitaParcela {
  id:               number
  numero_parcela:   number
  data_vencimento:  string
  valor:            string
  titulo_receber_id: number | null
}

export interface ReceitaRateio {
  id:              number
  centro_custo_id: number
  codigo:          string
  descricao:       string
  percentual:      string
  valor:           string
}

export interface Receita {
  id:                   number
  empresa_id:           number
  pessoa_id:            number
  pessoa_nome:          string | null
  tipo_receita_id:        number
  tipo_receita_desc:      string | null
  tipo_receita_natureza:  string | null
  cod_tipo_cobranca:      number | null
  tipo_cobranca_desc:   string | null
  centro_custo_id:      number | null
  centro_custo_desc:    string | null
  conta_banco_id:       number | null
  conta_banco_desc:     string | null
  ind_avista:           boolean
  destino:              'C' | 'B' | null
  data_receita:         string
  data_competencia:     string | null
  data_recebimento:     string | null
  documento:            string | null
  valor:                string
  num_parcelas:         number
  intervalo_dias:       number
  status:               'P' | 'A' | 'C'
  observacao:           string | null
  created_by:           string | null
  created_at:           string
  updated_at:           string
  parcelas?:            ReceitaParcela[]
  rateios?:             ReceitaRateio[]
}

export type ReceitaListItem = Pick<
  Receita,
  | 'id' | 'data_receita' | 'documento' | 'pessoa_nome' | 'tipo_receita_desc'
  | 'tipo_cobranca_desc' | 'valor' | 'num_parcelas' | 'status'
>

export interface ReceitaListResponse {
  dados:  ReceitaListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface CondicaoPagamento {
  id:             number
  empresa_id:     number
  descricao:      string
  tipo:           'V' | 'P'
  num_parcelas:   number
  intervalo_dias: number
  entrada_pct:    string
  ativo:          boolean
  created_at:     string
}

export type CondicaoPagamentoListItem = Pick<
  CondicaoPagamento,
  'id' | 'descricao' | 'tipo' | 'num_parcelas' | 'intervalo_dias' | 'entrada_pct' | 'ativo'
>

export interface CondicaoPagamentoListResponse {
  dados:  CondicaoPagamentoListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface TituloPagar {
  id:                   number
  empresa_id:           number
  pessoa_id:            number
  pessoa_nome:          string | null
  tipo_despesa_id:      number | null
  tipo_despesa_desc:    string | null
  cod_tipo_cobranca:    number | null
  tipo_cobranca_desc:   string | null
  centro_custo_id:      number | null
  centro_custo_desc:    string | null
  conta_banco_id:       number | null
  conta_banco_desc:     string | null
  despesa_id:           number | null
  numero_titulo:        string | null
  num_documento:        string | null
  origem_modulo:        string | null
  origem_id:            number | null
  data_emissao:         string
  data_vencimento:      string
  data_liquidacao:      string | null
  data_competencia:     string | null
  valor_original:       string
  valor_juros:          string
  valor_multa:          string
  valor_desconto:       string
  valor_retencao:       string
  valor_liquidado:      string
  destino_liquidacao:   'C' | 'B' | null
  conta_banco_liq_id:   number | null
  conta_banco_liq_desc: string | null
  status:               'A' | 'L' | 'C'
  requer_aprovacao:     boolean
  status_aprovacao:     'P' | 'A' | 'R' | null
  aprovado_por:         string | null
  aprovado_em:          string | null
  codigo_barras:        string | null
  nosso_numero:         string | null
  observacao:           string | null
  created_by:           string | null
  created_at:           string
  updated_at:           string
}

export type TituloPagarListItem = Pick<
  TituloPagar,
  | 'id' | 'numero_titulo' | 'num_documento' | 'pessoa_nome' | 'tipo_despesa_desc'
  | 'tipo_cobranca_desc' | 'centro_custo_desc'
  | 'data_emissao' | 'data_vencimento' | 'data_liquidacao'
  | 'valor_original' | 'valor_liquidado' | 'status'
>

export interface TituloPagarListResponse {
  dados:  TituloPagarListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

// ─── Título a Receber ─────────────────────────────────────────────────────────

export interface TituloReceber {
  id:                   number
  empresa_id:           number
  pessoa_id:            number
  pessoa_nome:          string | null
  tipo_receita_id:      number | null
  tipo_receita_desc:    string | null
  cod_tipo_cobranca:    number | null
  tipo_cobranca_desc:   string | null
  centro_custo_id:      number | null
  centro_custo_desc:    string | null
  conta_banco_id:       number | null
  conta_banco_desc:     string | null
  receita_id:           number | null
  numero_titulo:        string | null
  num_documento:        string | null
  origem_modulo:        string | null
  origem_id:            number | null
  data_emissao:         string
  data_vencimento:      string
  data_liquidacao:      string | null
  data_competencia:     string | null
  valor_original:       string
  valor_juros:          string
  valor_multa:          string
  valor_desconto:       string
  valor_retencao:       string
  valor_liquidado:      string
  destino_liquidacao:   'C' | 'B' | null
  conta_banco_liq_id:   number | null
  conta_banco_liq_desc: string | null
  status:               'A' | 'L' | 'C'
  codigo_barras:        string | null
  nosso_numero:         string | null
  linha_digitavel:      string | null
  observacao:           string | null
  created_by:           string | null
  created_at:           string
  updated_at:           string
}

export type TituloReceberListItem = Pick<
  TituloReceber,
  | 'id' | 'numero_titulo' | 'num_documento' | 'pessoa_nome' | 'tipo_receita_desc'
  | 'tipo_cobranca_desc' | 'centro_custo_desc'
  | 'data_emissao' | 'data_vencimento' | 'data_liquidacao'
  | 'valor_original' | 'valor_liquidado' | 'status'
>

export interface TituloReceberListResponse {
  dados:  TituloReceberListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface MovimentoBanco {
  id:                  number
  empresa_id:          number
  conta_banco_id:      number
  conta_banco_desc:    string | null
  tipo_operacao_id:    number | null
  tipo_operacao_desc:  string | null
  pessoa_id:           number | null
  pessoa_nome:         string | null
  titulo_pagar_id:     number | null
  titulo_receber_id:   number | null
  despesa_id:          number | null
  receita_id:          number | null
  tipo:                'E' | 'S'
  valor:               string
  data_movimento:      string
  data_predatado:      string | null
  data_referencia:     string | null
  documento:           string | null
  observacao:          string | null
  conciliado:          boolean
  data_conciliacao:    string | null
  conciliado_por:      string | null
  created_by:          string | null
  created_at:          string
  origem_tipo:         string | null
  origem_desc:         string | null
}

export type MovimentoBancoListItem = Pick<
  MovimentoBanco,
  | 'id' | 'conta_banco_id' | 'conta_banco_desc' | 'tipo' | 'valor'
  | 'data_movimento' | 'documento' | 'pessoa_nome' | 'conciliado'
  | 'titulo_pagar_id' | 'titulo_receber_id' | 'despesa_id' | 'receita_id'
  | 'tipo_operacao_desc' | 'origem_tipo' | 'origem_desc'
>

export interface MovimentoBancoListResponse {
  dados:  MovimentoBancoListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}

export interface MovimentoCaixa {
  id:                  number
  empresa_id:          number
  tipo_operacao_id:    number | null
  tipo_operacao_desc:  string | null
  pessoa_id:           number | null
  pessoa_nome:         string | null
  titulo_pagar_id:     number | null
  titulo_receber_id:   number | null
  despesa_id:          number | null
  receita_id:          number | null
  tipo:                'E' | 'S'
  valor:               string
  data_movimento:      string
  documento:           string | null
  observacao:          string | null
  conciliado:          boolean
  data_conciliacao:    string | null
  created_by:          string | null
  created_at:          string
  origem_tipo:         string | null
  origem_desc:         string | null
}

export type MovimentoCaixaListItem = Pick<
  MovimentoCaixa,
  | 'id' | 'tipo' | 'valor'
  | 'data_movimento' | 'documento' | 'pessoa_nome' | 'conciliado'
  | 'titulo_pagar_id' | 'titulo_receber_id' | 'despesa_id' | 'receita_id'
  | 'tipo_operacao_desc' | 'origem_tipo' | 'origem_desc'
>

export interface MovimentoCaixaListResponse {
  dados:  MovimentoCaixaListItem[]
  total:  number
  page:   number
  limit:  number
  pages:  number
}
