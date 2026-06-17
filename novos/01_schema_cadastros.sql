-- =============================================================
-- 01_schema_cadastros.sql
-- Tabelas base — cadastros do sistema
-- Rodar no database do cliente: fin_{slug}
-- =============================================================

SET client_encoding = 'LATIN1';

-- -------------------------------------------------------------
-- Trigger fn_set_updated_at
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- TABELA: tab_empresa
-- Cada CNPJ/filial do cliente
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_empresa (
  id                    SERIAL        PRIMARY KEY,
  razao_social          VARCHAR(150)  NOT NULL,
  nome_fantasia         VARCHAR(100),
  cnpj                  VARCHAR(18)   NOT NULL UNIQUE,
  ie                    VARCHAR(20),
  im                    VARCHAR(20),
  regime_tributario     VARCHAR(2)    NOT NULL DEFAULT 'SN'
                          CHECK (regime_tributario IN ('SN','LP','LR')),
                          -- SN=Simples, LP=Lucro Presumido, LR=Lucro Real
  crt                   CHAR(1)       NOT NULL DEFAULT '1'
                          CHECK (crt IN ('1','2','3','4')),
                          -- 1=Simples, 2=Simples Excesso, 3=Normal, 4=MEI
  logradouro            VARCHAR(255),
  numero                VARCHAR(10),
  complemento           VARCHAR(60),
  bairro                VARCHAR(80),
  cidade                VARCHAR(80),
  uf                    CHAR(2),
  cep                   VARCHAR(9),
  cod_ibge              VARCHAR(7),
  telefone              VARCHAR(20),
  email                 VARCHAR(255),
  email_nfe             VARCHAR(255),
  logo_url              TEXT,
  cert_digital          TEXT,          -- certificado A1 em base64
  cert_senha            VARCHAR(255),  -- senha do certificado (criptografada)
  cert_validade         DATE,
  ambiente_nfe          CHAR(1)       NOT NULL DEFAULT '2'
                          CHECK (ambiente_nfe IN ('1','2')),
                          -- 1=Producao, 2=Homologacao
  serie_nfe             VARCHAR(3)    NOT NULL DEFAULT '001',
  prox_num_nfe          INT           NOT NULL DEFAULT 1,
  serie_nfce            VARCHAR(3)    NOT NULL DEFAULT '001',
  prox_num_nfce         INT           NOT NULL DEFAULT 1,
  csc_nfce              VARCHAR(36),   -- CSC para NFC-e
  id_token_nfce         VARCHAR(6),
  ativo                 BOOLEAN       NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_empresa_cnpj   ON tab_empresa(cnpj);
CREATE INDEX idx_empresa_ativo  ON tab_empresa(ativo);

CREATE TRIGGER trg_empresa_updated_at
  BEFORE UPDATE ON tab_empresa
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE  tab_empresa                   IS 'Empresas/filiais do cliente';
COMMENT ON COLUMN tab_empresa.regime_tributario IS 'SN=Simples Nacional, LP=Lucro Presumido, LR=Lucro Real';
COMMENT ON COLUMN tab_empresa.crt               IS 'Código Regime Tributário para NF-e';
COMMENT ON COLUMN tab_empresa.ambiente_nfe      IS '1=Produção, 2=Homologação';

-- =============================================================
-- TABELA: tab_usuario
-- Usuários com acesso ao sistema
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_usuario (
  id            SERIAL        PRIMARY KEY,
  nome          VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  senha_hash    VARCHAR(255)  NOT NULL,
  perfil        VARCHAR(20)   NOT NULL DEFAULT 'operador'
                  CHECK (perfil IN ('admin','financeiro','operador')),
  trocar_senha  BOOLEAN       NOT NULL DEFAULT false,
  ultimo_acesso TIMESTAMPTZ,
  ativo         BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuario_email  ON tab_usuario(email);
CREATE INDEX idx_usuario_ativo  ON tab_usuario(ativo);

CREATE TRIGGER trg_usuario_updated_at
  BEFORE UPDATE ON tab_usuario
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE  tab_usuario              IS 'Usuários do sistema';
COMMENT ON COLUMN tab_usuario.trocar_senha IS 'Forçar troca de senha no próximo login';

-- =============================================================
-- TABELA: tab_usuario_empresa
-- Vínculo usuário × empresa com perfil e módulos
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_usuario_empresa (
  id          SERIAL      PRIMARY KEY,
  usuario_id  INT         NOT NULL REFERENCES tab_usuario(id),
  empresa_id  INT         NOT NULL REFERENCES tab_empresa(id),
  perfil      VARCHAR(20) NOT NULL DEFAULT 'operador'
                CHECK (perfil IN ('admin','financeiro','operador')),
  modulos     TEXT[]      DEFAULT NULL,
              -- NULL = usa padrão do perfil
              -- ex: ARRAY['financeiro','fiscal','relatorios']
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, empresa_id)
);

CREATE INDEX idx_usu_emp_usuario  ON tab_usuario_empresa(usuario_id);
CREATE INDEX idx_usu_emp_empresa  ON tab_usuario_empresa(empresa_id);

COMMENT ON COLUMN tab_usuario_empresa.modulos IS 'NULL = usa módulos padrão do perfil';

-- =============================================================
-- TABELA: tab_banco
-- Códigos de bancos brasileiros
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_banco (
  id              SERIAL       PRIMARY KEY,
  codigo_compensacao VARCHAR(5) NOT NULL UNIQUE,  -- ex: "001", "033", "341"
  nome            VARCHAR(100) NOT NULL,
  nome_curto      VARCHAR(30),
  ativo           BOOLEAN      NOT NULL DEFAULT true
);

COMMENT ON TABLE tab_banco IS 'Bancos brasileiros — código COMPE';

-- =============================================================
-- TABELA: tab_conta_banco
-- Contas bancárias da empresa
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_conta_banco (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  banco_id        INT           NOT NULL REFERENCES tab_banco(id),
  mnemonico       VARCHAR(10)   NOT NULL,   -- ex: "BB001", "ITAU02"
  agencia         VARCHAR(10)   NOT NULL,
  agencia_dv      VARCHAR(2),
  conta           VARCHAR(20)   NOT NULL,
  conta_dv        VARCHAR(2),
  tipo            CHAR(1)       NOT NULL DEFAULT 'C'
                    CHECK (tipo IN ('C','P')),
                    -- C=Corrente, P=Poupança
  nome_gerente    VARCHAR(80),
  telefone        VARCHAR(20),
  saldo_inicial   NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_atual     NUMERIC(15,2) NOT NULL DEFAULT 0,  -- calculado via trigger/proc
  num_convenio    VARCHAR(20),   -- cobrança bancária
  carteira        VARCHAR(5),    -- carteira de cobrança
  limite          NUMERIC(15,2) NOT NULL DEFAULT 0,
  ativo           BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, mnemonico)
);

CREATE INDEX idx_conta_banco_empresa ON tab_conta_banco(empresa_id);
CREATE INDEX idx_conta_banco_ativo   ON tab_conta_banco(empresa_id, ativo);

CREATE TRIGGER trg_conta_banco_updated_at
  BEFORE UPDATE ON tab_conta_banco
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON COLUMN tab_conta_banco.mnemonico IS 'Identificador amigável da conta, ex: BB001, ITAU02';
COMMENT ON COLUMN tab_conta_banco.tipo      IS 'C=Corrente, P=Poupança';

-- =============================================================
-- TABELA: tab_pessoa
-- Cadastro único — clientes, fornecedores, bancos, transportadores
-- Padrão EMSys3: pessoa unificada com flags por tipo
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_pessoa (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           REFERENCES tab_empresa(id),  -- apenas informativo: qual empresa cadastrou
  tipo_pessoa     CHAR(1)       NOT NULL DEFAULT 'J'
                    CHECK (tipo_pessoa IN ('F','J')),
                    -- F=Física, J=Jurídica
  nome            VARCHAR(150)  NOT NULL,
  nome_fantasia   VARCHAR(100),
  cpf_cnpj        VARCHAR(18),
  rg_ie           VARCHAR(30),
  im              VARCHAR(20),
  -- Papéis (flags)
  ind_cliente       BOOLEAN NOT NULL DEFAULT false,
  ind_fornecedor    BOOLEAN NOT NULL DEFAULT false,
  ind_banco         BOOLEAN NOT NULL DEFAULT false,
  ind_transportador BOOLEAN NOT NULL DEFAULT false,
  -- Endereço
  logradouro      VARCHAR(255),
  numero          VARCHAR(10),
  complemento     VARCHAR(60),
  bairro          VARCHAR(80),
  cidade          VARCHAR(80),
  uf              CHAR(2),
  cep             VARCHAR(9),
  cod_ibge        VARCHAR(7),
  -- Contato
  telefone        VARCHAR(20),
  celular         VARCHAR(20),
  whatsapp        VARCHAR(20),
  email           VARCHAR(255),
  email_nfe       VARCHAR(255),  -- e-mail para envio de NF-e
  -- Dados financeiros (cliente)
  limite_credito  NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Dados bancários (fornecedor/pagamento)
  banco_nome      VARCHAR(60),
  banco_agencia   VARCHAR(10),
  banco_conta     VARCHAR(20),
  banco_tipo      CHAR(1)       CHECK (banco_tipo IN ('C','P')),
  chave_pix       VARCHAR(100),
  -- Fiscal
  contribuinte_icms BOOLEAN     NOT NULL DEFAULT false,
  optante_simples   BOOLEAN     NOT NULL DEFAULT false,
  -- Controle
  obs             TEXT,
  ativo           BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pessoa_empresa     ON tab_pessoa(empresa_id);
CREATE INDEX idx_pessoa_cpf_cnpj    ON tab_pessoa(cpf_cnpj);
CREATE INDEX idx_pessoa_nome        ON tab_pessoa(nome);
CREATE INDEX idx_pessoa_cliente     ON tab_pessoa(ind_cliente) WHERE ind_cliente = true;
CREATE INDEX idx_pessoa_fornecedor  ON tab_pessoa(ind_fornecedor) WHERE ind_fornecedor = true;
CREATE INDEX idx_pessoa_ativo       ON tab_pessoa(ativo);

CREATE TRIGGER trg_pessoa_updated_at
  BEFORE UPDATE ON tab_pessoa
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE  tab_pessoa              IS 'Cadastro unificado: clientes, fornecedores, transportadores';
COMMENT ON COLUMN tab_pessoa.tipo_pessoa  IS 'F=Física, J=Jurídica';
COMMENT ON COLUMN tab_pessoa.ind_cliente  IS 'Aparece em contas a receber e NF-e saída';
COMMENT ON COLUMN tab_pessoa.ind_fornecedor IS 'Aparece em contas a pagar e NF-e entrada';

-- =============================================================
-- TABELA: tab_centro_custo
-- Hierárquico — pai_id auto-referência
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_centro_custo (
  id          SERIAL        PRIMARY KEY,
  empresa_id  INT           NOT NULL REFERENCES tab_empresa(id),
  codigo      VARCHAR(20)   NOT NULL,
  descricao   VARCHAR(80)   NOT NULL,
  pai_id      INT           REFERENCES tab_centro_custo(id),
  tipo        CHAR(1)       NOT NULL DEFAULT 'A'
                CHECK (tipo IN ('A','S')),
                -- A=Analítico (aceita lançamentos), S=Sintético (agrupador)
  ativo       BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX idx_cc_empresa ON tab_centro_custo(empresa_id);
CREATE INDEX idx_cc_pai     ON tab_centro_custo(pai_id);

CREATE TRIGGER trg_cc_updated_at
  BEFORE UPDATE ON tab_centro_custo
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON COLUMN tab_centro_custo.tipo IS 'A=Analítico (recebe lançamentos), S=Sintético (agrupador)';

-- =============================================================
-- TABELA: tab_plano_contas
-- Plano de contas hierárquico com classificação SPED
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_plano_contas (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  codigo          VARCHAR(30)   NOT NULL,   -- ex: "1.1.01.001"
  descricao       VARCHAR(100)  NOT NULL,
  pai_id          INT           REFERENCES tab_plano_contas(id),
  tipo            CHAR(1)       NOT NULL DEFAULT 'A'
                    CHECK (tipo IN ('S','A')),
                    -- S=Sintética, A=Analítica
  natureza        CHAR(1)       NOT NULL DEFAULT 'D'
                    CHECK (natureza IN ('D','C')),
                    -- D=Devedora, C=Credora
  classificacao   VARCHAR(2)    NOT NULL DEFAULT '09'
                    CHECK (classificacao IN ('01','02','03','04','05','09')),
                    -- SPED ECD: 01=Ativo, 02=Passivo, 03=PL,
                    --           04=Resultado, 05=Compensação, 09=Outros
  grupo           VARCHAR(20),  -- Ativo Circulante, Despesa Operacional, etc.
  ativo           BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX idx_pc_empresa ON tab_plano_contas(empresa_id);
CREATE INDEX idx_pc_pai     ON tab_plano_contas(pai_id);
CREATE INDEX idx_pc_tipo    ON tab_plano_contas(empresa_id, tipo);

CREATE TRIGGER trg_pc_updated_at
  BEFORE UPDATE ON tab_plano_contas
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON COLUMN tab_plano_contas.tipo          IS 'S=Sintética (agrupador), A=Analítica (recebe lançamentos)';
COMMENT ON COLUMN tab_plano_contas.natureza      IS 'D=Devedora, C=Credora';
COMMENT ON COLUMN tab_plano_contas.classificacao IS 'SPED ECD: 01=Ativo 02=Passivo 03=PL 04=Resultado 05=Compensação 09=Outros';

-- =============================================================
-- TABELA: tab_tipo_despesa
-- Classificação de despesas com informações tributárias
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_tipo_despesa (
  id                  SERIAL        PRIMARY KEY,
  empresa_id          INT           NOT NULL REFERENCES tab_empresa(id),
  codigo              VARCHAR(20)   NOT NULL,
  descricao           VARCHAR(80)   NOT NULL,
  natureza            CHAR(1)       NOT NULL DEFAULT 'A'
                        CHECK (natureza IN ('A','F','I')),
                        -- A=Administrativa, F=Financeira, I=Imposto/Tributo
  conta_id            INT           REFERENCES tab_plano_contas(id),
  ind_pis_cofins      BOOLEAN       NOT NULL DEFAULT false,
  ind_imposto         BOOLEAN       NOT NULL DEFAULT false,
  tipo_imposto        VARCHAR(10)
                        CHECK (tipo_imposto IN (
                          'IRPJ','IRRF','CSLL','PIS','COFINS',
                          'INSS','FGTS','ISS','ICMS','IPI',
                          'IOF','CIDE','CSRF','DARF','OUTROS'
                        )),
  ind_capex           BOOLEAN       NOT NULL DEFAULT false,  -- investimento
  pai_id              INT           REFERENCES tab_tipo_despesa(id),
  ativo               BOOLEAN       NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX idx_td_empresa ON tab_tipo_despesa(empresa_id);
CREATE INDEX idx_td_ativo   ON tab_tipo_despesa(empresa_id, ativo);

CREATE TRIGGER trg_td_updated_at
  BEFORE UPDATE ON tab_tipo_despesa
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON COLUMN tab_tipo_despesa.natureza    IS 'A=Administrativa, F=Financeira, I=Imposto/Tributo';
COMMENT ON COLUMN tab_tipo_despesa.ind_capex   IS 'true=Investimento (CAPEX), false=Operacional (OPEX)';

-- =============================================================
-- TABELA: tab_tipo_receita
-- Classificação de receitas com informações tributárias
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_tipo_receita (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  codigo          VARCHAR(20)   NOT NULL,
  descricao       VARCHAR(80)   NOT NULL,
  natureza        CHAR(1)       NOT NULL DEFAULT 'O'
                    CHECK (natureza IN ('O','F','E')),
                    -- O=Operacional, F=Financeira, E=Eventual/Não-Operacional
  conta_id        INT           REFERENCES tab_plano_contas(id),
  ind_pis_cofins  BOOLEAN       NOT NULL DEFAULT false,
  pai_id          INT           REFERENCES tab_tipo_receita(id),
  ativo           BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX idx_tr_empresa ON tab_tipo_receita(empresa_id);
CREATE INDEX idx_tr_ativo   ON tab_tipo_receita(empresa_id, ativo);

CREATE TRIGGER trg_tr_updated_at
  BEFORE UPDATE ON tab_tipo_receita
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON COLUMN tab_tipo_receita.natureza IS 'O=Operacional, F=Financeira, E=Eventual/Não-Operacional';

-- =============================================================
-- TABELA: tab_condicao_pagamento
-- Prazos e regras de parcelamento
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_condicao_pagamento (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  descricao       VARCHAR(80)   NOT NULL,
  tipo            CHAR(1)       NOT NULL DEFAULT 'V'
                    CHECK (tipo IN ('V','P')),
                    -- V=À Vista, P=Parcelado
  num_parcelas    INT           NOT NULL DEFAULT 1
                    CHECK (num_parcelas >= 1),
  intervalo_dias  INT           NOT NULL DEFAULT 30
                    CHECK (intervalo_dias >= 0),
  entrada_pct     NUMERIC(5,2)  NOT NULL DEFAULT 0,  -- % de entrada (0=sem entrada)
  ativo           BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, descricao)
);

CREATE INDEX idx_cp_empresa ON tab_condicao_pagamento(empresa_id);

COMMENT ON COLUMN tab_condicao_pagamento.tipo            IS 'V=À Vista, P=Parcelado';
COMMENT ON COLUMN tab_condicao_pagamento.intervalo_dias  IS 'Dias entre parcelas';
COMMENT ON COLUMN tab_condicao_pagamento.entrada_pct     IS 'Percentual de entrada (0 = sem entrada)';

-- =============================================================
-- TABELA: tab_tipo_cobranca
-- Tipos de cobrança para parcelamento e geração de boleto
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_tipo_cobranca (
  cod_tipo_cobranca INTEGER     NOT NULL,
  des_tipo_cobranca VARCHAR(60) NOT NULL,
  ind_status        CHAR(1)     NOT NULL DEFAULT 'A'
                      CHECK (ind_status IN ('A','I')),
                      -- A=Ativo, I=Inativo
  CONSTRAINT tab_tipo_cobranca_pkey PRIMARY KEY(cod_tipo_cobranca)
);

COMMENT ON TABLE  tab_tipo_cobranca                    IS 'Tipos de cobrança para parcelamento e boleto';
COMMENT ON COLUMN tab_tipo_cobranca.cod_tipo_cobranca  IS 'Código manual (ex: 1=Boleto, 2=PIX, 3=Cartão Crédito)';
COMMENT ON COLUMN tab_tipo_cobranca.ind_status         IS 'A=Ativo, I=Inativo';

-- =============================================================
-- VIEWS úteis
-- =============================================================

-- Clientes ativos
CREATE OR REPLACE VIEW vw_clientes AS
SELECT
  p.id, p.empresa_id, p.tipo_pessoa, p.nome, p.nome_fantasia,
  p.cpf_cnpj, p.telefone, p.celular, p.whatsapp, p.email,
  p.cidade, p.uf, p.limite_credito, p.ativo
FROM tab_pessoa p
WHERE p.ind_cliente = true;

-- Fornecedores ativos
CREATE OR REPLACE VIEW vw_fornecedores AS
SELECT
  p.id, p.empresa_id, p.tipo_pessoa, p.nome, p.nome_fantasia,
  p.cpf_cnpj, p.telefone, p.email,
  p.cidade, p.uf,
  p.banco_nome, p.banco_agencia, p.banco_conta, p.chave_pix,
  p.ativo
FROM tab_pessoa p
WHERE p.ind_fornecedor = true;

-- Plano de contas com caminho completo
CREATE OR REPLACE VIEW vw_plano_contas AS
WITH RECURSIVE arvore AS (
  SELECT id, empresa_id, codigo, descricao, pai_id, tipo, natureza,
         classificacao, 0 AS nivel, codigo::TEXT AS caminho
  FROM tab_plano_contas
  WHERE pai_id IS NULL

  UNION ALL

  SELECT pc.id, pc.empresa_id, pc.codigo, pc.descricao, pc.pai_id,
         pc.tipo, pc.natureza, pc.classificacao,
         a.nivel + 1,
         a.caminho || ' > ' || pc.descricao
  FROM tab_plano_contas pc
  INNER JOIN arvore a ON pc.pai_id = a.id
)
SELECT * FROM arvore ORDER BY caminho;

-- Centros de custo com caminho completo
CREATE OR REPLACE VIEW vw_centros_custo AS
WITH RECURSIVE arvore AS (
  SELECT id, empresa_id, codigo, descricao, pai_id, tipo,
         0 AS nivel, descricao::TEXT AS caminho
  FROM tab_centro_custo
  WHERE pai_id IS NULL

  UNION ALL

  SELECT cc.id, cc.empresa_id, cc.codigo, cc.descricao, cc.pai_id,
         cc.tipo, a.nivel + 1,
         a.caminho || ' > ' || cc.descricao
  FROM tab_centro_custo cc
  INNER JOIN arvore a ON cc.pai_id = a.id
)
SELECT * FROM arvore ORDER BY caminho;

-- =============================================================
-- FUNÇÃO: fn_check_cpf_cnpj_duplicado
-- Impede CPF/CNPJ duplicado globalmente (pessoa não é por empresa)
-- =============================================================
CREATE OR REPLACE FUNCTION fn_check_cpf_cnpj_duplicado()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cpf_cnpj IS NOT NULL AND NEW.cpf_cnpj <> '' THEN
    IF EXISTS (
      SELECT 1 FROM tab_pessoa
      WHERE cpf_cnpj = NEW.cpf_cnpj
        AND id <> COALESCE(NEW.id, 0)
        AND ativo = true
    ) THEN
      RAISE EXCEPTION 'CPF/CNPJ % já cadastrado', NEW.cpf_cnpj;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pessoa_cpf_cnpj_unico
  BEFORE INSERT OR UPDATE ON tab_pessoa
  FOR EACH ROW EXECUTE FUNCTION fn_check_cpf_cnpj_duplicado();
