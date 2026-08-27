-- =============================================================
-- 54_log_auditoria.sql
-- Trilha de auditoria generica: quem alterou/excluiu qual registro,
-- quando, com snapshot antes/depois em JSONB.
-- Rodar no database do cliente
-- Pre-requisito: 01_schema_cadastros.sql ja aplicado (tab_usuario, tab_empresa)
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE TABLE IF NOT EXISTS tab_log_auditoria (
  id            BIGSERIAL     PRIMARY KEY,
  empresa_id    INT           REFERENCES tab_empresa(id),
  usuario_id    INT           REFERENCES tab_usuario(id),
  usuario_nome  VARCHAR(100),
  tabela        VARCHAR(60)   NOT NULL,
  registro_id   INT           NOT NULL,
  acao          VARCHAR(10)   NOT NULL CHECK (acao IN ('INSERT','UPDATE','DELETE')),
  dados_antes   JSONB,
  dados_depois  JSONB,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_auditoria_tabela_registro ON tab_log_auditoria(tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_log_auditoria_empresa_data     ON tab_log_auditoria(empresa_id, created_at DESC);

COMMENT ON TABLE tab_log_auditoria IS 'Trilha de auditoria generica: quem alterou/excluiu qual registro, quando, com snapshot antes/depois em JSONB';

-- GRANT obrigatorio em tabela nova (ver padroes.md secao 8 - role de app != owner da migration)
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_log_auditoria TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_log_auditoria_id_seq TO %I', app_role);
EXCEPTION WHEN others THEN NULL;
END;
$$;
