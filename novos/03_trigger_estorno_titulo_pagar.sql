-- =============================================================
-- MIGRACAO: Trigger de estorno de titulo a pagar
-- =============================================================

DROP TRIGGER IF EXISTS trg_titulo_pagar_estorno ON tab_titulo_pagar;
DROP FUNCTION IF EXISTS fn_trigger_estorno_titulo_pagar();

CREATE OR REPLACE FUNCTION fn_trigger_estorno_titulo_pagar()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_banco_id     INT;
  v_mov_caixa_id     INT;
  v_banco_conciliado BOOLEAN;
  v_caixa_conciliado BOOLEAN;
  v_del_banco        BOOLEAN := false;
  v_del_caixa        BOOLEAN := false;
BEGIN
  -- Dispara em:
  --   qualquer -> C  (cancelamento)
  --   L -> A         (estorno de liquidacao, volta para aberto)
  IF NOT (
    (NEW.status = 'C' AND OLD.status <> 'C') OR
    (NEW.status = 'A' AND OLD.status = 'L')
  ) THEN
    RETURN NEW;
  END IF;

  -- Pega IDs pelo OLD; fallback busca pelo titulo_pagar_id no movimento
  v_mov_banco_id := OLD.movimento_banco_id;
  IF v_mov_banco_id IS NULL THEN
    SELECT id INTO v_mov_banco_id FROM tab_movimento_banco
    WHERE titulo_pagar_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;

  v_mov_caixa_id := OLD.movimento_caixa_id;
  IF v_mov_caixa_id IS NULL THEN
    SELECT id INTO v_mov_caixa_id FROM tab_movimento_caixa
    WHERE titulo_pagar_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;

  -- Verifica conciliado de cada movimento
  IF v_mov_banco_id IS NOT NULL THEN
    SELECT conciliado INTO v_banco_conciliado FROM tab_movimento_banco WHERE id = v_mov_banco_id;
    v_del_banco := NOT COALESCE(v_banco_conciliado, false);
  END IF;

  IF v_mov_caixa_id IS NOT NULL THEN
    SELECT conciliado INTO v_caixa_conciliado FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
    v_del_caixa := NOT COALESCE(v_caixa_conciliado, false);
  END IF;

  -- Um unico UPDATE limpa as FKs dos movimentos que serao deletados
  -- Deve vir ANTES dos DELETEs para liberar as constraints
  UPDATE tab_titulo_pagar SET
    movimento_banco_id = CASE WHEN v_del_banco THEN NULL ELSE movimento_banco_id END,
    movimento_caixa_id = CASE WHEN v_del_caixa THEN NULL ELSE movimento_caixa_id END,
    destino_liquidacao = CASE WHEN v_del_banco OR v_del_caixa THEN NULL ELSE destino_liquidacao END,
    conta_banco_liq_id = CASE WHEN v_del_banco THEN NULL ELSE conta_banco_liq_id END,
    data_liquidacao    = CASE WHEN v_del_banco OR v_del_caixa THEN NULL ELSE data_liquidacao END,
    valor_liquidado    = CASE WHEN v_del_banco OR v_del_caixa THEN 0   ELSE valor_liquidado END
  WHERE id = OLD.id;

  -- Deleta os movimentos apos liberar as FKs
  IF v_del_banco THEN
    DELETE FROM tab_movimento_banco WHERE id = v_mov_banco_id;
  END IF;

  IF v_del_caixa THEN
    DELETE FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
  END IF;

  -- Reabre parcelas se vinha de liquidado
  IF OLD.status = 'L' THEN
    UPDATE tab_titulo_pagar_parcela SET status = 'A'
    WHERE titulo_id = OLD.id AND status = 'L';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_titulo_pagar_estorno
  AFTER UPDATE OF status ON tab_titulo_pagar
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_estorno_titulo_pagar();
