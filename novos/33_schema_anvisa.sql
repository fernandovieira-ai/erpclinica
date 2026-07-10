-- =============================================================================
-- 33_schema_anvisa.sql
-- Tabelas para catalogo de medicamentos ANVISA
-- Base compartilhada — nao por empresa (dados publicos de referencia)
-- Executar no banco que centraliza o catalogo (ex: saas_control ou hiitcor)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Medicamentos registrados na ANVISA
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tab_medicamento (
    id                          SERIAL          PRIMARY KEY,
    codigo_produto              VARCHAR(20)     NOT NULL,
    nome                        TEXT            NOT NULL,
    principio_ativo             TEXT,
    classe_terapeutica          TEXT,
    categoria_regulatoria       TEXT,
    numero_registro             VARCHAR(25),
    processo                    VARCHAR(40),
    empresa                     TEXT,
    cnpj                        VARCHAR(20),
    codigo_bula_paciente        VARCHAR(40),
    codigo_bula_profissional    VARCHAR(40),
    existe_bula                 BOOLEAN         DEFAULT FALSE,
    caminho_bula_paciente       TEXT,
    caminho_bula_profissional   TEXT,
    ativo                       BOOLEAN         DEFAULT TRUE,
    created_at                  TIMESTAMPTZ     DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     DEFAULT NOW(),
    CONSTRAINT uq_medicamento_codigo_produto UNIQUE (codigo_produto)
);

CREATE INDEX IF NOT EXISTS idx_medicamento_nome
    ON tab_medicamento (nome);
CREATE INDEX IF NOT EXISTS idx_medicamento_principio
    ON tab_medicamento (principio_ativo);
CREATE INDEX IF NOT EXISTS idx_medicamento_registro
    ON tab_medicamento (numero_registro);
CREATE INDEX IF NOT EXISTS idx_medicamento_ativo
    ON tab_medicamento (ativo);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION fn_anvisa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_medicamento_updated_at ON tab_medicamento;
CREATE TRIGGER trg_medicamento_updated_at
    BEFORE UPDATE ON tab_medicamento
    FOR EACH ROW EXECUTE FUNCTION fn_anvisa_updated_at();

-- -----------------------------------------------------------------------------
-- Apresentacoes de cada medicamento
-- Uma apresentacao = embalagem/forma especifica (ex: comprimido 20mg cx 30)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tab_medicamento_apresentacao (
    id                      SERIAL          PRIMARY KEY,
    codigo_apresentacao     VARCHAR(40)     NOT NULL,
    codigo_produto          VARCHAR(20)     NOT NULL
        REFERENCES tab_medicamento(codigo_produto) ON DELETE CASCADE,
    descricao               TEXT,
    forma_farmaceutica      TEXT,
    numero_registro         VARCHAR(25),
    quantidade              TEXT,
    validade                TEXT,
    tipo_validade           TEXT,
    tarja                   TEXT,
    restricao_uso           TEXT,
    destinacao              TEXT,
    ativa                   BOOLEAN         DEFAULT TRUE,
    tipo_autorizacao        TEXT,
    created_at              TIMESTAMPTZ     DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     DEFAULT NOW(),
    CONSTRAINT uq_apresentacao_codigo UNIQUE (codigo_apresentacao)
);

CREATE INDEX IF NOT EXISTS idx_apresentacao_produto
    ON tab_medicamento_apresentacao (codigo_produto);
CREATE INDEX IF NOT EXISTS idx_apresentacao_ativa
    ON tab_medicamento_apresentacao (ativa);

DROP TRIGGER IF EXISTS trg_apresentacao_updated_at ON tab_medicamento_apresentacao;
CREATE TRIGGER trg_apresentacao_updated_at
    BEFORE UPDATE ON tab_medicamento_apresentacao
    FOR EACH ROW EXECUTE FUNCTION fn_anvisa_updated_at();

-- -----------------------------------------------------------------------------
-- Fabricantes das apresentacoes (nacionais e internacionais)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tab_medicamento_fabricante (
    id                      SERIAL          PRIMARY KEY,
    codigo_apresentacao     VARCHAR(40)     NOT NULL
        REFERENCES tab_medicamento_apresentacao(codigo_apresentacao) ON DELETE CASCADE,
    nome                    TEXT            NOT NULL,
    pais                    TEXT,
    estado                  VARCHAR(10),
    cidade                  TEXT,
    tipo                    VARCHAR(15)
        CHECK (tipo IN ('nacional', 'internacional'))
);

CREATE INDEX IF NOT EXISTS idx_fabricante_apresentacao
    ON tab_medicamento_fabricante (codigo_apresentacao);

-- -----------------------------------------------------------------------------
-- Conservacao das apresentacoes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tab_medicamento_conservacao (
    id                      SERIAL          PRIMARY KEY,
    codigo_apresentacao     VARCHAR(40)     NOT NULL
        REFERENCES tab_medicamento_apresentacao(codigo_apresentacao) ON DELETE CASCADE,
    descricao               TEXT            NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conservacao_apresentacao
    ON tab_medicamento_conservacao (codigo_apresentacao);

-- -----------------------------------------------------------------------------
-- Restricoes de prescricao
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tab_medicamento_restricao_prescricao (
    id                      SERIAL          PRIMARY KEY,
    codigo_apresentacao     VARCHAR(40)     NOT NULL
        REFERENCES tab_medicamento_apresentacao(codigo_apresentacao) ON DELETE CASCADE,
    descricao               TEXT            NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_restricao_apresentacao
    ON tab_medicamento_restricao_prescricao (codigo_apresentacao);

-- -----------------------------------------------------------------------------
-- Vias de administracao
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tab_medicamento_via_administracao (
    id                      SERIAL          PRIMARY KEY,
    codigo_apresentacao     VARCHAR(40)     NOT NULL
        REFERENCES tab_medicamento_apresentacao(codigo_apresentacao) ON DELETE CASCADE,
    descricao               TEXT            NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_via_apresentacao
    ON tab_medicamento_via_administracao (codigo_apresentacao);

-- -----------------------------------------------------------------------------
-- Principios ativos por apresentacao
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tab_medicamento_principio_ativo_apres (
    id                      SERIAL          PRIMARY KEY,
    codigo_apresentacao     VARCHAR(40)     NOT NULL
        REFERENCES tab_medicamento_apresentacao(codigo_apresentacao) ON DELETE CASCADE,
    descricao               TEXT            NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pa_apresentacao
    ON tab_medicamento_principio_ativo_apres (codigo_apresentacao);

-- -----------------------------------------------------------------------------
-- Log de importacao — rastreamento de cada execucao
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tab_anvisa_import_log (
    id                  SERIAL          PRIMARY KEY,
    iniciado_em         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    concluido_em        TIMESTAMPTZ,
    total_produtos      INTEGER         DEFAULT 0,
    total_sucesso       INTEGER         DEFAULT 0,
    total_falha         INTEGER         DEFAULT 0,
    status              VARCHAR(20)     DEFAULT 'em_andamento'
        CHECK (status IN ('em_andamento', 'concluido', 'erro')),
    observacoes         TEXT
);

-- =============================================================================
-- VIEW: busca simplificada para autocomplete de medicamentos
-- =============================================================================
CREATE OR REPLACE VIEW vw_medicamento_busca AS
SELECT
    m.codigo_produto,
    m.nome,
    m.principio_ativo,
    m.classe_terapeutica,
    m.numero_registro,
    m.empresa,
    m.existe_bula,
    COUNT(a.id) FILTER (WHERE a.ativa = TRUE) AS qtd_apresentacoes
FROM tab_medicamento m
LEFT JOIN tab_medicamento_apresentacao a ON a.codigo_produto = m.codigo_produto
WHERE m.ativo = TRUE
GROUP BY
    m.codigo_produto, m.nome, m.principio_ativo, m.classe_terapeutica,
    m.numero_registro, m.empresa, m.existe_bula;
