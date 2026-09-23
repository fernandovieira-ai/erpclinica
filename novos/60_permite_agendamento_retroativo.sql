-- =============================================================
-- 60_permite_agendamento_retroativo.sql
-- Parametro por empresa: permite lancar NOVO agendamento com data/hora no passado
-- (recepcao lancando com atraso, sem precisar mudar a data do computador)
-- =============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_empresa
  ADD COLUMN IF NOT EXISTS permite_agendamento_retroativo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tab_empresa.permite_agendamento_retroativo IS 'Se true, a tela de agendamento permite criar um novo agendamento com data/hora no passado';
