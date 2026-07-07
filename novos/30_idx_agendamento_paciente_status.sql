-- =============================================================
-- 30_idx_agendamento_paciente_status.sql
-- Indice composto para a aba de historico clinico do paciente
-- (GET /api/clinica/agendamentos?paciente_id=X&status=ATENDIDO)
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE INDEX IF NOT EXISTS idx_ag_paciente_status ON tab_agendamento(paciente_id, status);
