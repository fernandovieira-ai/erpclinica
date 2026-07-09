-- =============================================================
-- 32_memed_receita.sql
-- Integracao Memed (prescricao digital) - CRM do profissional,
-- credenciais por empresa, vinculo de prescritor e historico de receitas
-- Rodar no database do cliente
-- Pre-requisito: 04_schema_clinica.sql e 28_prontuario.sql ja aplicados
-- =============================================================

SET client_encoding = 'LATIN1';

-- CRM do profissional (obrigatorio para prescricao digital)
ALTER TABLE tab_pessoa
  ADD COLUMN IF NOT EXISTS crm    VARCHAR(20),
  ADD COLUMN IF NOT EXISTS crm_uf VARCHAR(2);

COMMENT ON COLUMN tab_pessoa.crm    IS 'Numero do CRM (ou outro conselho) do profissional, exigido para emissao de receita digital';
COMMENT ON COLUMN tab_pessoa.crm_uf IS 'UF de emissao do CRM';

-- Credenciais Memed por empresa (mesmo padrao do Voa, migration 29)
ALTER TABLE tab_empresa
  ADD COLUMN IF NOT EXISTS memed_api_key    VARCHAR(120),
  ADD COLUMN IF NOT EXISTS memed_secret_key VARCHAR(120),
  ADD COLUMN IF NOT EXISTS memed_ambiente   VARCHAR(20) NOT NULL DEFAULT 'homologacao'
    CHECK (memed_ambiente IN ('homologacao', 'producao'));

COMMENT ON COLUMN tab_empresa.memed_api_key    IS 'api-key da integracao Memed Sinapse Prescricao, por empresa';
COMMENT ON COLUMN tab_empresa.memed_secret_key IS 'secret-key da integracao Memed - nunca exposta ao front-end';
COMMENT ON COLUMN tab_empresa.memed_ambiente   IS 'homologacao ou producao';

-- Vinculo profissional (tab_pessoa) <-> cadastro na Memed
CREATE TABLE IF NOT EXISTS tab_memed_prescritor (
  id                SERIAL       PRIMARY KEY,
  empresa_id        INT          NOT NULL REFERENCES tab_empresa(id),
  profissional_id   INT          NOT NULL REFERENCES tab_pessoa(id),
  external_id       VARCHAR(50)  NOT NULL,
  memed_usuario_id  VARCHAR(50),
  ultimo_status     VARCHAR(30),
  ambiente          VARCHAR(20)  NOT NULL DEFAULT 'homologacao',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- (empresa_id, profissional_id) e nao so profissional_id: um profissional pode atender
  -- em mais de uma empresa (banco) e cada uma tem seu proprio cadastro/token na Memed.
  UNIQUE (empresa_id, profissional_id)
);

CREATE INDEX IF NOT EXISTS idx_memed_prescritor_empresa ON tab_memed_prescritor(empresa_id);

DROP TRIGGER IF EXISTS trg_memed_prescritor_updated_at ON tab_memed_prescritor;
CREATE TRIGGER trg_memed_prescritor_updated_at
  BEFORE UPDATE ON tab_memed_prescritor
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE tab_memed_prescritor IS 'Vinculo entre o profissional (tab_pessoa) e o cadastro dele na Memed';

-- Historico de receitas emitidas (exibido na timeline do prontuario)
CREATE TABLE IF NOT EXISTS tab_receita_medica (
  id                    SERIAL       PRIMARY KEY,
  empresa_id            INT          NOT NULL REFERENCES tab_empresa(id),
  agendamento_id        INT          NOT NULL REFERENCES tab_agendamento(id) ON DELETE CASCADE,
  paciente_id           INT          NOT NULL REFERENCES tab_pessoa(id),
  profissional_id       INT          NOT NULL REFERENCES tab_pessoa(id),
  memed_prescricao_id   VARCHAR(50),
  url_receita           TEXT,
  medicamentos          TEXT,
  created_by            VARCHAR(100),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receita_medica_paciente    ON tab_receita_medica(paciente_id);
CREATE INDEX IF NOT EXISTS idx_receita_medica_agendamento ON tab_receita_medica(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_receita_medica_empresa     ON tab_receita_medica(empresa_id);

COMMENT ON TABLE tab_receita_medica IS 'Historico de receitas medicas emitidas via Memed, vinculadas ao atendimento';
COMMENT ON COLUMN tab_receita_medica.medicamentos IS 'Resumo textual dos medicamentos prescritos, enviado pelo evento prescricaoImpressa da Memed';

-- GRANT obrigatorio em tabela nova (ver padroes.md secao 8 - role de app != owner da migration)
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_memed_prescritor TO %I', app_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_receita_medica TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_memed_prescritor_id_seq TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_receita_medica_id_seq TO %I', app_role);
  END IF;
END $$;
