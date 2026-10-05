-- =============================================================
-- 63_solicitacao_exame.sql
-- Solicitacao de Exame Medico (pedido de exame entregue ao paciente)
-- Mesmo padrao de Atestado/Receituario Especial: texto final gravado
-- e fonte da verdade pra reimpressao.
-- Rodar no database do cliente
-- Pre-requisito: 04_schema_clinica.sql ja aplicado (tab_agendamento)
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE TABLE IF NOT EXISTS tab_solicitacao_exame (
  id                SERIAL        PRIMARY KEY,
  empresa_id        INT           NOT NULL REFERENCES tab_empresa(id),
  agendamento_id    INT           NOT NULL REFERENCES tab_agendamento(id),
  paciente_id       INT           NOT NULL REFERENCES tab_pessoa(id),
  profissional_id   INT           NOT NULL REFERENCES tab_pessoa(id),
  caracter          VARCHAR(20)   NOT NULL DEFAULT 'ROTINA', -- ROTINA | URGENCIA
  indicacao_clinica TEXT,
  exames            TEXT          NOT NULL,
  created_by        VARCHAR(100),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitacao_exame_agendamento ON tab_solicitacao_exame(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_solicitacao_exame_paciente     ON tab_solicitacao_exame(paciente_id);
CREATE INDEX IF NOT EXISTS idx_solicitacao_exame_empresa       ON tab_solicitacao_exame(empresa_id);

COMMENT ON TABLE tab_solicitacao_exame IS 'Solicitacoes de exame medico emitidas numa consulta - pedido entregue ao paciente';
COMMENT ON COLUMN tab_solicitacao_exame.caracter IS 'ROTINA ou URGENCIA';
COMMENT ON COLUMN tab_solicitacao_exame.indicacao_clinica IS 'Indicacao clinica / hipotese diagnostica (opcional)';
COMMENT ON COLUMN tab_solicitacao_exame.exames IS 'Lista de exames solicitados (texto livre) - fonte da verdade pra reimpressao';

-- GRANT obrigatorio em tabela nova (ver padroes.md secao 8 - role de app != owner da migration)
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_solicitacao_exame TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_solicitacao_exame_id_seq TO %I', app_role);
EXCEPTION WHEN others THEN NULL;
END;
$$;
