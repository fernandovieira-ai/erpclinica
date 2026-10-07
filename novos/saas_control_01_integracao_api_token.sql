-- =============================================================
-- saas_control_01_integracao_api_token.sql
-- Tokens de API para integracoes externas (ex: GoHighLevel) puxarem
-- dados de um tenant especifico. Roda contra o banco saas_control,
-- NUNCA contra um banco de tenant.
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE TABLE IF NOT EXISTS tab_integracao_api_token (
  id             SERIAL        PRIMARY KEY,
  database_name  VARCHAR(63)   NOT NULL,
  empresa_id     INT           NOT NULL,
  integracao     VARCHAR(30)   NOT NULL DEFAULT 'gohighlevel',
  token          VARCHAR(80)   NOT NULL UNIQUE,
  ativo          BOOLEAN       NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (database_name, empresa_id, integracao)
);

CREATE INDEX IF NOT EXISTS idx_integracao_api_token_token ON tab_integracao_api_token(token);

CREATE TRIGGER trg_integracao_api_token_updated_at
  BEFORE UPDATE ON tab_integracao_api_token
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE  tab_integracao_api_token             IS 'Tokens de API para integracoes externas (ex: GoHighLevel) acessarem dados de um tenant/empresa';
COMMENT ON COLUMN tab_integracao_api_token.database_name IS 'database do tenant (ver tab_instancia.database_name)';
COMMENT ON COLUMN tab_integracao_api_token.empresa_id    IS 'id de tab_empresa dentro do database do tenant';
COMMENT ON COLUMN tab_integracao_api_token.integracao    IS 'identifica qual integracao externa usa o token (gohighlevel, etc)';

-- Migrations rodam como user_dba (owner); a app conecta no saas_control com o
-- role de baixo privilegio PG_CONTROL_USER (ver lib/db/index.ts) - sem este
-- GRANT a tabela existe mas a app recebe erro de permissao ao usa-la.
GRANT SELECT, INSERT, UPDATE, DELETE ON tab_integracao_api_token TO saas_control;
GRANT USAGE, SELECT ON SEQUENCE tab_integracao_api_token_id_seq TO saas_control;
