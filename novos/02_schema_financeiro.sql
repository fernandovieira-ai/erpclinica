-- =============================================================
-- 02_schema_financeiro.sql
-- Módulo financeiro: títulos, despesas, receitas, caixa, banco
-- Toda lógica de movimento via TRIGGER
-- Rodar no database do cliente: fin_{slug}
-- Depende de: 01_schema_cadastros.sql
-- =============================================================

SET client_encoding = 'LATIN1';

-- =============================================================
-- TABELA: tab_tipo_operacao_caixa
-- Natureza dos lançamentos (plano de operações)
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_tipo_operacao_caixa (
  id          SERIAL        PRIMARY KEY,
  empresa_id  INT           NOT NULL REFERENCES tab_empresa(id),
  descricao   VARCHAR(80)   NOT NULL,
  tipo        CHAR(1)       NOT NULL CHECK (tipo IN ('E','S')),
  ativo       BOOLEAN       NOT NULL DEFAULT true,
  UNIQUE (empresa_id, descricao)
);
CREATE INDEX idx_toc_empresa ON tab_tipo_operacao_caixa(empresa_id);

-- =============================================================
-- TABELA: tab_movimento_caixa
-- Padrão EMSys3: tipo E/S + valor sempre positivo
-- FKs para despesa/receita/títulos adicionadas após suas tabelas
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_movimento_caixa (
  id                  SERIAL        PRIMARY KEY,
  empresa_id          INT           NOT NULL REFERENCES tab_empresa(id),
  tipo_operacao_id    INT           REFERENCES tab_tipo_operacao_caixa(id),
  pessoa_id           INT           REFERENCES tab_pessoa(id),
  titulo_pagar_id     INT,
  titulo_receber_id   INT,
  despesa_id          INT,
  receita_id          INT,
  tipo                CHAR(1)       NOT NULL CHECK (tipo IN ('E','S')),
  valor               NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  data_movimento      DATE          NOT NULL DEFAULT CURRENT_DATE,
  documento           VARCHAR(50),
  observacao          TEXT,
  conciliado          BOOLEAN       NOT NULL DEFAULT false,
  data_conciliacao    DATE,
  created_by          VARCHAR(100),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mc_empresa  ON tab_movimento_caixa(empresa_id);
CREATE INDEX idx_mc_data     ON tab_movimento_caixa(empresa_id, data_movimento);
CREATE INDEX idx_mc_tipo     ON tab_movimento_caixa(empresa_id, tipo);
CREATE INDEX idx_mc_despesa  ON tab_movimento_caixa(despesa_id);
CREATE INDEX idx_mc_receita  ON tab_movimento_caixa(receita_id);
CREATE INDEX idx_mc_tp       ON tab_movimento_caixa(titulo_pagar_id);
CREATE INDEX idx_mc_tr       ON tab_movimento_caixa(titulo_receber_id);

COMMENT ON COLUMN tab_movimento_caixa.tipo IS 'E=Entrada S=Saída — valor sempre positivo';

-- =============================================================
-- TABELA: tab_movimento_banco
-- Padrão EMSys3: tipo E/S + valor sempre positivo
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_movimento_banco (
  id                  SERIAL        PRIMARY KEY,
  empresa_id          INT           NOT NULL REFERENCES tab_empresa(id),
  conta_banco_id      INT           NOT NULL REFERENCES tab_conta_banco(id),
  tipo_operacao_id    INT           REFERENCES tab_tipo_operacao_caixa(id),
  pessoa_id           INT           REFERENCES tab_pessoa(id),
  titulo_pagar_id     INT,
  titulo_receber_id   INT,
  despesa_id          INT,
  receita_id          INT,
  tipo                CHAR(1)       NOT NULL CHECK (tipo IN ('E','S')),
  valor               NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  data_movimento      DATE          NOT NULL DEFAULT CURRENT_DATE,
  data_predatado      DATE,
  data_referencia     DATE,
  documento           VARCHAR(50),
  observacao          TEXT,
  conciliado          BOOLEAN       NOT NULL DEFAULT false,
  data_conciliacao    DATE,
  conciliado_por      VARCHAR(100),
  created_by          VARCHAR(100),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mb_empresa    ON tab_movimento_banco(empresa_id);
CREATE INDEX idx_mb_conta      ON tab_movimento_banco(conta_banco_id);
CREATE INDEX idx_mb_data       ON tab_movimento_banco(empresa_id, data_movimento);
CREATE INDEX idx_mb_conciliado ON tab_movimento_banco(conta_banco_id, conciliado);
CREATE INDEX idx_mb_despesa    ON tab_movimento_banco(despesa_id);
CREATE INDEX idx_mb_receita    ON tab_movimento_banco(receita_id);
CREATE INDEX idx_mb_tp         ON tab_movimento_banco(titulo_pagar_id);
CREATE INDEX idx_mb_tr         ON tab_movimento_banco(titulo_receber_id);

COMMENT ON COLUMN tab_movimento_banco.tipo            IS 'E=Entrada S=Saída — valor sempre positivo';
COMMENT ON COLUMN tab_movimento_banco.data_predatado  IS 'Data futura para cheques pré-datados';
COMMENT ON COLUMN tab_movimento_banco.data_referencia IS 'Competência para DRE';

-- =============================================================
-- TABELA: tab_fechamento_caixa
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_fechamento_caixa (
  id                SERIAL        PRIMARY KEY,
  empresa_id        INT           NOT NULL REFERENCES tab_empresa(id),
  data_fechamento   DATE          NOT NULL,
  saldo_inicial     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_entradas    NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_saidas      NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_calculado   NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_informado   NUMERIC(15,2) NOT NULL DEFAULT 0,
  diferenca         NUMERIC(15,2) NOT NULL DEFAULT 0,
  status            CHAR(1)       NOT NULL DEFAULT 'A' CHECK (status IN ('A','F')),
  observacao        TEXT,
  fechado_por       VARCHAR(100),
  fechado_em        TIMESTAMPTZ,
  created_by        VARCHAR(100),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, data_fechamento)
);
CREATE INDEX idx_fc_empresa ON tab_fechamento_caixa(empresa_id);
CREATE INDEX idx_fc_data    ON tab_fechamento_caixa(empresa_id, data_fechamento DESC);

-- =============================================================
-- TABELA: tab_transferencia_conta
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_transferencia_conta (
  id                   SERIAL        PRIMARY KEY,
  empresa_id           INT           NOT NULL REFERENCES tab_empresa(id),
  conta_origem_id      INT           NOT NULL REFERENCES tab_conta_banco(id),
  conta_destino_id     INT           NOT NULL REFERENCES tab_conta_banco(id),
  valor                NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  data_transferencia   DATE          NOT NULL DEFAULT CURRENT_DATE,
  movimento_saida_id   INT           REFERENCES tab_movimento_banco(id),
  movimento_entrada_id INT           REFERENCES tab_movimento_banco(id),
  observacao           TEXT,
  created_by           VARCHAR(100),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK (conta_origem_id <> conta_destino_id)
);
CREATE INDEX idx_tc_empresa ON tab_transferencia_conta(empresa_id);
CREATE INDEX idx_tc_data    ON tab_transferencia_conta(empresa_id, data_transferencia);

-- =============================================================
-- TABELA: tab_titulo_pagar
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_titulo_pagar (
  id                  SERIAL        PRIMARY KEY,
  empresa_id          INT           NOT NULL REFERENCES tab_empresa(id),
  pessoa_id           INT           NOT NULL REFERENCES tab_pessoa(id),
  tipo_despesa_id     INT           REFERENCES tab_tipo_despesa(id),
  cod_tipo_cobranca   INT           REFERENCES tab_tipo_cobranca(cod_tipo_cobranca),
  centro_custo_id     INT           REFERENCES tab_centro_custo(id),
  conta_banco_id      INT           REFERENCES tab_conta_banco(id),
  despesa_id          INT,          -- FK adicionada após tab_despesa
  numero_titulo       VARCHAR(30),
  num_documento       VARCHAR(50),
  origem_modulo       VARCHAR(3),   -- 'NFE','DES','MAN'
  origem_id           INT,
  data_emissao        DATE          NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento     DATE          NOT NULL,
  data_liquidacao     DATE,
  data_competencia    DATE,
  valor_original      NUMERIC(15,2) NOT NULL CHECK (valor_original > 0),
  valor_juros         NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_multa         NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_desconto      NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_retencao      NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_liquidado     NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Liquidação
  destino_liquidacao  CHAR(1)       CHECK (destino_liquidacao IN ('C','B')),  -- C=Caixa B=Banco
  conta_banco_liq_id  INT           REFERENCES tab_conta_banco(id),           -- conta debitada na liquidação
  movimento_caixa_id  INT,          -- FK adicionada após tab_movimento_caixa
  movimento_banco_id  INT,          -- FK adicionada após tab_movimento_banco
  status              CHAR(1)       NOT NULL DEFAULT 'A' CHECK (status IN ('A','L','C')),
  requer_aprovacao    BOOLEAN       NOT NULL DEFAULT false,
  status_aprovacao    CHAR(1)       CHECK (status_aprovacao IN ('P','A','R')),
  aprovado_por        VARCHAR(100),
  aprovado_em         TIMESTAMPTZ,
  codigo_barras       VARCHAR(50),
  nosso_numero        VARCHAR(20),
  observacao          TEXT,
  created_by          VARCHAR(100),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tp_empresa    ON tab_titulo_pagar(empresa_id);
CREATE INDEX idx_tp_pessoa     ON tab_titulo_pagar(pessoa_id);
CREATE INDEX idx_tp_status     ON tab_titulo_pagar(empresa_id, status);
CREATE INDEX idx_tp_vencimento ON tab_titulo_pagar(empresa_id, data_vencimento);
CREATE INDEX idx_tp_origem     ON tab_titulo_pagar(origem_modulo, origem_id);
CREATE INDEX idx_tp_despesa    ON tab_titulo_pagar(despesa_id);

CREATE TRIGGER trg_tp_updated_at
  BEFORE UPDATE ON tab_titulo_pagar
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =============================================================
-- TABELA: tab_titulo_pagar_parcela
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_titulo_pagar_parcela (
  id              SERIAL        PRIMARY KEY,
  titulo_id       INT           NOT NULL REFERENCES tab_titulo_pagar(id),
  numero_parcela  INT           NOT NULL DEFAULT 1,
  data_vencimento DATE          NOT NULL,
  valor           NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  valor_juros     NUMERIC(15,2) NOT NULL DEFAULT 0,
  status          CHAR(1)       NOT NULL DEFAULT 'A' CHECK (status IN ('A','L','C')),
  UNIQUE (titulo_id, numero_parcela)
);
CREATE INDEX idx_tpp_titulo     ON tab_titulo_pagar_parcela(titulo_id);
CREATE INDEX idx_tpp_vencimento ON tab_titulo_pagar_parcela(data_vencimento);

-- =============================================================
-- TABELA: tab_titulo_pagar_retencao
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_titulo_pagar_retencao (
  id              SERIAL        PRIMARY KEY,
  titulo_id       INT           NOT NULL REFERENCES tab_titulo_pagar(id),
  tipo_imposto    VARCHAR(10)   NOT NULL
                    CHECK (tipo_imposto IN ('IRRF','CSLL','PIS','COFINS','CSRF','INSS','ISS','OUTROS')),
  base_calculo    NUMERIC(15,2) NOT NULL DEFAULT 0,
  aliquota        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  valor_retencao  NUMERIC(15,2) NOT NULL DEFAULT 0,
  data_vencimento DATE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tpr_titulo ON tab_titulo_pagar_retencao(titulo_id);

-- =============================================================
-- TABELA: tab_titulo_receber
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_titulo_receber (
  id                  SERIAL        PRIMARY KEY,
  empresa_id          INT           NOT NULL REFERENCES tab_empresa(id),
  pessoa_id           INT           NOT NULL REFERENCES tab_pessoa(id),
  tipo_receita_id     INT           REFERENCES tab_tipo_receita(id),
  cod_tipo_cobranca   INT           REFERENCES tab_tipo_cobranca(cod_tipo_cobranca),
  centro_custo_id     INT           REFERENCES tab_centro_custo(id),
  conta_banco_id      INT           REFERENCES tab_conta_banco(id),
  receita_id          INT,          -- FK adicionada após tab_receita
  numero_titulo       VARCHAR(30)   NOT NULL,
  num_documento       VARCHAR(50),
  origem_modulo       VARCHAR(3),   -- 'NFE','REC','MAN'
  origem_id           INT,
  data_emissao        DATE          NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento     DATE          NOT NULL,
  data_liquidacao     DATE,
  data_competencia    DATE,
  valor_original      NUMERIC(15,2) NOT NULL CHECK (valor_original > 0),
  valor_juros         NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_multa         NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_desconto      NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_retencao      NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_liquidado     NUMERIC(15,2) NOT NULL DEFAULT 0,
  status              CHAR(1)       NOT NULL DEFAULT 'A' CHECK (status IN ('A','L','C')),
  boleto_impresso     BOOLEAN       NOT NULL DEFAULT false,
  codigo_barras       VARCHAR(50),
  nosso_numero        VARCHAR(20),
  linha_digitavel     VARCHAR(60),
  -- Liquidação (espelho do tab_titulo_pagar)
  destino_liquidacao  CHAR(1)       CHECK (destino_liquidacao IN ('C','B')),
  conta_banco_liq_id  INT           REFERENCES tab_conta_banco(id),
  movimento_caixa_id  INT,          -- FK adicionada após tab_movimento_caixa
  movimento_banco_id  INT,          -- FK adicionada após tab_movimento_banco
  observacao          TEXT,
  created_by          VARCHAR(100),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trec_empresa    ON tab_titulo_receber(empresa_id);
CREATE INDEX idx_trec_pessoa     ON tab_titulo_receber(pessoa_id);
CREATE INDEX idx_trec_status     ON tab_titulo_receber(empresa_id, status);
CREATE INDEX idx_trec_vencimento ON tab_titulo_receber(empresa_id, data_vencimento);
CREATE INDEX idx_trec_origem     ON tab_titulo_receber(origem_modulo, origem_id);
CREATE INDEX idx_trec_receita    ON tab_titulo_receber(receita_id);

CREATE TRIGGER trg_tr_updated_at
  BEFORE UPDATE ON tab_titulo_receber
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- =============================================================
-- TABELA: tab_titulo_receber_parcela
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_titulo_receber_parcela (
  id              SERIAL        PRIMARY KEY,
  titulo_id       INT           NOT NULL REFERENCES tab_titulo_receber(id),
  numero_parcela  INT           NOT NULL DEFAULT 1,
  data_vencimento DATE          NOT NULL,
  valor           NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  valor_juros     NUMERIC(15,2) NOT NULL DEFAULT 0,
  status          CHAR(1)       NOT NULL DEFAULT 'A' CHECK (status IN ('A','L','C')),
  UNIQUE (titulo_id, numero_parcela)
);
CREATE INDEX idx_trp_titulo     ON tab_titulo_receber_parcela(titulo_id);
CREATE INDEX idx_trp_vencimento ON tab_titulo_receber_parcela(data_vencimento);

-- =============================================================
-- TABELA: tab_titulo_receber_retencao
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_titulo_receber_retencao (
  id              SERIAL        PRIMARY KEY,
  titulo_id       INT           NOT NULL REFERENCES tab_titulo_receber(id),
  tipo_imposto    VARCHAR(10)   NOT NULL
                    CHECK (tipo_imposto IN ('PIS','COFINS','CSLL','IRRF','ISS','OUTROS')),
  base_calculo    NUMERIC(15,2) NOT NULL DEFAULT 0,
  aliquota        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  valor_retencao  NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trr_titulo ON tab_titulo_receber_retencao(titulo_id);

-- =============================================================
-- TABELA: tab_despesa
-- ind_avista=true  → trigger gera movimento direto (caixa ou banco)
-- ind_avista=false → trigger gera parcelas + títulos a pagar
-- destino: C=Caixa, B=Banco
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_despesa (
  id                  SERIAL        PRIMARY KEY,
  empresa_id          INT           NOT NULL REFERENCES tab_empresa(id),
  pessoa_id           INT           NOT NULL REFERENCES tab_pessoa(id),
  tipo_despesa_id     INT           NOT NULL REFERENCES tab_tipo_despesa(id),
  cod_tipo_cobranca   INT           REFERENCES tab_tipo_cobranca(cod_tipo_cobranca),
  centro_custo_id     INT           REFERENCES tab_centro_custo(id),
  tipo_operacao_id    INT           REFERENCES tab_tipo_operacao_caixa(id),
  -- À vista ou a prazo
  ind_avista          BOOLEAN       NOT NULL DEFAULT false,
  destino             CHAR(1)       CHECK (destino IN ('C','B')),
  conta_banco_id      INT           REFERENCES tab_conta_banco(id),
  -- Datas
  data_despesa        DATE          NOT NULL DEFAULT CURRENT_DATE,
  data_competencia    DATE,
  data_pagamento      DATE,         -- preenchido pelo trigger se à vista
  -- Valores
  documento           VARCHAR(50),
  valor               NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  num_parcelas        INT           NOT NULL DEFAULT 1 CHECK (num_parcelas >= 1),
  intervalo_dias      INT           NOT NULL DEFAULT 30,
  -- Status: P=Pendente, A=Aprovada/Paga, C=Cancelada
  status              CHAR(1)       NOT NULL DEFAULT 'A' CHECK (status IN ('P','A','C')),
  -- Vínculos gerados automaticamente pelo trigger
  movimento_caixa_id  INT           REFERENCES tab_movimento_caixa(id),
  movimento_banco_id  INT           REFERENCES tab_movimento_banco(id),
  observacao          TEXT,
  created_by          VARCHAR(100),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_desp_empresa      ON tab_despesa(empresa_id);
CREATE INDEX idx_desp_status       ON tab_despesa(empresa_id, status);
CREATE INDEX idx_desp_data         ON tab_despesa(empresa_id, data_despesa);
CREATE INDEX idx_desp_tipo_despesa ON tab_despesa(tipo_despesa_id);

CREATE TRIGGER trg_despesa_updated_at
  BEFORE UPDATE ON tab_despesa
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON COLUMN tab_despesa.ind_avista         IS 'true=movimento direto, false=gera títulos a pagar';
COMMENT ON COLUMN tab_despesa.destino            IS 'C=Caixa B=Banco — obrigatório se ind_avista=true';
COMMENT ON COLUMN tab_despesa.conta_banco_id     IS 'Obrigatório se destino=B';
COMMENT ON COLUMN tab_despesa.movimento_caixa_id IS 'Preenchido pelo trigger (pagamento em caixa)';
COMMENT ON COLUMN tab_despesa.movimento_banco_id IS 'Preenchido pelo trigger (pagamento em banco)';

-- =============================================================
-- TABELA: tab_despesa_parcela
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_despesa_parcela (
  id              SERIAL        PRIMARY KEY,
  despesa_id      INT           NOT NULL REFERENCES tab_despesa(id),
  numero_parcela  INT           NOT NULL DEFAULT 1,
  data_vencimento DATE          NOT NULL,
  valor           NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  titulo_pagar_id INT           REFERENCES tab_titulo_pagar(id),
  UNIQUE (despesa_id, numero_parcela)
);
CREATE INDEX idx_dp_despesa ON tab_despesa_parcela(despesa_id);
CREATE INDEX idx_dp_titulo  ON tab_despesa_parcela(titulo_pagar_id);

-- =============================================================
-- TABELA: tab_despesa_rateio
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_despesa_rateio (
  id              SERIAL        PRIMARY KEY,
  despesa_id      INT           NOT NULL REFERENCES tab_despesa(id),
  centro_custo_id INT           NOT NULL REFERENCES tab_centro_custo(id),
  percentual      NUMERIC(5,2)  NOT NULL CHECK (percentual > 0 AND percentual <= 100),
  valor           NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  UNIQUE (despesa_id, centro_custo_id)
);

-- =============================================================
-- TABELA: tab_receita
-- ind_avista=true  → trigger gera movimento direto
-- ind_avista=false → trigger gera parcelas + títulos a receber
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_receita (
  id                  SERIAL        PRIMARY KEY,
  empresa_id          INT           NOT NULL REFERENCES tab_empresa(id),
  pessoa_id           INT           NOT NULL REFERENCES tab_pessoa(id),
  tipo_receita_id     INT           NOT NULL REFERENCES tab_tipo_receita(id),
  cod_tipo_cobranca   INT           REFERENCES tab_tipo_cobranca(cod_tipo_cobranca),
  centro_custo_id     INT           REFERENCES tab_centro_custo(id),
  tipo_operacao_id    INT           REFERENCES tab_tipo_operacao_caixa(id),
  -- À vista ou a prazo
  ind_avista          BOOLEAN       NOT NULL DEFAULT false,
  destino             CHAR(1)       CHECK (destino IN ('C','B')),
  conta_banco_id      INT           REFERENCES tab_conta_banco(id),
  -- Datas
  data_receita        DATE          NOT NULL DEFAULT CURRENT_DATE,
  data_competencia    DATE,
  data_recebimento    DATE,
  -- Valores
  documento           VARCHAR(50),
  valor               NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  num_parcelas        INT           NOT NULL DEFAULT 1 CHECK (num_parcelas >= 1),
  intervalo_dias      INT           NOT NULL DEFAULT 30,
  status              CHAR(1)       NOT NULL DEFAULT 'A' CHECK (status IN ('P','A','C')),
  -- Vínculos gerados pelo trigger
  movimento_caixa_id  INT           REFERENCES tab_movimento_caixa(id),
  movimento_banco_id  INT           REFERENCES tab_movimento_banco(id),
  observacao          TEXT,
  created_by          VARCHAR(100),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rec_empresa      ON tab_receita(empresa_id);
CREATE INDEX idx_rec_status       ON tab_receita(empresa_id, status);
CREATE INDEX idx_rec_data         ON tab_receita(empresa_id, data_receita);
CREATE INDEX idx_rec_tipo_receita ON tab_receita(tipo_receita_id);

CREATE TRIGGER trg_receita_updated_at
  BEFORE UPDATE ON tab_receita
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON COLUMN tab_receita.ind_avista         IS 'true=movimento direto, false=gera títulos a receber';
COMMENT ON COLUMN tab_receita.destino            IS 'C=Caixa B=Banco — obrigatório se ind_avista=true';
COMMENT ON COLUMN tab_receita.movimento_caixa_id IS 'Preenchido pelo trigger (recebimento em caixa)';
COMMENT ON COLUMN tab_receita.movimento_banco_id IS 'Preenchido pelo trigger (recebimento em banco)';

-- =============================================================
-- TABELA: tab_receita_parcela
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_receita_parcela (
  id                SERIAL        PRIMARY KEY,
  receita_id        INT           NOT NULL REFERENCES tab_receita(id),
  numero_parcela    INT           NOT NULL DEFAULT 1,
  data_vencimento   DATE          NOT NULL,
  valor             NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  titulo_receber_id INT           REFERENCES tab_titulo_receber(id),
  UNIQUE (receita_id, numero_parcela)
);
CREATE INDEX idx_rp_receita ON tab_receita_parcela(receita_id);
CREATE INDEX idx_rp_titulo  ON tab_receita_parcela(titulo_receber_id);

-- =============================================================
-- TABELA: tab_receita_rateio
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_receita_rateio (
  id              SERIAL        PRIMARY KEY,
  receita_id      INT           NOT NULL REFERENCES tab_receita(id),
  centro_custo_id INT           NOT NULL REFERENCES tab_centro_custo(id),
  percentual      NUMERIC(5,2)  NOT NULL CHECK (percentual > 0 AND percentual <= 100),
  valor           NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  UNIQUE (receita_id, centro_custo_id)
);

-- =============================================================
-- FK CONSTRAINTS TARDIAS
-- Resolvem referências circulares entre as tabelas
-- =============================================================
ALTER TABLE tab_movimento_caixa
  ADD CONSTRAINT fk_mc_titulo_pagar    FOREIGN KEY (titulo_pagar_id)   REFERENCES tab_titulo_pagar(id),
  ADD CONSTRAINT fk_mc_titulo_receber  FOREIGN KEY (titulo_receber_id) REFERENCES tab_titulo_receber(id),
  ADD CONSTRAINT fk_mc_despesa         FOREIGN KEY (despesa_id)        REFERENCES tab_despesa(id),
  ADD CONSTRAINT fk_mc_receita         FOREIGN KEY (receita_id)        REFERENCES tab_receita(id);

ALTER TABLE tab_movimento_banco
  ADD CONSTRAINT fk_mb_titulo_pagar    FOREIGN KEY (titulo_pagar_id)   REFERENCES tab_titulo_pagar(id),
  ADD CONSTRAINT fk_mb_titulo_receber  FOREIGN KEY (titulo_receber_id) REFERENCES tab_titulo_receber(id),
  ADD CONSTRAINT fk_mb_despesa         FOREIGN KEY (despesa_id)        REFERENCES tab_despesa(id),
  ADD CONSTRAINT fk_mb_receita         FOREIGN KEY (receita_id)        REFERENCES tab_receita(id);

ALTER TABLE tab_titulo_pagar
  ADD CONSTRAINT fk_tp_despesa         FOREIGN KEY (despesa_id)        REFERENCES tab_despesa(id),
  ADD CONSTRAINT fk_tp_mov_caixa       FOREIGN KEY (movimento_caixa_id) REFERENCES tab_movimento_caixa(id),
  ADD CONSTRAINT fk_tp_mov_banco       FOREIGN KEY (movimento_banco_id) REFERENCES tab_movimento_banco(id);

ALTER TABLE tab_titulo_receber
  ADD CONSTRAINT fk_tr_receita     FOREIGN KEY (receita_id)         REFERENCES tab_receita(id),
  ADD CONSTRAINT fk_tr_mov_caixa   FOREIGN KEY (movimento_caixa_id)  REFERENCES tab_movimento_caixa(id),
  ADD CONSTRAINT fk_tr_mov_banco   FOREIGN KEY (movimento_banco_id)  REFERENCES tab_movimento_banco(id);

-- =============================================================
-- TRIGGER: fn_trigger_despesa
-- AFTER INSERT OR UPDATE OF status ON tab_despesa
--
-- Quando status='A':
--   ind_avista=true  + destino='C' → INSERT tab_movimento_caixa (S)
--   ind_avista=true  + destino='B' → INSERT tab_movimento_banco  (S)
--   ind_avista=false               → gera parcelas + tab_titulo_pagar
-- =============================================================
CREATE OR REPLACE FUNCTION fn_trigger_despesa()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_caixa_id  INT;
  v_mov_banco_id  INT;
  v_titulo_id     INT;
  v_data_venc     DATE;
  v_valor_parcela NUMERIC(15,2);
  v_i             INT;
BEGIN
  -- Só processa quando status chega em 'A'
  IF NEW.status <> 'A' THEN RETURN NEW; END IF;
  -- Evita reprocessar em updates que não alteram status
  IF TG_OP = 'UPDATE' AND OLD.status = 'A' THEN RETURN NEW; END IF;

  -- Validações
  IF (NEW.destino IS NOT NULL OR NEW.ind_avista) AND NEW.destino IS NULL THEN
    RAISE EXCEPTION 'Despesa à vista requer destino: C=Caixa ou B=Banco';
  END IF;
  IF NEW.destino = 'B' AND NEW.conta_banco_id IS NULL THEN
    RAISE EXCEPTION 'Pagamento em banco requer conta_banco_id';
  END IF;

  -- ── PAGAMENTO DIRETO (destino informado OU ind_avista) ───
  IF NEW.destino IS NOT NULL OR NEW.ind_avista THEN
    IF NEW.destino IS NULL THEN
      RAISE EXCEPTION 'Despesa à vista requer destino: C=Caixa ou B=Banco';
    END IF;

    IF NEW.destino = 'C' THEN
      INSERT INTO tab_movimento_caixa (
        empresa_id, tipo_operacao_id, pessoa_id, despesa_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.tipo_operacao_id, NEW.pessoa_id, NEW.id,
        'S', NEW.valor,
        COALESCE(NEW.data_pagamento, NEW.data_despesa),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_caixa_id;

      UPDATE tab_despesa SET
        movimento_caixa_id = v_mov_caixa_id,
        data_pagamento     = COALESCE(NEW.data_pagamento, NEW.data_despesa)
      WHERE id = NEW.id;

    ELSE -- destino = 'B'
      INSERT INTO tab_movimento_banco (
        empresa_id, conta_banco_id, tipo_operacao_id, pessoa_id, despesa_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.conta_banco_id, NEW.tipo_operacao_id,
        NEW.pessoa_id, NEW.id,
        'S', NEW.valor,
        COALESCE(NEW.data_pagamento, NEW.data_despesa),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_banco_id;

      UPDATE tab_despesa SET
        movimento_banco_id = v_mov_banco_id,
        data_pagamento     = COALESCE(NEW.data_pagamento, NEW.data_despesa)
      WHERE id = NEW.id;
    END IF;

  -- ── A PRAZO ───────────────────────────────────────────────
  ELSE
    v_valor_parcela := ROUND(NEW.valor / NEW.num_parcelas, 2);

    FOR v_i IN 1..NEW.num_parcelas LOOP
      v_data_venc := NEW.data_despesa + (v_i * NEW.intervalo_dias);

      INSERT INTO tab_titulo_pagar (
        empresa_id, pessoa_id, tipo_despesa_id, cod_tipo_cobranca,
        centro_custo_id, conta_banco_id, despesa_id,
        numero_titulo, num_documento, origem_modulo, origem_id,
        data_emissao, data_vencimento, data_competencia,
        valor_original, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.pessoa_id, NEW.tipo_despesa_id,
        NEW.cod_tipo_cobranca, NEW.centro_custo_id,
        NEW.conta_banco_id, NEW.id,
        NEW.id || '/' || LPAD(v_i::TEXT, 2, '0'),
        NEW.documento, 'DES', NEW.id,
        NEW.data_despesa, v_data_venc,
        COALESCE(NEW.data_competencia, NEW.data_despesa),
        v_valor_parcela, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_titulo_id;

      INSERT INTO tab_despesa_parcela (
        despesa_id, numero_parcela, data_vencimento, valor, titulo_pagar_id
      ) VALUES (
        NEW.id, v_i, v_data_venc, v_valor_parcela, v_titulo_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_despesa_movimentos
  AFTER INSERT OR UPDATE OF status ON tab_despesa
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_despesa();

-- =============================================================
-- TRIGGER: fn_trigger_estorno_despesa
-- Ao cancelar (status A/P → C): exclui movimento gerado
-- =============================================================
CREATE OR REPLACE FUNCTION fn_trigger_estorno_despesa()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_banco_id     INT;
  v_mov_caixa_id     INT;
  v_banco_conciliado BOOLEAN;
  v_caixa_conciliado BOOLEAN;
  v_del_banco        BOOLEAN := false;
  v_del_caixa        BOOLEAN := false;
BEGIN
  IF NOT (NEW.status = 'C' AND OLD.status <> 'C') THEN
    RETURN NEW;
  END IF;

  v_mov_banco_id := OLD.movimento_banco_id;
  v_mov_caixa_id := OLD.movimento_caixa_id;

  IF v_mov_banco_id IS NULL THEN
    SELECT id INTO v_mov_banco_id FROM tab_movimento_banco
    WHERE despesa_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;
  IF v_mov_caixa_id IS NULL THEN
    SELECT id INTO v_mov_caixa_id FROM tab_movimento_caixa
    WHERE despesa_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;

  IF v_mov_banco_id IS NOT NULL THEN
    SELECT conciliado INTO v_banco_conciliado FROM tab_movimento_banco WHERE id = v_mov_banco_id;
    v_del_banco := NOT COALESCE(v_banco_conciliado, false);
  END IF;
  IF v_mov_caixa_id IS NOT NULL THEN
    SELECT conciliado INTO v_caixa_conciliado FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
    v_del_caixa := NOT COALESCE(v_caixa_conciliado, false);
  END IF;

  UPDATE tab_despesa SET
    movimento_banco_id = CASE WHEN v_del_banco THEN NULL ELSE movimento_banco_id END,
    movimento_caixa_id = CASE WHEN v_del_caixa THEN NULL ELSE movimento_caixa_id END
  WHERE id = OLD.id;

  IF v_del_banco THEN DELETE FROM tab_movimento_banco WHERE id = v_mov_banco_id; END IF;
  IF v_del_caixa THEN DELETE FROM tab_movimento_caixa WHERE id = v_mov_caixa_id; END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_despesa_estorno
  AFTER UPDATE OF status ON tab_despesa
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_estorno_despesa();

-- =============================================================
-- TRIGGER: fn_trigger_receita
-- Espelho do fn_trigger_despesa para receitas
-- =============================================================
CREATE OR REPLACE FUNCTION fn_trigger_receita()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_caixa_id  INT;
  v_mov_banco_id  INT;
  v_titulo_id     INT;
  v_data_venc     DATE;
  v_valor_parcela NUMERIC(15,2);
  v_i             INT;
BEGIN
  IF NEW.status <> 'A' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'A' THEN RETURN NEW; END IF;

  IF (NEW.destino IS NOT NULL OR NEW.ind_avista) AND NEW.destino IS NULL THEN
    RAISE EXCEPTION 'Receita à vista requer destino: C=Caixa ou B=Banco';
  END IF;
  IF NEW.destino = 'B' AND NEW.conta_banco_id IS NULL THEN
    RAISE EXCEPTION 'Recebimento em banco requer conta_banco_id';
  END IF;

  -- ── RECEBIMENTO DIRETO (destino informado OU ind_avista) ─
  IF NEW.destino IS NOT NULL OR NEW.ind_avista THEN
    IF NEW.destino IS NULL THEN
      RAISE EXCEPTION 'Receita à vista requer destino: C=Caixa ou B=Banco';
    END IF;

    IF NEW.destino = 'C' THEN
      INSERT INTO tab_movimento_caixa (
        empresa_id, tipo_operacao_id, pessoa_id, receita_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.tipo_operacao_id, NEW.pessoa_id, NEW.id,
        'E', NEW.valor,
        COALESCE(NEW.data_recebimento, NEW.data_receita),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_caixa_id;

      UPDATE tab_receita SET
        movimento_caixa_id = v_mov_caixa_id,
        data_recebimento   = COALESCE(NEW.data_recebimento, NEW.data_receita)
      WHERE id = NEW.id;

    ELSE -- destino = 'B'
      INSERT INTO tab_movimento_banco (
        empresa_id, conta_banco_id, tipo_operacao_id, pessoa_id, receita_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.conta_banco_id, NEW.tipo_operacao_id,
        NEW.pessoa_id, NEW.id,
        'E', NEW.valor,
        COALESCE(NEW.data_recebimento, NEW.data_receita),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_banco_id;

      UPDATE tab_receita SET
        movimento_banco_id = v_mov_banco_id,
        data_recebimento   = COALESCE(NEW.data_recebimento, NEW.data_receita)
      WHERE id = NEW.id;
    END IF;

  -- ── A PRAZO ───────────────────────────────────────────────
  ELSE
    v_valor_parcela := ROUND(NEW.valor / NEW.num_parcelas, 2);

    FOR v_i IN 1..NEW.num_parcelas LOOP
      v_data_venc := NEW.data_receita + (v_i * NEW.intervalo_dias);

      INSERT INTO tab_titulo_receber (
        empresa_id, pessoa_id, tipo_receita_id, cod_tipo_cobranca,
        centro_custo_id, conta_banco_id, receita_id,
        numero_titulo, num_documento, origem_modulo, origem_id,
        data_emissao, data_vencimento, data_competencia,
        valor_original, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.pessoa_id, NEW.tipo_receita_id,
        NEW.cod_tipo_cobranca, NEW.centro_custo_id,
        NEW.conta_banco_id, NEW.id,
        NEW.id || '/' || LPAD(v_i::TEXT, 2, '0'),
        NEW.documento, 'REC', NEW.id,
        NEW.data_receita, v_data_venc,
        COALESCE(NEW.data_competencia, NEW.data_receita),
        v_valor_parcela, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_titulo_id;

      INSERT INTO tab_receita_parcela (
        receita_id, numero_parcela, data_vencimento, valor, titulo_receber_id
      ) VALUES (
        NEW.id, v_i, v_data_venc, v_valor_parcela, v_titulo_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_receita_movimentos
  AFTER INSERT OR UPDATE OF status ON tab_receita
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_receita();

-- =============================================================
-- TRIGGER: fn_trigger_estorno_receita
-- Ao cancelar (status A/P → C): exclui movimento gerado
-- =============================================================
CREATE OR REPLACE FUNCTION fn_trigger_estorno_receita()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_banco_id     INT;
  v_mov_caixa_id     INT;
  v_banco_conciliado BOOLEAN;
  v_caixa_conciliado BOOLEAN;
  v_del_banco        BOOLEAN := false;
  v_del_caixa        BOOLEAN := false;
BEGIN
  IF NOT (NEW.status = 'C' AND OLD.status <> 'C') THEN
    RETURN NEW;
  END IF;

  v_mov_banco_id := OLD.movimento_banco_id;
  v_mov_caixa_id := OLD.movimento_caixa_id;

  IF v_mov_banco_id IS NULL THEN
    SELECT id INTO v_mov_banco_id FROM tab_movimento_banco
    WHERE receita_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;
  IF v_mov_caixa_id IS NULL THEN
    SELECT id INTO v_mov_caixa_id FROM tab_movimento_caixa
    WHERE receita_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;

  IF v_mov_banco_id IS NOT NULL THEN
    SELECT conciliado INTO v_banco_conciliado FROM tab_movimento_banco WHERE id = v_mov_banco_id;
    v_del_banco := NOT COALESCE(v_banco_conciliado, false);
  END IF;
  IF v_mov_caixa_id IS NOT NULL THEN
    SELECT conciliado INTO v_caixa_conciliado FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
    v_del_caixa := NOT COALESCE(v_caixa_conciliado, false);
  END IF;

  UPDATE tab_receita SET
    movimento_banco_id = CASE WHEN v_del_banco THEN NULL ELSE movimento_banco_id END,
    movimento_caixa_id = CASE WHEN v_del_caixa THEN NULL ELSE movimento_caixa_id END
  WHERE id = OLD.id;

  IF v_del_banco THEN DELETE FROM tab_movimento_banco WHERE id = v_mov_banco_id; END IF;
  IF v_del_caixa THEN DELETE FROM tab_movimento_caixa WHERE id = v_mov_caixa_id; END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_receita_estorno
  AFTER UPDATE OF status ON tab_receita
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_estorno_receita();

-- =============================================================
-- TRIGGER: fn_trigger_liquidar_titulo_pagar
-- UPDATE status A→L no título → gera movimento caixa ou banco
-- A API deve enviar: status='L', data_liquidacao, valor_liquidado,
-- destino_liquidacao ('C' ou 'B') e conta_banco_liq_id (se banco)
-- =============================================================
CREATE OR REPLACE FUNCTION fn_trigger_liquidar_titulo_pagar()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_banco_id  INT;
  v_mov_caixa_id  INT;
  v_conta_id      INT;
  v_destino       CHAR(1);
BEGIN
  -- Só age na transição A → L
  IF NOT (OLD.status = 'A' AND NEW.status = 'L') THEN
    RETURN NEW;
  END IF;

  IF NEW.data_liquidacao IS NULL THEN
    RAISE EXCEPTION 'data_liquidacao obrigatória ao liquidar título a pagar';
  END IF;
  IF COALESCE(NEW.valor_liquidado, 0) <= 0 THEN
    RAISE EXCEPTION 'valor_liquidado deve ser maior que zero';
  END IF;

  -- Determina destino:
  --   1º destino_liquidacao (explícito)
  --   2º conta_banco_liq_id preenchida → B
  --   3º conta_banco_id preenchida     → B  (compatibilidade)
  --   4º fallback                      → C
  v_destino := COALESCE(
    NEW.destino_liquidacao,
    CASE
      WHEN NEW.conta_banco_liq_id IS NOT NULL THEN 'B'
      WHEN NEW.conta_banco_id     IS NOT NULL THEN 'B'
      ELSE 'C'
    END
  );

  IF v_destino = 'B' THEN
    v_conta_id := COALESCE(NEW.conta_banco_liq_id, NEW.conta_banco_id);
    IF v_conta_id IS NULL THEN
      RAISE EXCEPTION 'Informe conta_banco_liq_id para liquidar título a pagar via banco';
    END IF;

    INSERT INTO tab_movimento_banco (
      empresa_id, conta_banco_id, titulo_pagar_id, pessoa_id,
      tipo, valor, data_movimento, observacao, created_by
    ) VALUES (
      NEW.empresa_id, v_conta_id, NEW.id, NEW.pessoa_id,
      'S', NEW.valor_liquidado,
      NEW.data_liquidacao, NEW.observacao, NEW.created_by
    ) RETURNING id INTO v_mov_banco_id;

    UPDATE tab_titulo_pagar SET
      movimento_banco_id = v_mov_banco_id,
      destino_liquidacao = 'B',
      conta_banco_liq_id = v_conta_id
    WHERE id = NEW.id;

  ELSE  -- C = Caixa
    INSERT INTO tab_movimento_caixa (
      empresa_id, titulo_pagar_id, pessoa_id,
      tipo, valor, data_movimento, observacao, created_by
    ) VALUES (
      NEW.empresa_id, NEW.id, NEW.pessoa_id,
      'S', NEW.valor_liquidado,
      NEW.data_liquidacao, NEW.observacao, NEW.created_by
    ) RETURNING id INTO v_mov_caixa_id;

    UPDATE tab_titulo_pagar SET
      movimento_caixa_id = v_mov_caixa_id,
      destino_liquidacao = 'C'
    WHERE id = NEW.id;
  END IF;

  -- Fecha parcelas em aberto
  UPDATE tab_titulo_pagar_parcela
  SET status = 'L'
  WHERE titulo_id = NEW.id AND status = 'A';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_titulo_pagar_liquidacao
  AFTER UPDATE OF status ON tab_titulo_pagar
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_liquidar_titulo_pagar();

-- =============================================================
-- TRIGGER: fn_trigger_estorno_titulo_pagar
-- Cancela (C) ou estorna (L→A) liquidação do título a pagar:
--   • deleta movimento gerado se não conciliado
--   • reabre parcelas se vinha de liquidado
-- =============================================================
CREATE OR REPLACE FUNCTION fn_trigger_estorno_titulo_pagar()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_banco_id     INT;
  v_mov_caixa_id     INT;
  v_banco_conciliado BOOLEAN;
  v_caixa_conciliado BOOLEAN;
  v_del_banco        BOOLEAN := false;
  v_del_caixa        BOOLEAN := false;
BEGIN
  -- Dispara em: qualquer→C (cancelamento) ou L→A (estorno de liquidação)
  IF NOT (
    (NEW.status = 'C' AND OLD.status <> 'C') OR
    (NEW.status = 'A' AND OLD.status = 'L')
  ) THEN
    RETURN NEW;
  END IF;

  -- Busca IDs dos movimentos pelo OLD; fallback por titulo_pagar_id
  v_mov_banco_id := OLD.movimento_banco_id;
  IF v_mov_banco_id IS NULL THEN
    SELECT id INTO v_mov_banco_id FROM tab_movimento_banco
    WHERE titulo_pagar_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;

  v_mov_caixa_id := OLD.movimento_caixa_id;
  IF v_mov_caixa_id IS NULL THEN
    SELECT id INTO v_mov_caixa_id FROM tab_movimento_caixa
    WHERE titulo_pagar_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;

  -- Verifica conciliação
  IF v_mov_banco_id IS NOT NULL THEN
    SELECT conciliado INTO v_banco_conciliado FROM tab_movimento_banco WHERE id = v_mov_banco_id;
    v_del_banco := NOT COALESCE(v_banco_conciliado, false);
  END IF;

  IF v_mov_caixa_id IS NOT NULL THEN
    SELECT conciliado INTO v_caixa_conciliado FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
    v_del_caixa := NOT COALESCE(v_caixa_conciliado, false);
  END IF;

  -- Limpa FKs antes dos DELETEs (constraints)
  UPDATE tab_titulo_pagar SET
    movimento_banco_id = CASE WHEN v_del_banco THEN NULL ELSE movimento_banco_id END,
    movimento_caixa_id = CASE WHEN v_del_caixa THEN NULL ELSE movimento_caixa_id END,
    destino_liquidacao = CASE WHEN v_del_banco OR v_del_caixa THEN NULL ELSE destino_liquidacao END,
    conta_banco_liq_id = CASE WHEN v_del_banco THEN NULL ELSE conta_banco_liq_id END,
    data_liquidacao    = CASE WHEN v_del_banco OR v_del_caixa THEN NULL ELSE data_liquidacao END,
    valor_liquidado    = CASE WHEN v_del_banco OR v_del_caixa THEN 0   ELSE valor_liquidado END
  WHERE id = OLD.id;

  IF v_del_banco THEN
    DELETE FROM tab_movimento_banco WHERE id = v_mov_banco_id;
  END IF;

  IF v_del_caixa THEN
    DELETE FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
  END IF;

  -- Reabre parcelas se vinha de liquidado
  IF OLD.status = 'L' THEN
    UPDATE tab_titulo_pagar_parcela SET status = 'A'
    WHERE titulo_id = OLD.id AND status = 'L';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_titulo_pagar_estorno
  AFTER UPDATE OF status ON tab_titulo_pagar
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_estorno_titulo_pagar();

-- =============================================================
-- TRIGGER: fn_trigger_liquidar_titulo_receber
-- UPDATE status A→L: gera movimento caixa ou banco
-- API deve enviar: status='L', data_liquidacao, valor_liquidado,
-- destino_liquidacao ('C' ou 'B') e conta_banco_liq_id (se banco)
-- =============================================================
CREATE OR REPLACE FUNCTION fn_trigger_liquidar_titulo_receber()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_banco_id  INT;
  v_mov_caixa_id  INT;
  v_conta_id      INT;
  v_destino       CHAR(1);
BEGIN
  -- Só age na transição A → L
  IF NOT (OLD.status = 'A' AND NEW.status = 'L') THEN
    RETURN NEW;
  END IF;

  IF NEW.data_liquidacao IS NULL THEN
    RAISE EXCEPTION 'data_liquidacao obrigatória ao liquidar título a receber';
  END IF;
  IF COALESCE(NEW.valor_liquidado, 0) <= 0 THEN
    RAISE EXCEPTION 'valor_liquidado deve ser maior que zero';
  END IF;

  -- Determina destino:
  --   1. destino_liquidacao (explícito)
  --   2. conta_banco_liq_id preenchida → B
  --   3. conta_banco_id preenchida     → B  (compatibilidade)
  --   4. fallback                      → C
  v_destino := COALESCE(
    NEW.destino_liquidacao,
    CASE
      WHEN NEW.conta_banco_liq_id IS NOT NULL THEN 'B'
      WHEN NEW.conta_banco_id     IS NOT NULL THEN 'B'
      ELSE 'C'
    END
  );

  IF v_destino = 'B' THEN
    v_conta_id := COALESCE(NEW.conta_banco_liq_id, NEW.conta_banco_id);
    IF v_conta_id IS NULL THEN
      RAISE EXCEPTION 'Informe conta_banco_liq_id para liquidar título a receber via banco';
    END IF;

    INSERT INTO tab_movimento_banco (
      empresa_id, conta_banco_id, titulo_receber_id, pessoa_id,
      tipo, valor, data_movimento, documento, observacao, created_by
    ) VALUES (
      NEW.empresa_id, v_conta_id, NEW.id, NEW.pessoa_id,
      'E', NEW.valor_liquidado,
      NEW.data_liquidacao,
      COALESCE(NEW.num_documento, NEW.numero_titulo),
      NEW.observacao, NEW.created_by
    ) RETURNING id INTO v_mov_banco_id;

    UPDATE tab_titulo_receber SET
      movimento_banco_id = v_mov_banco_id,
      destino_liquidacao = 'B',
      conta_banco_liq_id = v_conta_id
    WHERE id = NEW.id;

  ELSE  -- C = Caixa
    INSERT INTO tab_movimento_caixa (
      empresa_id, titulo_receber_id, pessoa_id,
      tipo, valor, data_movimento, documento, observacao, created_by
    ) VALUES (
      NEW.empresa_id, NEW.id, NEW.pessoa_id,
      'E', NEW.valor_liquidado,
      NEW.data_liquidacao,
      COALESCE(NEW.num_documento, NEW.numero_titulo),
      NEW.observacao, NEW.created_by
    ) RETURNING id INTO v_mov_caixa_id;

    UPDATE tab_titulo_receber SET
      movimento_caixa_id = v_mov_caixa_id,
      destino_liquidacao = 'C'
    WHERE id = NEW.id;
  END IF;

  -- Fecha parcelas em aberto
  UPDATE tab_titulo_receber_parcela
  SET status = 'L'
  WHERE titulo_id = NEW.id AND status = 'A';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_titulo_receber_liquidacao
  AFTER UPDATE OF status ON tab_titulo_receber
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_liquidar_titulo_receber();

-- =============================================================
-- TRIGGER: fn_trigger_estorno_titulo_receber
-- Cancela (C) ou estorna (L→A) recebimento do título a receber:
--   • deleta movimento gerado se não conciliado
--   • reabre parcelas se vinha de liquidado
-- =============================================================
CREATE OR REPLACE FUNCTION fn_trigger_estorno_titulo_receber()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_banco_id     INT;
  v_mov_caixa_id     INT;
  v_banco_conciliado BOOLEAN;
  v_caixa_conciliado BOOLEAN;
  v_del_banco        BOOLEAN := false;
  v_del_caixa        BOOLEAN := false;
BEGIN
  -- Dispara em: qualquer→C (cancelamento) ou L→A (estorno de recebimento)
  IF NOT (
    (NEW.status = 'C' AND OLD.status <> 'C') OR
    (NEW.status = 'A' AND OLD.status = 'L')
  ) THEN
    RETURN NEW;
  END IF;

  -- Busca IDs dos movimentos pelo OLD; fallback por titulo_receber_id
  v_mov_banco_id := OLD.movimento_banco_id;
  IF v_mov_banco_id IS NULL THEN
    SELECT id INTO v_mov_banco_id FROM tab_movimento_banco
    WHERE titulo_receber_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;

  v_mov_caixa_id := OLD.movimento_caixa_id;
  IF v_mov_caixa_id IS NULL THEN
    SELECT id INTO v_mov_caixa_id FROM tab_movimento_caixa
    WHERE titulo_receber_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;

  -- Verifica conciliação
  IF v_mov_banco_id IS NOT NULL THEN
    SELECT conciliado INTO v_banco_conciliado FROM tab_movimento_banco WHERE id = v_mov_banco_id;
    v_del_banco := NOT COALESCE(v_banco_conciliado, false);
  END IF;

  IF v_mov_caixa_id IS NOT NULL THEN
    SELECT conciliado INTO v_caixa_conciliado FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
    v_del_caixa := NOT COALESCE(v_caixa_conciliado, false);
  END IF;

  -- Limpa FKs antes dos DELETEs (constraints)
  UPDATE tab_titulo_receber SET
    movimento_banco_id = CASE WHEN v_del_banco THEN NULL ELSE movimento_banco_id END,
    movimento_caixa_id = CASE WHEN v_del_caixa THEN NULL ELSE movimento_caixa_id END,
    destino_liquidacao = CASE WHEN v_del_banco OR v_del_caixa THEN NULL ELSE destino_liquidacao END,
    conta_banco_liq_id = CASE WHEN v_del_banco THEN NULL ELSE conta_banco_liq_id END,
    data_liquidacao    = CASE WHEN v_del_banco OR v_del_caixa THEN NULL ELSE data_liquidacao END,
    valor_liquidado    = CASE WHEN v_del_banco OR v_del_caixa THEN 0   ELSE valor_liquidado END
  WHERE id = OLD.id;

  IF v_del_banco THEN
    DELETE FROM tab_movimento_banco WHERE id = v_mov_banco_id;
  END IF;

  IF v_del_caixa THEN
    DELETE FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
  END IF;

  -- Reabre parcelas se vinha de liquidado
  IF OLD.status = 'L' THEN
    UPDATE tab_titulo_receber_parcela SET status = 'A'
    WHERE titulo_id = OLD.id AND status = 'L';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_titulo_receber_estorno
  AFTER UPDATE OF status ON tab_titulo_receber
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_estorno_titulo_receber();

-- =============================================================
-- TRIGGER: fn_trigger_transferencia
-- INSERT em tab_transferencia_conta
-- → gera saída na conta origem + entrada na conta destino
-- =============================================================
CREATE OR REPLACE FUNCTION fn_trigger_transferencia()
RETURNS TRIGGER AS $$
DECLARE
  v_saida_id   INT;
  v_entrada_id INT;
BEGIN
  INSERT INTO tab_movimento_banco (
    empresa_id, conta_banco_id,
    tipo, valor, data_movimento, observacao, created_by
  ) VALUES (
    NEW.empresa_id, NEW.conta_origem_id,
    'S', NEW.valor, NEW.data_transferencia,
    COALESCE(NEW.observacao, 'Transferência entre contas'), NEW.created_by
  ) RETURNING id INTO v_saida_id;

  INSERT INTO tab_movimento_banco (
    empresa_id, conta_banco_id,
    tipo, valor, data_movimento, observacao, created_by
  ) VALUES (
    NEW.empresa_id, NEW.conta_destino_id,
    'E', NEW.valor, NEW.data_transferencia,
    COALESCE(NEW.observacao, 'Transferência entre contas'), NEW.created_by
  ) RETURNING id INTO v_entrada_id;

  UPDATE tab_transferencia_conta SET
    movimento_saida_id   = v_saida_id,
    movimento_entrada_id = v_entrada_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transferencia_movimentos
  AFTER INSERT ON tab_transferencia_conta
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_transferencia();

-- =============================================================
-- VIEWS
-- =============================================================

CREATE OR REPLACE VIEW vw_titulos_pagar_abertos AS
SELECT
  tp.id, tp.empresa_id, tp.numero_titulo,
  tp.data_emissao, tp.data_vencimento,
  tp.valor_original,
  (tp.valor_original + tp.valor_juros + tp.valor_multa
    - tp.valor_desconto - tp.valor_liquidado)  AS valor_saldo,
  tp.status,
  (tp.data_vencimento < CURRENT_DATE)          AS vencido,
  GREATEST(0, CURRENT_DATE - tp.data_vencimento) AS dias_atraso,
  p.nome     AS pessoa_nome,
  p.cpf_cnpj,
  td.descricao AS tipo_despesa,
  cc.descricao AS centro_custo
FROM tab_titulo_pagar tp
LEFT JOIN tab_pessoa       p  ON p.id  = tp.pessoa_id
LEFT JOIN tab_tipo_despesa td ON td.id = tp.tipo_despesa_id
LEFT JOIN tab_centro_custo cc ON cc.id = tp.centro_custo_id
WHERE tp.status = 'A';

CREATE OR REPLACE VIEW vw_titulos_receber_abertos AS
SELECT
  tr.id, tr.empresa_id, tr.numero_titulo,
  tr.data_emissao, tr.data_vencimento,
  tr.valor_original,
  (tr.valor_original + tr.valor_juros + tr.valor_multa
    - tr.valor_desconto - tr.valor_liquidado)  AS valor_saldo,
  tr.status,
  (tr.data_vencimento < CURRENT_DATE)          AS vencido,
  GREATEST(0, CURRENT_DATE - tr.data_vencimento) AS dias_atraso,
  p.nome      AS pessoa_nome,
  p.cpf_cnpj,
  tr2.descricao AS tipo_receita,
  cc.descricao  AS centro_custo
FROM tab_titulo_receber tr
LEFT JOIN tab_pessoa       p   ON p.id   = tr.pessoa_id
LEFT JOIN tab_tipo_receita tr2 ON tr2.id = tr.tipo_receita_id
LEFT JOIN tab_centro_custo cc  ON cc.id  = tr.centro_custo_id
WHERE tr.status = 'A';

CREATE OR REPLACE VIEW vw_saldo_caixa AS
SELECT
  empresa_id,
  COALESCE(SUM(CASE WHEN tipo='E' THEN valor ELSE 0      END), 0) AS total_entradas,
  COALESCE(SUM(CASE WHEN tipo='S' THEN valor ELSE 0      END), 0) AS total_saidas,
  COALESCE(SUM(CASE WHEN tipo='E' THEN valor ELSE -valor END), 0) AS saldo_atual
FROM tab_movimento_caixa
GROUP BY empresa_id;

CREATE OR REPLACE VIEW vw_saldo_banco AS
SELECT
  mb.empresa_id,
  mb.conta_banco_id,
  cb.mnemonico, cb.agencia, cb.conta,
  b.nome        AS banco_nome,
  cb.saldo_inicial,
  COALESCE(SUM(CASE WHEN mb.tipo='E' THEN mb.valor ELSE 0        END), 0) AS total_entradas,
  COALESCE(SUM(CASE WHEN mb.tipo='S' THEN mb.valor ELSE 0        END), 0) AS total_saidas,
  cb.saldo_inicial +
    COALESCE(SUM(CASE WHEN mb.tipo='E' THEN mb.valor ELSE -mb.valor END), 0) AS saldo_atual
FROM tab_movimento_banco mb
JOIN tab_conta_banco cb ON cb.id = mb.conta_banco_id
JOIN tab_banco       b  ON b.id  = cb.banco_id
GROUP BY mb.empresa_id, mb.conta_banco_id,
         cb.mnemonico, cb.agencia, cb.conta, b.nome, cb.saldo_inicial;

-- =============================================================
-- RESUMO DE TRIGGERS CRIADOS
-- =============================================================
-- trg_despesa_movimentos      → AFTER INSERT OR UPDATE OF status ON tab_despesa
--   ind_avista+destino=C → movimento caixa (S)
--   ind_avista+destino=B → movimento banco (S) + escolhe conta_banco_id
--   a prazo              → parcelas + títulos a pagar
--
-- trg_receita_movimentos      → AFTER INSERT OR UPDATE OF status ON tab_receita
--   ind_avista+destino=C → movimento caixa (E)
--   ind_avista+destino=B → movimento banco (E) + escolhe conta_banco_id
--   a prazo              → parcelas + títulos a receber
--
-- trg_titulo_pagar_liquidacao → AFTER UPDATE OF status ON tab_titulo_pagar (A→L)
--   destino_liquidacao='B' ou conta_banco_liq_id/conta_banco_id NOT NULL → movimento banco (S) + grava movimento_banco_id
--   destino_liquidacao='C' ou sem conta                                  → movimento caixa (S) + grava movimento_caixa_id
--
-- trg_titulo_receber_liquidacao → AFTER UPDATE OF status ON tab_titulo_receber (A→L)
--   conta_banco_id NOT NULL → movimento banco (E)
--   conta_banco_id NULL     → movimento caixa (E)
--
-- trg_transferencia_movimentos → AFTER INSERT ON tab_transferencia_conta
--   → movimento banco saída (conta origem) + entrada (conta destino)
