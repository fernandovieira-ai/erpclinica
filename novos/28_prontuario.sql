-- =============================================================
-- 28_prontuario.sql
-- Prontuario clinico - historico de consultas do paciente
-- Rodar no database do cliente
-- Pre-requisito: 04_schema_clinica.sql ja aplicado (tab_agendamento)
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE TABLE IF NOT EXISTS tab_prontuario (
  id                      SERIAL        PRIMARY KEY,
  empresa_id              INT           NOT NULL REFERENCES tab_empresa(id),
  agendamento_id          INT           NOT NULL REFERENCES tab_agendamento(id) ON DELETE CASCADE,
  paciente_id             INT           NOT NULL REFERENCES tab_pessoa(id),
  profissional_id         INT           NOT NULL REFERENCES tab_pessoa(id),
  queixas                 TEXT,
  hda                     TEXT,
  antecedentes_familiares TEXT,
  antecedentes_pessoais   TEXT,
  habitos                 TEXT,
  alergias                TEXT,
  exame_fisico            TEXT,
  peso                    NUMERIC(5,2),
  pressao                 VARCHAR(20),
  exames                  TEXT,
  diagnostico             TEXT,
  medicacao               TEXT,
  outras_condutas         TEXT,
  created_by              VARCHAR(100),
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (agendamento_id)
);

CREATE INDEX IF NOT EXISTS idx_prontuario_paciente     ON tab_prontuario(paciente_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_empresa      ON tab_prontuario(empresa_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_profissional ON tab_prontuario(profissional_id);

DROP TRIGGER IF EXISTS trg_prontuario_updated_at ON tab_prontuario;
CREATE TRIGGER trg_prontuario_updated_at
  BEFORE UPDATE ON tab_prontuario
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE tab_prontuario IS 'Registro clinico (prontuario) de uma consulta atendida';
COMMENT ON COLUMN tab_prontuario.hda IS 'Historia da doenca atual';
COMMENT ON COLUMN tab_prontuario.pressao IS 'Pressao arterial, ex: 135x85mmHg';
