-- =============================================================
-- 49_atestado_medico.sql
-- Atestado medico (afastamento / comparecimento / personalizado)
-- Rodar no database do cliente
-- Pre-requisito: 04_schema_clinica.sql ja aplicado (tab_agendamento)
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE TABLE IF NOT EXISTS tab_atestado_medico (
  id               SERIAL        PRIMARY KEY,
  empresa_id       INT           NOT NULL REFERENCES tab_empresa(id),
  agendamento_id   INT           NOT NULL REFERENCES tab_agendamento(id),
  paciente_id      INT           NOT NULL REFERENCES tab_pessoa(id),
  profissional_id  INT           NOT NULL REFERENCES tab_pessoa(id),
  tipo             VARCHAR(20)   NOT NULL, -- AFASTAMENTO | COMPARECIMENTO | PERSONALIZADO
  dias_afastamento INT,
  data_inicio      DATE          NOT NULL,
  cid              VARCHAR(10),
  texto            TEXT          NOT NULL,
  created_by       VARCHAR(100),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atestado_agendamento ON tab_atestado_medico(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_atestado_paciente     ON tab_atestado_medico(paciente_id);
CREATE INDEX IF NOT EXISTS idx_atestado_empresa       ON tab_atestado_medico(empresa_id);

COMMENT ON TABLE tab_atestado_medico IS 'Atestados medicos emitidos numa consulta - afastamento, comparecimento ou texto personalizado';
COMMENT ON COLUMN tab_atestado_medico.cid IS 'CID opcional - por resolucao do CFM, so deve constar com consentimento do paciente';
COMMENT ON COLUMN tab_atestado_medico.texto IS 'Texto final do atestado (editavel antes de salvar) - fonte da verdade pra reimpressao';

-- GRANT obrigatorio em tabela nova (ver padroes.md secao 8 - role de app != owner da migration)
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_atestado_medico TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_atestado_medico_id_seq TO %I', app_role);
EXCEPTION WHEN others THEN NULL;
END;
$$;
