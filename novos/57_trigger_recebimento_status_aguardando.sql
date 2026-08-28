-- =============================================================
-- 57_trigger_recebimento_status_aguardando.sql
-- Ajusta a trigger de recebimento da clinica: o pagamento e feito
-- ANTES do atendimento (recepcao), entao o recebimento faz o
-- CHECK-IN do paciente, nao marca a consulta como realizada.
--
--   AGENDADO / CONFIRMADO  -> AGUARDANDO  (entra na sala de espera)
--   AGUARDANDO             -> sem mudanca
--   ATENDIDO               -> sem mudanca (pagamento na saida)
--   CANCELADO / FALTOU     -> sem mudanca
--
-- Quem marca ATENDIDO e o "Finalizar atendimento" (medico), via
-- PATCH /api/clinica/agendamentos/[id].
--
-- Substitui o comportamento de 21_fix_trigger_recebimento.sql, que
-- forcava ATENDIDO no INSERT de movimento_caixa/movimento_banco 'CLI'.
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE OR REPLACE FUNCTION fn_guardar_status_agendamento_cli()
RETURNS TRIGGER AS $$
DECLARE
  v_agendamento_id INT;
BEGIN
  -- Apenas movimentos de entrada originados no modulo clinica
  IF NEW.tipo <> 'E' OR NEW.origem_modulo <> 'CLI' THEN
    RETURN NEW;
  END IF;

  v_agendamento_id := NEW.origem_id;

  -- O recebimento faz o check-in: so avanca quem ainda nao chegou.
  UPDATE tab_agendamento
  SET    status          = 'AGUARDANDO',
         horario_chegada = COALESCE(horario_chegada, NOW()),
         updated_at      = NOW()
  WHERE  id     = v_agendamento_id
    AND  status IN ('AGENDADO', 'CONFIRMADO');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers trg_cli_caixa_status / trg_cli_banco_status ja apontam pra essa
-- funcao (criados em 21_fix_trigger_recebimento.sql) - nao precisa recriar.
