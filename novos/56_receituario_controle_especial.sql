-- =============================================================
-- 56_receituario_controle_especial.sql
-- Receituario de Controle Especial (Portaria SVS/MS 344/98, Anexo X)
-- Documento em 2 vias (1a Farmacia / 2a Paciente) para medicamentos
-- da lista C1 e afins. O prescritor preenche emitente + paciente +
-- prescricao (texto livre); comprador/fornecedor ficam em branco pra
-- preenchimento manual na farmacia.
-- Rodar no database do cliente.
-- Pre-requisito: 04_schema_clinica.sql ja aplicado (tab_agendamento)
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE TABLE IF NOT EXISTS tab_receituario_especial (
  id               SERIAL        PRIMARY KEY,
  empresa_id       INT           NOT NULL REFERENCES tab_empresa(id),
  agendamento_id   INT           NOT NULL REFERENCES tab_agendamento(id),
  paciente_id      INT           NOT NULL REFERENCES tab_pessoa(id),
  profissional_id  INT           NOT NULL REFERENCES tab_pessoa(id),
  prescricao       TEXT          NOT NULL, -- corpo da prescricao (texto livre, fonte da verdade pra reimpressao)
  paciente_endereco VARCHAR(300),          -- congelado no momento da emissao (endereco do cadastro pode mudar depois)
  created_by       VARCHAR(100),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receituario_esp_agendamento ON tab_receituario_especial(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_receituario_esp_paciente    ON tab_receituario_especial(paciente_id);
CREATE INDEX IF NOT EXISTS idx_receituario_esp_empresa      ON tab_receituario_especial(empresa_id);

COMMENT ON TABLE tab_receituario_especial IS 'Receituario de Controle Especial (Portaria 344/98) emitido numa consulta - 2 vias';
COMMENT ON COLUMN tab_receituario_especial.prescricao IS 'Texto livre da prescricao - fonte da verdade pra reimpressao';
COMMENT ON COLUMN tab_receituario_especial.paciente_endereco IS 'Endereco do paciente congelado na emissao';

-- GRANT obrigatorio em tabela nova (ver padroes.md secao 8 - role de app != owner da migration)
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_receituario_especial TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_receituario_especial_id_seq TO %I', app_role);
EXCEPTION WHEN others THEN NULL;
END;
$$;
