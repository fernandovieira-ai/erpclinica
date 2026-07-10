-- =============================================================
-- 34_receita_sistema.sql
-- Receita medica emitida pelo sistema interno (sem Memed)
-- Pre-requisito: 04_schema_clinica.sql aplicado
-- =============================================================

SET client_encoding = 'LATIN1';

-- Cabecalho da receita
CREATE TABLE IF NOT EXISTS tab_receita_sistema (
  id              SERIAL          PRIMARY KEY,
  empresa_id      INT             NOT NULL REFERENCES tab_empresa(id),
  agendamento_id  INT             NOT NULL REFERENCES tab_agendamento(id),
  paciente_id     INT             NOT NULL REFERENCES tab_pessoa(id),
  profissional_id INT             NOT NULL REFERENCES tab_pessoa(id),
  observacoes     TEXT,
  created_by      VARCHAR(100),
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receita_sis_empresa     ON tab_receita_sistema (empresa_id);
CREATE INDEX IF NOT EXISTS idx_receita_sis_agendamento ON tab_receita_sistema (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_receita_sis_paciente    ON tab_receita_sistema (paciente_id);

-- Itens (medicamentos) da receita
CREATE TABLE IF NOT EXISTS tab_receita_sistema_item (
  id                 SERIAL          PRIMARY KEY,
  receita_id         INT             NOT NULL REFERENCES tab_receita_sistema(id) ON DELETE CASCADE,
  medicamento_nome   TEXT            NOT NULL,
  codigo_produto     VARCHAR(20),
  apresentacao       TEXT,
  forma_farmaceutica TEXT,
  via_administracao  TEXT,
  posologia          TEXT            NOT NULL,
  duracao            TEXT,
  quantidade         TEXT,
  ordem              INT             NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_receita_sis_item ON tab_receita_sistema_item (receita_id);

-- GRANT para o role de app (mesmo padrao dos outros schemas)
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_receita_sistema      TO %I', app_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_receita_sistema_item TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_receita_sistema_id_seq      TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_receita_sistema_item_id_seq TO %I', app_role);
EXCEPTION WHEN others THEN NULL;
END;
$$;
