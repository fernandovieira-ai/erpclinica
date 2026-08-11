SET client_encoding = 'LATIN1';

-- % do valor do atendimento que fica com o profissional executante.
-- A clínica fica com o restante (100 - esse valor) — calculado, não guardado
-- em coluna separada, pra não correr risco dos dois nunca somarem 100.
ALTER TABLE tab_agendamento_tipo
  ADD COLUMN IF NOT EXISTS percentual_profissional NUMERIC(5,2) NOT NULL DEFAULT 100
    CHECK (percentual_profissional BETWEEN 0 AND 100);

COMMENT ON COLUMN tab_agendamento_tipo.percentual_profissional IS '% do valor do atendimento que fica com o profissional executante; a clínica fica com o restante (100 - esse valor)';

-- Regra combinada com o cliente (Hiiltcor): consulta = 100% pro médico;
-- exames = 35% pro médico / 65% pra clínica.
UPDATE tab_agendamento_tipo SET percentual_profissional = 100 WHERE UPPER(descricao) = 'CONSULTA CARDIOLOGICA';
UPDATE tab_agendamento_tipo SET percentual_profissional = 35  WHERE UPPER(descricao) <> 'CONSULTA CARDIOLOGICA';
