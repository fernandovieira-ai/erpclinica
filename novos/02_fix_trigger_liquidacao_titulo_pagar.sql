-- =============================================================
-- MIGRACAO: Corrige fn_trigger_liquidar_titulo_pagar
--
-- Problema: trigger usava conta_banco_id (conta do titulo) para
-- decidir banco vs caixa. Apos a migracao 00_acerto_titulo_pagar_
-- liquidacao.sql os campos corretos sao destino_liquidacao e
-- conta_banco_liq_id. Alem disso o trigger nao gravava
-- movimento_banco_id / movimento_caixa_id de volta no titulo.
--
-- Executar no banco do cliente: fin_{slug}
-- Depende de: 00_acerto_titulo_pagar_liquidacao.sql ja executado
-- =============================================================

CREATE OR REPLACE FUNCTION fn_trigger_liquidar_titulo_pagar()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_banco_id  INT;
  v_mov_caixa_id  INT;
  v_conta_id      INT;
  v_destino       CHAR(1);
BEGIN
  -- So age na transicao A -> L
  IF NOT (OLD.status = 'A' AND NEW.status = 'L') THEN
    RETURN NEW;
  END IF;

  IF NEW.data_liquidacao IS NULL THEN
    RAISE EXCEPTION 'data_liquidacao obrigatoria ao liquidar titulo a pagar';
  END IF;
  IF COALESCE(NEW.valor_liquidado, 0) <= 0 THEN
    RAISE EXCEPTION 'valor_liquidado deve ser maior que zero';
  END IF;

  -- Determina destino:
  --   1. destino_liquidacao (explicito)
  --   2. conta_banco_liq_id preenchida -> B
  --   3. conta_banco_id preenchida     -> B  (compatibilidade)
  --   4. fallback                      -> C
  v_destino := COALESCE(
    NEW.destino_liquidacao,
    CASE
      WHEN NEW.conta_banco_liq_id IS NOT NULL THEN 'B'
      WHEN NEW.conta_banco_id     IS NOT NULL THEN 'B'
      ELSE 'C'
    END
  );

  IF v_destino = 'B' THEN
    v_conta_id := COALESCE(NEW.conta_banco_liq_id, NEW.conta_banco_id);
    IF v_conta_id IS NULL THEN
      RAISE EXCEPTION 'Informe conta_banco_liq_id para liquidar titulo a pagar via banco';
    END IF;

    INSERT INTO tab_movimento_banco (
      empresa_id, conta_banco_id, titulo_pagar_id, pessoa_id,
      tipo, valor, data_movimento, documento, observacao, created_by
    ) VALUES (
      NEW.empresa_id, v_conta_id, NEW.id, NEW.pessoa_id,
      'S', NEW.valor_liquidado,
      NEW.data_liquidacao,
      COALESCE(NEW.num_documento, NEW.numero_titulo),
      NEW.observacao, NEW.created_by
    ) RETURNING id INTO v_mov_banco_id;

    UPDATE tab_titulo_pagar SET
      movimento_banco_id = v_mov_banco_id,
      destino_liquidacao = 'B',
      conta_banco_liq_id = v_conta_id
    WHERE id = NEW.id;

  ELSE  -- C = Caixa
    INSERT INTO tab_movimento_caixa (
      empresa_id, titulo_pagar_id, pessoa_id,
      tipo, valor, data_movimento, documento, observacao, created_by
    ) VALUES (
      NEW.empresa_id, NEW.id, NEW.pessoa_id,
      'S', NEW.valor_liquidado,
      NEW.data_liquidacao,
      COALESCE(NEW.num_documento, NEW.numero_titulo),
      NEW.observacao, NEW.created_by
    ) RETURNING id INTO v_mov_caixa_id;

    UPDATE tab_titulo_pagar SET
      movimento_caixa_id = v_mov_caixa_id,
      destino_liquidacao = 'C'
    WHERE id = NEW.id;
  END IF;

  -- Fecha parcelas em aberto
  UPDATE tab_titulo_pagar_parcela
  SET status = 'L'
  WHERE titulo_id = NEW.id AND status = 'A';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- FKs pendentes dos campos de movimento
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tp_mov_caixa'
  ) THEN
    ALTER TABLE tab_titulo_pagar
      ADD CONSTRAINT fk_tp_mov_caixa FOREIGN KEY (movimento_caixa_id) REFERENCES tab_movimento_caixa(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tp_mov_banco'
  ) THEN
    ALTER TABLE tab_titulo_pagar
      ADD CONSTRAINT fk_tp_mov_banco FOREIGN KEY (movimento_banco_id) REFERENCES tab_movimento_banco(id);
  END IF;
END;
$$;
