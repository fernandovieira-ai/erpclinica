-- =============================================================
-- 00_saas_control.sql
-- Banco de controle SaaS — DigitalRF Financeiro
-- Rodar UMA VEZ no servidor como superuser PostgreSQL
-- Conectar em: saas_control
-- =============================================================

SET client_encoding = 'LATIN1';

-- -------------------------------------------------------------
-- Trigger fn_set_updated_at (reutilizado em várias tabelas)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- TABELA: tab_saas_admin
-- Equipe DigitalRF — acesso ao /admin
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_saas_admin (
  id            SERIAL        PRIMARY KEY,
  nome          VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  senha_hash    VARCHAR(255)  NOT NULL,
  ativo         BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_saas_admin_updated_at
  BEFORE UPDATE ON tab_saas_admin
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE tab_saas_admin IS 'Equipe DigitalRF — acesso ao painel /admin';

-- =============================================================
-- TABELA: tab_instancia
-- Um registro por cliente SaaS
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_instancia (
  id              SERIAL        PRIMARY KEY,
  slug            VARCHAR(50)   NOT NULL UNIQUE,       -- ex: "clienteabc"
  database_name   VARCHAR(63)   NOT NULL UNIQUE,       -- ex: "fin_clienteabc"
  nome_cliente    VARCHAR(150)  NOT NULL,
  cnpj            VARCHAR(18),
  email_contato   VARCHAR(255),
  telefone        VARCHAR(20),
  dominio         VARCHAR(255),                        -- ex: "clienteabc.digitalrf.com.br"
  plano           VARCHAR(20)   NOT NULL DEFAULT 'basico'
                    CHECK (plano IN ('basico', 'profissional', 'enterprise')),
  status          VARCHAR(20)   NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo', 'suspenso', 'cancelado', 'trial')),
  trial_ate       DATE,                                -- NULL = não é trial
  max_empresas    INT           NOT NULL DEFAULT 3,
  max_usuarios    INT           NOT NULL DEFAULT 10,
  obs             TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_instancia_slug        ON tab_instancia(slug);
CREATE INDEX idx_instancia_status      ON tab_instancia(status);
CREATE INDEX idx_instancia_database    ON tab_instancia(database_name);

CREATE TRIGGER trg_instancia_updated_at
  BEFORE UPDATE ON tab_instancia
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE  tab_instancia                IS 'Um registro por cliente SaaS';
COMMENT ON COLUMN tab_instancia.slug           IS 'Identificador único amigável do cliente';
COMMENT ON COLUMN tab_instancia.database_name  IS 'Nome do database PostgreSQL do cliente (ex: fin_clienteabc)';
COMMENT ON COLUMN tab_instancia.dominio        IS 'Subdomínio ou domínio próprio do cliente';

-- =============================================================
-- TABELA: tab_provisioning_log
-- Histórico de operações sobre instâncias
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_provisioning_log (
  id              SERIAL        PRIMARY KEY,
  instancia_id    INT           NOT NULL REFERENCES tab_instancia(id),
  operacao        VARCHAR(30)   NOT NULL
                    CHECK (operacao IN ('criar', 'suspender', 'reativar', 'cancelar',
                                        'migration', 'backup', 'restaurar')),
  status          VARCHAR(20)   NOT NULL DEFAULT 'ok'
                    CHECK (status IN ('ok', 'erro', 'pendente')),
  detalhes        TEXT,
  admin_id        INT           REFERENCES tab_saas_admin(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prov_log_instancia ON tab_provisioning_log(instancia_id);
CREATE INDEX idx_prov_log_created   ON tab_provisioning_log(created_at DESC);

COMMENT ON TABLE tab_provisioning_log IS 'Histórico de operações sobre instâncias de clientes';

-- =============================================================
-- TABELA: tab_plano
-- Definição de planos SaaS (opcional — referência futura)
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_plano (
  id              SERIAL        PRIMARY KEY,
  codigo          VARCHAR(20)   NOT NULL UNIQUE,
  nome            VARCHAR(60)   NOT NULL,
  max_empresas    INT           NOT NULL DEFAULT 3,
  max_usuarios    INT           NOT NULL DEFAULT 10,
  modulos         TEXT[]        NOT NULL DEFAULT '{}',
  valor_mensal    NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo           BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO tab_plano (codigo, nome, max_empresas, max_usuarios, modulos, valor_mensal)
VALUES
  ('basico',        'Básico',        1,   5,  ARRAY['financeiro','fiscal'], 0),
  ('profissional',  'Profissional',  5,  20,  ARRAY['financeiro','fiscal','contabil','ia'], 0),
  ('enterprise',    'Enterprise',   99, 999,  ARRAY['financeiro','fiscal','contabil','ia','admin'], 0)
ON CONFLICT (codigo) DO NOTHING;

-- =============================================================
-- VIEW: vw_painel_admin
-- Visão consolidada para o painel /admin
-- =============================================================
CREATE OR REPLACE VIEW vw_painel_admin AS
SELECT
  i.id,
  i.slug,
  i.database_name,
  i.nome_cliente,
  i.cnpj,
  i.email_contato,
  i.dominio,
  i.plano,
  i.status,
  i.trial_ate,
  i.max_empresas,
  i.max_usuarios,
  i.created_at,
  i.updated_at,
  CASE
    WHEN i.status = 'trial' AND i.trial_ate < CURRENT_DATE THEN 'trial_expirado'
    ELSE i.status
  END AS status_efetivo
FROM tab_instancia i
ORDER BY i.nome_cliente;

-- =============================================================
-- SEED: admin DigitalRF padrão
-- Trocar senha após primeiro login!
-- Senha padrão: DigitalRF@2025 (bcrypt abaixo)
-- =============================================================
INSERT INTO tab_saas_admin (nome, email, senha_hash)
VALUES (
  'DigitalRF Admin',
  'admin@digitalrf.com.br',
  '$2b$12$PLACEHOLDER_TROCAR_SENHA_HASH_AQUI'
)
ON CONFLICT (email) DO NOTHING;

-- =============================================================
-- INSTRUÇÕES PÓS-EXECUÇÃO
-- =============================================================
-- 1. Gerar o hash da senha real:
--    node -e "const b=require('bcryptjs');b.hash('SuaSenhaAqui',12).then(console.log)"
--
-- 2. Atualizar o hash no banco:
--    UPDATE tab_saas_admin SET senha_hash = '$2b$12$...' WHERE email = 'admin@digitalrf.com.br';
--
-- 3. Verificar:
--    SELECT id, nome, email, ativo FROM tab_saas_admin;
--    SELECT id, slug, database_name, status FROM tab_instancia;
