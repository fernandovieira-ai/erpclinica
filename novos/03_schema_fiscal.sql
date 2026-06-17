-- =============================================================
-- 03_schema_fiscal.sql
-- Módulo fiscal: NF-e entrada/saída, itens, parcelas,
-- retenções, eventos (CCe, cancelamento), livro fiscal
-- Rodar no database do cliente: fin_{slug}
-- Depende de: 01_schema_cadastros.sql + 02_schema_financeiro.sql
-- =============================================================

SET client_encoding = 'LATIN1';

-- =============================================================
-- TABELA: tab_cfop
-- Códigos Fiscais de Operações e Prestações
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_cfop (
  id          SERIAL       PRIMARY KEY,
  codigo      VARCHAR(5)   NOT NULL UNIQUE,  -- ex: '5102', '6102', '1102'
  descricao   VARCHAR(150) NOT NULL,
  tipo        CHAR(1)      NOT NULL CHECK (tipo IN ('E','S')),
  ativo       BOOLEAN      NOT NULL DEFAULT true
);
CREATE INDEX idx_cfop_codigo ON tab_cfop(codigo);
CREATE INDEX idx_cfop_tipo   ON tab_cfop(tipo);

-- =============================================================
-- TABELA: tab_ncm
-- Nomenclatura Comum do Mercosul
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_ncm (
  id          SERIAL       PRIMARY KEY,
  codigo      VARCHAR(8)   NOT NULL UNIQUE,
  descricao   VARCHAR(255) NOT NULL,
  aliq_ii     NUMERIC(5,2) NOT NULL DEFAULT 0,
  aliq_ipi    NUMERIC(5,2) NOT NULL DEFAULT 0,
  ativo       BOOLEAN      NOT NULL DEFAULT true
);
CREATE INDEX idx_ncm_codigo ON tab_ncm(codigo);

-- =============================================================
-- TABELA: tab_nota_fiscal
-- NF-e entrada (tipo='E') e saída (tipo='S') unificadas
-- modelo: 55=NF-e, 65=NFC-e, 1=Papel (legado)
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_nota_fiscal (
  id                    SERIAL        PRIMARY KEY,
  empresa_id            INT           NOT NULL REFERENCES tab_empresa(id),
  pessoa_id             INT           NOT NULL REFERENCES tab_pessoa(id),
  tipo                  CHAR(1)       NOT NULL CHECK (tipo IN ('E','S')),
  modelo                VARCHAR(2)    NOT NULL DEFAULT '55'
                          CHECK (modelo IN ('55','65','1')),
  serie                 VARCHAR(3)    NOT NULL DEFAULT '001',
  numero                VARCHAR(10),
  -- Datas
  data_emissao          DATE          NOT NULL DEFAULT CURRENT_DATE,
  data_saida_entrada    DATE,
  hora_saida_entrada    TIME,
  -- Natureza
  natureza_operacao     VARCHAR(60)   NOT NULL,
  finalidade            CHAR(1)       NOT NULL DEFAULT '1'
                          CHECK (finalidade IN ('1','2','3','4')),
                          -- 1=Normal, 2=Complementar, 3=Ajuste, 4=Devolução
  -- Pessoa (cliente/fornecedor)
  pessoa_nome           VARCHAR(150),  -- snapshot no momento da emissão
  pessoa_cnpj_cpf       VARCHAR(18),
  pessoa_ie             VARCHAR(20),
  pessoa_logradouro     VARCHAR(255),
  pessoa_numero         VARCHAR(10),
  pessoa_bairro         VARCHAR(80),
  pessoa_cidade         VARCHAR(80),
  pessoa_uf             CHAR(2),
  pessoa_cep            VARCHAR(9),
  pessoa_cod_ibge       VARCHAR(7),
  -- Valores fiscais
  val_produtos          NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_desconto          NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_frete             NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_seguro            NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_outras            NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_ipi               NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_icms              NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_icms_st           NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_iss               NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_pis               NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_cofins            NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_total             NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Frete
  modalidade_frete      CHAR(1)       DEFAULT '9'
                          CHECK (modalidade_frete IN ('0','1','2','3','4','9')),
                          -- 0=Emitente, 1=Destinatário, 2=Terceiros,
                          -- 3=Próprio Rem, 4=Próprio Dest, 9=Sem frete
  transportadora_id     INT           REFERENCES tab_pessoa(id),
  -- NF-e SEFAZ
  chave_acesso          VARCHAR(44)   UNIQUE,
  protocolo             VARCHAR(20),
  data_autorizacao      TIMESTAMPTZ,
  -- Status
  -- D=Digitada, A=Autorizada, C=Cancelada, X=Inutilizada, R=Rejeitada
  status                VARCHAR(1)    NOT NULL DEFAULT 'D'
                          CHECK (status IN ('D','A','C','X','R')),
  motivo_rejeicao       TEXT,
  -- XML
  xml_enviado           TEXT,         -- XML da NF-e
  xml_retorno           TEXT,         -- XML de retorno da SEFAZ
  -- Informações adicionais
  info_complementar     TEXT,
  info_fisco            TEXT,
  -- Controle
  created_by            VARCHAR(100),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nf_empresa        ON tab_nota_fiscal(empresa_id);
CREATE INDEX idx_nf_pessoa         ON tab_nota_fiscal(pessoa_id);
CREATE INDEX idx_nf_tipo_status    ON tab_nota_fiscal(empresa_id, tipo, status);
CREATE INDEX idx_nf_data_emissao   ON tab_nota_fiscal(empresa_id, data_emissao);
CREATE INDEX idx_nf_numero         ON tab_nota_fiscal(empresa_id, modelo, serie, numero);
CREATE INDEX idx_nf_chave          ON tab_nota_fiscal(chave_acesso);

CREATE TRIGGER trg_nf_updated_at
  BEFORE UPDATE ON tab_nota_fiscal
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE  tab_nota_fiscal             IS 'NF-e entrada e saída unificadas';
COMMENT ON COLUMN tab_nota_fiscal.tipo        IS 'E=Entrada, S=Saída';
COMMENT ON COLUMN tab_nota_fiscal.modelo      IS '55=NF-e, 65=NFC-e, 1=Papel';
COMMENT ON COLUMN tab_nota_fiscal.finalidade  IS '1=Normal, 2=Complementar, 3=Ajuste, 4=Devolução';
COMMENT ON COLUMN tab_nota_fiscal.status      IS 'D=Digitada, A=Autorizada, C=Cancelada, X=Inutilizada, R=Rejeitada';

-- =============================================================
-- TABELA: tab_nota_fiscal_item
-- Itens da nota fiscal
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_nota_fiscal_item (
  id                SERIAL        PRIMARY KEY,
  nota_id           INT           NOT NULL REFERENCES tab_nota_fiscal(id) ON DELETE CASCADE,
  numero_item       INT           NOT NULL,
  -- Produto/serviço
  codigo_produto    VARCHAR(30),
  descricao         VARCHAR(120)  NOT NULL,
  ncm               VARCHAR(8),
  cfop              VARCHAR(4)    NOT NULL,
  unidade           VARCHAR(6)    NOT NULL DEFAULT 'UN',
  -- Quantidades e valores
  quantidade        NUMERIC(12,4) NOT NULL DEFAULT 1,
  valor_unitario    NUMERIC(15,4) NOT NULL DEFAULT 0,
  valor_total       NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_desconto      NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_frete         NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_seguro        NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_outras        NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- ICMS
  cst_icms          VARCHAR(3),
  orig_icms         CHAR(1)       DEFAULT '0',
  modalidade_bc_icms CHAR(1),
  val_bc_icms       NUMERIC(15,2) NOT NULL DEFAULT 0,
  aliq_icms         NUMERIC(5,2)  NOT NULL DEFAULT 0,
  val_icms          NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- ICMS ST
  val_bc_icms_st    NUMERIC(15,2) NOT NULL DEFAULT 0,
  aliq_icms_st      NUMERIC(5,2)  NOT NULL DEFAULT 0,
  val_icms_st       NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- IPI
  cst_ipi           VARCHAR(2),
  val_bc_ipi        NUMERIC(15,2) NOT NULL DEFAULT 0,
  aliq_ipi          NUMERIC(5,2)  NOT NULL DEFAULT 0,
  val_ipi           NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- PIS
  cst_pis           VARCHAR(2),
  val_bc_pis        NUMERIC(15,2) NOT NULL DEFAULT 0,
  aliq_pis          NUMERIC(5,4)  NOT NULL DEFAULT 0,
  val_pis           NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- COFINS
  cst_cofins        VARCHAR(2),
  val_bc_cofins     NUMERIC(15,2) NOT NULL DEFAULT 0,
  aliq_cofins       NUMERIC(5,4)  NOT NULL DEFAULT 0,
  val_cofins        NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- ISS (serviços)
  codigo_servico    VARCHAR(10),
  aliq_iss          NUMERIC(5,2)  NOT NULL DEFAULT 0,
  val_iss           NUMERIC(15,2) NOT NULL DEFAULT 0,
  UNIQUE (nota_id, numero_item)
);

CREATE INDEX idx_nfi_nota   ON tab_nota_fiscal_item(nota_id);
CREATE INDEX idx_nfi_cfop   ON tab_nota_fiscal_item(cfop);
CREATE INDEX idx_nfi_ncm    ON tab_nota_fiscal_item(ncm);

COMMENT ON TABLE tab_nota_fiscal_item IS 'Itens da nota fiscal com todos os tributos';

-- =============================================================
-- TABELA: tab_nota_fiscal_parcela
-- Duplicatas/parcelas da nota → gera títulos via trigger
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_nota_fiscal_parcela (
  id                SERIAL        PRIMARY KEY,
  nota_id           INT           NOT NULL REFERENCES tab_nota_fiscal(id) ON DELETE CASCADE,
  numero_parcela    INT           NOT NULL DEFAULT 1,
  data_vencimento   DATE          NOT NULL,
  valor             NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  titulo_pagar_id   INT           REFERENCES tab_titulo_pagar(id),   -- NF entrada
  titulo_receber_id INT           REFERENCES tab_titulo_receber(id), -- NF saída
  UNIQUE (nota_id, numero_parcela)
);

CREATE INDEX idx_nfp_nota    ON tab_nota_fiscal_parcela(nota_id);
CREATE INDEX idx_nfp_tp      ON tab_nota_fiscal_parcela(titulo_pagar_id);
CREATE INDEX idx_nfp_tr      ON tab_nota_fiscal_parcela(titulo_receber_id);

-- =============================================================
-- TABELA: tab_nota_fiscal_retencao
-- Retenções na fonte sobre a nota (IR, CSRF, INSS etc.)
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_nota_fiscal_retencao (
  id              SERIAL        PRIMARY KEY,
  nota_id         INT           NOT NULL REFERENCES tab_nota_fiscal(id) ON DELETE CASCADE,
  tipo_imposto    VARCHAR(10)   NOT NULL
                    CHECK (tipo_imposto IN ('IRRF','CSLL','PIS','COFINS','CSRF','INSS','ISS','OUTROS')),
  base_calculo    NUMERIC(15,2) NOT NULL DEFAULT 0,
  aliquota        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  valor_retencao  NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nfr_nota ON tab_nota_fiscal_retencao(nota_id);

-- =============================================================
-- TABELA: tab_nota_fiscal_evento
-- CCe, cancelamento, inutilização, manifestação destinatário
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_nota_fiscal_evento (
  id            SERIAL        PRIMARY KEY,
  nota_id       INT           NOT NULL REFERENCES tab_nota_fiscal(id),
  tipo          VARCHAR(3)    NOT NULL
                  CHECK (tipo IN ('CCe','CAN','INU','MAN','EPE')),
                  -- CCe=Carta Correção, CAN=Cancelamento,
                  -- INU=Inutilização, MAN=Manifestação Dest,
                  -- EPE=Encerramento de Protocolo
  sequencia     INT           NOT NULL DEFAULT 1,
  data_evento   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  protocolo     VARCHAR(20),
  descricao     TEXT,         -- motivo do cancelamento ou texto da CCe
  xml_evento    TEXT,         -- XML do evento
  xml_retorno   TEXT,         -- XML de retorno da SEFAZ
  status        VARCHAR(1)    NOT NULL DEFAULT 'P'
                  CHECK (status IN ('P','A','R')),
                  -- P=Pendente, A=Autorizado, R=Rejeitado
  created_by    VARCHAR(100),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nfe_evento_nota ON tab_nota_fiscal_evento(nota_id);
CREATE INDEX idx_nfe_evento_tipo ON tab_nota_fiscal_evento(tipo, status);

COMMENT ON COLUMN tab_nota_fiscal_evento.tipo IS 'CCe=Carta Correção CAN=Cancelamento INU=Inutilização MAN=Manifestação';

-- =============================================================
-- TABELA: tab_inutilizacao_nfe
-- Controle de numeração inutilizada
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_inutilizacao_nfe (
  id            SERIAL        PRIMARY KEY,
  empresa_id    INT           NOT NULL REFERENCES tab_empresa(id),
  modelo        VARCHAR(2)    NOT NULL DEFAULT '55',
  serie         VARCHAR(3)    NOT NULL,
  num_inicial   INT           NOT NULL,
  num_final     INT           NOT NULL,
  ano           INT           NOT NULL,
  justificativa TEXT          NOT NULL,
  protocolo     VARCHAR(20),
  data_inut     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  xml_retorno   TEXT,
  created_by    VARCHAR(100),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inut_empresa ON tab_inutilizacao_nfe(empresa_id, modelo, serie, ano);

-- =============================================================
-- TABELA: tab_livro_fiscal_saida
-- Registro das NF-e de saída para o livro fiscal
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_livro_fiscal_saida (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  nota_id         INT           NOT NULL REFERENCES tab_nota_fiscal(id),
  periodo         DATE          NOT NULL,  -- primeiro dia do mês
  data_emissao    DATE          NOT NULL,
  numero          VARCHAR(10),
  serie           VARCHAR(3),
  pessoa_nome     VARCHAR(150),
  pessoa_cnpj_cpf VARCHAR(18),
  pessoa_uf       CHAR(2),
  cfop            VARCHAR(4),
  val_contabil    NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_base_icms   NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_icms        NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_isento      NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_outros      NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_ipi         NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_iss         NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_pis         NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_cofins      NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lfs_empresa  ON tab_livro_fiscal_saida(empresa_id);
CREATE INDEX idx_lfs_periodo  ON tab_livro_fiscal_saida(empresa_id, periodo);
CREATE INDEX idx_lfs_nota     ON tab_livro_fiscal_saida(nota_id);

-- =============================================================
-- TABELA: tab_livro_fiscal_entrada
-- Registro das NF-e de entrada para o livro fiscal
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_livro_fiscal_entrada (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  nota_id         INT           NOT NULL REFERENCES tab_nota_fiscal(id),
  periodo         DATE          NOT NULL,
  data_emissao    DATE          NOT NULL,
  numero          VARCHAR(10),
  serie           VARCHAR(3),
  pessoa_nome     VARCHAR(150),
  pessoa_cnpj_cpf VARCHAR(18),
  pessoa_uf       CHAR(2),
  cfop            VARCHAR(4),
  val_contabil    NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_base_icms   NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_icms        NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_isento      NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_outros      NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_ipi         NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_iss         NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_pis         NUMERIC(15,2) NOT NULL DEFAULT 0,
  val_cofins      NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lfe_empresa ON tab_livro_fiscal_entrada(empresa_id);
CREATE INDEX idx_lfe_periodo ON tab_livro_fiscal_entrada(empresa_id, periodo);
CREATE INDEX idx_lfe_nota    ON tab_livro_fiscal_entrada(nota_id);

-- =============================================================
-- TRIGGER: fn_trigger_nota_fiscal
-- AFTER UPDATE OF status ON tab_nota_fiscal (D→A)
--
-- Quando NF-e é autorizada (status='A'):
--   Saída  → gera tab_titulo_receber por parcela
--   Entrada → gera tab_titulo_pagar por parcela
--   Registra no livro fiscal
--
-- Quando cancelada (A→C):
--   Cancela títulos vinculados
-- =============================================================
CREATE OR REPLACE FUNCTION fn_trigger_nota_fiscal()
RETURNS TRIGGER AS $$
DECLARE
  v_parcela       RECORD;
  v_titulo_id     INT;
  v_tipo_despesa  INT;
  v_tipo_receita  INT;
BEGIN
  -- ── AUTORIZAÇÃO (D → A) ──────────────────────────────────
  IF OLD.status = 'D' AND NEW.status = 'A' THEN

    -- Busca tipo_despesa/receita padrão da empresa (id=1 como fallback)
    SELECT id INTO v_tipo_despesa FROM tab_tipo_despesa
    WHERE empresa_id = NEW.empresa_id AND ativo = true
    ORDER BY id LIMIT 1;

    SELECT id INTO v_tipo_receita FROM tab_tipo_receita
    WHERE empresa_id = NEW.empresa_id AND ativo = true
    ORDER BY id LIMIT 1;

    -- Gera títulos para cada parcela
    FOR v_parcela IN
      SELECT * FROM tab_nota_fiscal_parcela
      WHERE nota_id = NEW.id
      ORDER BY numero_parcela
    LOOP
      IF NEW.tipo = 'S' THEN
        -- NF saída → título a receber
        INSERT INTO tab_titulo_receber (
          empresa_id, pessoa_id, tipo_receita_id,
          numero_titulo, num_documento, origem_modulo, origem_id,
          data_emissao, data_vencimento, data_competencia,
          valor_original, observacao, created_by
        ) VALUES (
          NEW.empresa_id, NEW.pessoa_id, v_tipo_receita,
          NEW.numero || '/' || LPAD(v_parcela.numero_parcela::TEXT, 2, '0'),
          NEW.numero, 'NFE', NEW.id,
          NEW.data_emissao, v_parcela.data_vencimento, NEW.data_emissao,
          v_parcela.valor,
          'NF-e ' || COALESCE(NEW.numero, '') || ' - ' || NEW.natureza_operacao,
          NEW.created_by
        ) RETURNING id INTO v_titulo_id;

        UPDATE tab_nota_fiscal_parcela SET
          titulo_receber_id = v_titulo_id
        WHERE id = v_parcela.id;

      ELSE
        -- NF entrada → título a pagar
        INSERT INTO tab_titulo_pagar (
          empresa_id, pessoa_id, tipo_despesa_id,
          numero_titulo, num_documento, origem_modulo, origem_id,
          data_emissao, data_vencimento, data_competencia,
          valor_original, observacao, created_by
        ) VALUES (
          NEW.empresa_id, NEW.pessoa_id, v_tipo_despesa,
          NEW.numero || '/' || LPAD(v_parcela.numero_parcela::TEXT, 2, '0'),
          NEW.numero, 'NFE', NEW.id,
          NEW.data_emissao, v_parcela.data_vencimento, NEW.data_emissao,
          v_parcela.valor,
          'NF-e entrada ' || COALESCE(NEW.numero, '') || ' - ' || NEW.natureza_operacao,
          NEW.created_by
        ) RETURNING id INTO v_titulo_id;

        UPDATE tab_nota_fiscal_parcela SET
          titulo_pagar_id = v_titulo_id
        WHERE id = v_parcela.id;
      END IF;
    END LOOP;

    -- Registra no livro fiscal
    IF NEW.tipo = 'S' THEN
      INSERT INTO tab_livro_fiscal_saida (
        empresa_id, nota_id, periodo, data_emissao,
        numero, serie,
        pessoa_nome, pessoa_cnpj_cpf, pessoa_uf,
        val_contabil, val_base_icms, val_icms,
        val_ipi, val_iss, val_pis, val_cofins
      ) VALUES (
        NEW.empresa_id, NEW.id,
        DATE_TRUNC('month', NEW.data_emissao)::DATE,
        NEW.data_emissao, NEW.numero, NEW.serie,
        NEW.pessoa_nome, NEW.pessoa_cnpj_cpf, NEW.pessoa_uf,
        NEW.val_total, NEW.val_icms, NEW.val_icms,
        NEW.val_ipi, NEW.val_iss, NEW.val_pis, NEW.val_cofins
      );
    ELSE
      INSERT INTO tab_livro_fiscal_entrada (
        empresa_id, nota_id, periodo, data_emissao,
        numero, serie,
        pessoa_nome, pessoa_cnpj_cpf, pessoa_uf,
        val_contabil, val_base_icms, val_icms,
        val_ipi, val_iss, val_pis, val_cofins
      ) VALUES (
        NEW.empresa_id, NEW.id,
        DATE_TRUNC('month', NEW.data_emissao)::DATE,
        NEW.data_emissao, NEW.numero, NEW.serie,
        NEW.pessoa_nome, NEW.pessoa_cnpj_cpf, NEW.pessoa_uf,
        NEW.val_total, NEW.val_icms, NEW.val_icms,
        NEW.val_ipi, NEW.val_iss, NEW.val_pis, NEW.val_cofins
      );
    END IF;

  -- ── CANCELAMENTO (A → C) ─────────────────────────────────
  ELSIF OLD.status = 'A' AND NEW.status = 'C' THEN

    -- Cancela títulos a receber vinculados (NF saída)
    UPDATE tab_titulo_receber SET status = 'C', updated_at = NOW()
    WHERE id IN (
      SELECT titulo_receber_id FROM tab_nota_fiscal_parcela
      WHERE nota_id = NEW.id AND titulo_receber_id IS NOT NULL
    ) AND status = 'A';

    -- Cancela títulos a pagar vinculados (NF entrada)
    UPDATE tab_titulo_pagar SET status = 'C', updated_at = NOW()
    WHERE id IN (
      SELECT titulo_pagar_id FROM tab_nota_fiscal_parcela
      WHERE nota_id = NEW.id AND titulo_pagar_id IS NOT NULL
    ) AND status = 'A';

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_nota_fiscal_titulos
  AFTER UPDATE OF status ON tab_nota_fiscal
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_nota_fiscal();

-- =============================================================
-- VIEWS
-- =============================================================

-- NF-e com totais e status
CREATE OR REPLACE VIEW vw_notas_fiscais AS
SELECT
  nf.id, nf.empresa_id, nf.tipo, nf.modelo,
  nf.serie, nf.numero, nf.chave_acesso,
  nf.data_emissao, nf.natureza_operacao, nf.finalidade,
  nf.status,
  nf.val_produtos, nf.val_desconto, nf.val_frete,
  nf.val_icms, nf.val_ipi, nf.val_iss,
  nf.val_pis, nf.val_cofins, nf.val_total,
  p.nome       AS pessoa_nome,
  p.cpf_cnpj   AS pessoa_cnpj_cpf,
  p.cidade     AS pessoa_cidade,
  p.uf         AS pessoa_uf,
  -- conta parcelas
  (SELECT COUNT(*) FROM tab_nota_fiscal_parcela WHERE nota_id = nf.id) AS qtd_parcelas,
  -- conta itens
  (SELECT COUNT(*) FROM tab_nota_fiscal_item    WHERE nota_id = nf.id) AS qtd_itens
FROM tab_nota_fiscal nf
JOIN tab_pessoa p ON p.id = nf.pessoa_id;

-- Livro fiscal consolidado por período
CREATE OR REPLACE VIEW vw_livro_fiscal_periodo AS
SELECT
  empresa_id,
  periodo,
  'S' AS tipo,
  COUNT(*)          AS qtd_notas,
  SUM(val_contabil) AS val_contabil,
  SUM(val_base_icms) AS val_base_icms,
  SUM(val_icms)     AS val_icms,
  SUM(val_ipi)      AS val_ipi,
  SUM(val_iss)      AS val_iss,
  SUM(val_pis)      AS val_pis,
  SUM(val_cofins)   AS val_cofins
FROM tab_livro_fiscal_saida
GROUP BY empresa_id, periodo

UNION ALL

SELECT
  empresa_id,
  periodo,
  'E' AS tipo,
  COUNT(*),
  SUM(val_contabil),
  SUM(val_base_icms),
  SUM(val_icms),
  SUM(val_ipi),
  SUM(val_iss),
  SUM(val_pis),
  SUM(val_cofins)
FROM tab_livro_fiscal_entrada
GROUP BY empresa_id, periodo

ORDER BY empresa_id, periodo, tipo;

-- =============================================================
-- RESUMO DE TRIGGERS CRIADOS
-- =============================================================
-- trg_nota_fiscal_titulos → AFTER UPDATE OF status ON tab_nota_fiscal
--   D→A + tipo='S' → gera tab_titulo_receber por parcela + livro saída
--   D→A + tipo='E' → gera tab_titulo_pagar  por parcela + livro entrada
--   A→C            → cancela títulos vinculados (status='A' apenas)
