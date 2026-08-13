-- =============================================================
-- 53_medico_solicitante_exame.sql
-- Suporte a exames onde o medico executor nao e conhecido no
-- momento do agendamento (so o solicitante). Fluxo:
--   1. Agendamento de exame e marcado com profissional_id = cadastro
--      placeholder da clinica (tab_pessoa.eh_clinica = true).
--   2. No recebimento, quando profissional_id do agendamento aponta
--      pra esse placeholder, e obrigatorio informar o medico
--      solicitante e o medico executor; o executor substitui
--      profissional_id no agendamento nesse momento.
-- Rodar no database do cliente
-- =============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_pessoa
  ADD COLUMN IF NOT EXISTS eh_clinica BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tab_pessoa.eh_clinica IS 'Marca o cadastro placeholder que representa a propria clinica/empresa; usado como profissional_id em agendamentos de exame quando o medico executor ainda nao e conhecido no momento de marcar';

ALTER TABLE tab_agendamento
  ADD COLUMN IF NOT EXISTS medico_solicitante_id INT REFERENCES tab_pessoa(id);

COMMENT ON COLUMN tab_agendamento.medico_solicitante_id IS 'Medico que solicitou o exame; preenchido no recebimento quando o profissional_id do agendamento e o placeholder da clinica (tab_pessoa.eh_clinica)';
