-- =============================================================
-- 71_mensagens_internas.sql
-- Mensagens internas 1-para-1 entre usuarios do sistema (ex: medico <-> secretaria).
-- Rodar no database do cliente.
-- Pre-requisito: 01_schema_cadastros.sql ja aplicado (tab_usuario, tab_empresa, tab_usuario_empresa)
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE TABLE IF NOT EXISTS tab_mensagem (
  id              BIGSERIAL     PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  remetente_id    INT           NOT NULL REFERENCES tab_usuario(id),
  destinatario_id INT           NOT NULL REFERENCES tab_usuario(id),
  texto           VARCHAR(2000) NOT NULL,
  lida_em         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK (remetente_id <> destinatario_id)
);

-- Historico de uma conversa (par de usuarios), mais recente primeiro
CREATE INDEX IF NOT EXISTS idx_mensagem_par_a ON tab_mensagem (empresa_id, remetente_id, destinatario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensagem_par_b ON tab_mensagem (empresa_id, destinatario_id, remetente_id, created_at DESC);
-- Contagem de nao lidas por destinatario (usada no badge da sidebar e no SSE)
CREATE INDEX IF NOT EXISTS idx_mensagem_nao_lidas ON tab_mensagem (empresa_id, destinatario_id) WHERE lida_em IS NULL;

COMMENT ON TABLE tab_mensagem IS 'Mensagens internas 1-para-1 entre usuarios do sistema (ex: medico <-> secretaria)';

-- GRANT obrigatorio em tabela nova (ver padroes.md secao 8 - role de app != owner da migration)
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON tab_mensagem TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_mensagem_id_seq TO %I', app_role);
EXCEPTION WHEN others THEN NULL;
END;
$$;
