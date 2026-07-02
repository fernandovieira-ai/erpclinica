-- Rastreamento de horários para análise de tempo de espera e atendimento
ALTER TABLE tab_agendamento
  ADD COLUMN IF NOT EXISTS horario_chegada            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS horario_inicio_atendimento TIMESTAMPTZ;
