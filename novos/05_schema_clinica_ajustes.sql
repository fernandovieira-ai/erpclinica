-- Ajustes na tabela de agendamentos: valor
ALTER TABLE tab_agendamento
  ADD COLUMN IF NOT EXISTS valor NUMERIC(10,2) NOT NULL DEFAULT 0;
