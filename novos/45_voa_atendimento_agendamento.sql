SET client_encoding = 'LATIN1';

ALTER TABLE tab_agendamento
  ADD COLUMN IF NOT EXISTS voa_atendimento_id   VARCHAR(36),
  ADD COLUMN IF NOT EXISTS voa_atendimento_tipo VARCHAR(20)
    CHECK (voa_atendimento_tipo IN ('IN_PERSON', 'TELEMEDICINE'));

COMMENT ON COLUMN tab_agendamento.voa_atendimento_id   IS 'UUID do atendimento retornado pela Voa (evento voa.plugin.ehr.created) — rastreabilidade entre o agendamento local e a consulta na Voa';
COMMENT ON COLUMN tab_agendamento.voa_atendimento_tipo IS 'Tipo de consulta na Voa: IN_PERSON ou TELEMEDICINE';
