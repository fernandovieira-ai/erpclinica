-- =============================================================
-- 17_remove_unique_recebimento.sql
-- Remove constraint UNIQUE de (agendamento_id, data_recebimento)
-- Permite múltiplos recebimentos do mesmo agendamento na mesma data
-- =============================================================

SET client_encoding = 'LATIN1';

-- Remover constraint UNIQUE se existir
DO $$
DECLARE
  v_constraint_name VARCHAR;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tab_recebimento_consulta') THEN
    -- Procurar pela constraint
    SELECT constraint_name INTO v_constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'tab_recebimento_consulta'
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%agendamento_id%data_recebimento%';

    -- Se encontrou, dropar
    IF v_constraint_name IS NOT NULL THEN
      EXECUTE 'ALTER TABLE tab_recebimento_consulta DROP CONSTRAINT ' || v_constraint_name;
      RAISE NOTICE 'Constraint % removida', v_constraint_name;
    ELSE
      RAISE NOTICE 'Constraint não encontrada (pode já ter sido removida)';
    END IF;
  END IF;
END
$$;
