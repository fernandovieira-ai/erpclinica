-- =============================================================
-- 64_exame_padrao.sql
-- Catalogo de exames padrao (lista editavel de favoritos) usada
-- na Solicitacao de Exame (ver 63_solicitacao_exame.sql) pra
-- montar o pedido mais rapido, sem digitar o nome do exame toda vez.
-- So estrutura - sem seed de dados aqui: nomes tem acentuacao e o
-- seed e feito via script Node parametrizado (evita risco de
-- transcodificacao LATIN1 em literal inline nesta migration).
-- Rodar no database do cliente
-- Pre-requisito: 01_schema_cadastros.sql ja aplicado (tab_empresa)
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE TABLE IF NOT EXISTS tab_exame_padrao (
  id          SERIAL        PRIMARY KEY,
  empresa_id  INT           NOT NULL REFERENCES tab_empresa(id),
  nome        VARCHAR(150)  NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_exame_padrao_empresa ON tab_exame_padrao(empresa_id);

COMMENT ON TABLE tab_exame_padrao IS 'Catalogo editavel de exames padrao (favoritos) por empresa - usado so pra montar a Solicitacao de Exame mais rapido';

-- GRANT obrigatorio em tabela nova (ver padroes.md secao 8 - role de app != owner da migration)
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_exame_padrao TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_exame_padrao_id_seq TO %I', app_role);
EXCEPTION WHEN others THEN NULL;
END;
$$;
