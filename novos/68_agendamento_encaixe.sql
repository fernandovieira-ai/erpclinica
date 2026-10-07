-- =============================================================
-- 68_agendamento_encaixe.sql
-- Encaixe: permite criar/editar um agendamento furando a checagem de
-- conflito de horario (vaga ja ocupada por outro paciente) e a de
-- disponibilidade do profissional (grade/pausa/bloqueio), quando o
-- profissional autoriza explicitamente o encaixe. E sempre uma acao
-- explicita do usuario (nao e o caminho padrao de criacao) e fica
-- marcada/auditavel no proprio registro.
-- =============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_agendamento
  ADD COLUMN IF NOT EXISTS eh_encaixe BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encaixe_motivo VARCHAR(255);

COMMENT ON COLUMN tab_agendamento.eh_encaixe IS 'True quando o agendamento foi criado furando a checagem de conflito/disponibilidade (encaixe autorizado pelo profissional)';
COMMENT ON COLUMN tab_agendamento.encaixe_motivo IS 'Motivo informado ao confirmar o encaixe (obrigatorio quando eh_encaixe=true)';
