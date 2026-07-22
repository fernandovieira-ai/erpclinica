SET client_encoding = 'LATIN1';

ALTER TABLE tab_agendamento_tipo
  ADD COLUMN IF NOT EXISTS voa_clinical_type VARCHAR(50);

COMMENT ON COLUMN tab_agendamento_tipo.voa_clinical_type IS 'ID do modelo de anamnese da Voa (ex: anamnesisCardiology) usado quando esse tipo de atendimento abre a Voa. NULL = usa o padrão da clínica (anamnesisCardiology)';

-- Preserva o comportamento atual (hardcoded no front antes desta migração):
-- RETORNO usava o modelo de consulta de retorno da Voa; os demais caiam em cardiologia.
UPDATE tab_agendamento_tipo SET voa_clinical_type = 'anamnesisReturningConsultation' WHERE UPPER(descricao) = 'RETORNO' AND voa_clinical_type IS NULL;
UPDATE tab_agendamento_tipo SET voa_clinical_type = 'anamnesisCardiology' WHERE UPPER(descricao) <> 'RETORNO' AND voa_clinical_type IS NULL;
