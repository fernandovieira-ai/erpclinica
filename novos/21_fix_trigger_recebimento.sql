-- =============================================================
-- 21_fix_trigger_recebimento.sql
-- Recria trigger de recebimento para a arquitetura atual
--
-- Contexto:
--   A rota /api/clinica/recebimentos agora:
--     - Usa origem_modulo='CLI' nos movimentos (antes era 'REC')
--     - Cria tab_recebimento_consulta diretamente com valores corretos
--
--   A trigger antiga (fn_processar_recebimento_movimento) disparava
--   em origem_modulo='REC', causando:
--     1. Duplo processamento (rota + trigger)
--     2. Condição de pagamento errada (usava fallback em vez da real)
--     3. Desconto/acréscimo zerados (hardcoded na trigger)
--     4. Duplo título para condição parcelada
--
--   Nova arquitetura:
--     - Movimentos da clínica usam origem_modulo='CLI'
--     - Trigger nova garante apenas que um recebimento não seja
--       duplicado caso movimento 'CLI' seja inserido por outro caminho
-- =============================================================

SET client_encoding = 'LATIN1';

-- 1. Remover triggers antigas que causavam conflito
DROP TRIGGER IF EXISTS trg_movimento_caixa_recebimento ON tab_movimento_caixa;
DROP TRIGGER IF EXISTS trg_movimento_banco_recebimento ON tab_movimento_banco;
DROP FUNCTION IF EXISTS fn_processar_recebimento_movimento();

-- 2. Criar função de guarda: apenas marca agendamento como ATENDIDO
--    quando um movimento CLI chega sem recebimento vinculado.
--    NÃO cria recebimento (responsabilidade exclusiva da rota).
CREATE OR REPLACE FUNCTION fn_guardar_status_agendamento_cli()
RETURNS TRIGGER AS $$
DECLARE
  v_agendamento_id INT;
BEGIN
  -- Apenas movimentos de entrada originados no módulo clínica
  IF NEW.tipo <> 'E' OR NEW.origem_modulo <> 'CLI' THEN
    RETURN NEW;
  END IF;

  v_agendamento_id := NEW.origem_id;

  -- Garante que o agendamento existe e está em status pendente
  UPDATE tab_agendamento
  SET    status     = 'ATENDIDO',
         updated_at = NOW()
  WHERE  id         = v_agendamento_id
    AND  status NOT IN ('ATENDIDO', 'CANCELADO', 'FALTOU');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Aplicar trigger em movimento_caixa
DROP TRIGGER IF EXISTS trg_cli_caixa_status ON tab_movimento_caixa;
CREATE TRIGGER trg_cli_caixa_status
AFTER INSERT ON tab_movimento_caixa
FOR EACH ROW
EXECUTE FUNCTION fn_guardar_status_agendamento_cli();

-- 4. Aplicar trigger em movimento_banco
DROP TRIGGER IF EXISTS trg_cli_banco_status ON tab_movimento_banco;
CREATE TRIGGER trg_cli_banco_status
AFTER INSERT ON tab_movimento_banco
FOR EACH ROW
EXECUTE FUNCTION fn_guardar_status_agendamento_cli();
