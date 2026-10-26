SET client_encoding = 'LATIN1';

-- Flag independente de ind_profissional: marca uma pessoa (geralmente um médico que não
-- atende na clínica) como elegível pro campo "Médico Solicitante" do recebimento, sem
-- liberar Agenda/Atendimentos/Especialidades (que ficam restritos a ind_profissional).
ALTER TABLE tab_pessoa ADD COLUMN IF NOT EXISTS ind_solicitante BOOLEAN NOT NULL DEFAULT false;
