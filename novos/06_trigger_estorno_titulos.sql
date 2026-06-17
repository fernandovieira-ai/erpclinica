-- =============================================================
-- MIGRACAO: Triggers de estorno de liquidacao
-- Titulo a Pagar  (L→A ou qualquer→C) e
-- Titulo a Receber (L→A ou qualquer→C)
-- Executar em bancos existentes que ja rodaram o 02_schema_financeiro.sql
-- =============================================================

-- -------------------------------------------------------------
-- 1. ESTORNO TITULO A PAGAR
-- -------------------------------------------------------------

DROP TRIGGER  IF EXISTS trg_titulo_pagar_estorno   ON tab_titulo_pagar;
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
  -- Dispara em: qualquer→C (cancelamento) ou L→A (estorno de liquidação)
  IF NOT (
    (NEW.status = 'C' AND OLD.status <> 'C') OR
    (NEW.status = 'A' AND OLD.status = 'L')
  ) THEN
    RETURN NEW;
  END IF;

  -- Busca IDs dos movimentos pelo OLD; fallback por titulo_pagar_id
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

  -- Verifica conciliação
  IF v_mov_banco_id IS NOT NULL THEN
    SELECT conciliado INTO v_banco_conciliado FROM tab_movimento_banco WHERE id = v_mov_banco_id;
    v_del_banco := NOT COALESCE(v_banco_conciliado, false);
  END IF;

  IF v_mov_caixa_id IS NOT NULL THEN
    SELECT conciliado INTO v_caixa_conciliado FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
    v_del_caixa := NOT COALESCE(v_caixa_conciliado, false);
  END IF;

  -- Limpa FKs antes dos DELETEs para liberar constraints
  UPDATE tab_titulo_pagar SET
    movimento_banco_id = CASE WHEN v_del_banco THEN NULL ELSE movimento_banco_id END,
    movimento_caixa_id = CASE WHEN v_del_caixa THEN NULL ELSE movimento_caixa_id END,
    destino_liquidacao = CASE WHEN v_del_banco OR v_del_caixa THEN NULL ELSE destino_liquidacao END,
    conta_banco_liq_id = CASE WHEN v_del_banco THEN NULL ELSE conta_banco_liq_id END,
    data_liquidacao    = CASE WHEN v_del_banco OR v_del_caixa THEN NULL ELSE data_liquidacao END,
    valor_liquidado    = CASE WHEN v_del_banco OR v_del_caixa THEN 0   ELSE valor_liquidado END
  WHERE id = OLD.id;

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

-- -------------------------------------------------------------
-- 2. COLUNAS FALTANTES EM tab_titulo_receber
--    (se ja existem, os ADD COLUMN IF NOT EXISTS sao no-op)
-- -------------------------------------------------------------

ALTER TABLE tab_titulo_receber
  ADD COLUMN IF NOT EXISTS destino_liquidacao  CHAR(1)  CHECK (destino_liquidacao IN ('C','B')),
  ADD COLUMN IF NOT EXISTS conta_banco_liq_id  INT      REFERENCES tab_conta_banco(id),
  ADD COLUMN IF NOT EXISTS movimento_caixa_id  INT,
  ADD COLUMN IF NOT EXISTS movimento_banco_id  INT;

-- FKs tardias (ignorar se ja existem)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_tr_mov_banco' AND table_name = 'tab_titulo_receber'
  ) THEN
    ALTER TABLE tab_titulo_receber
      ADD CONSTRAINT fk_tr_mov_banco  FOREIGN KEY (movimento_banco_id)  REFERENCES tab_movimento_banco(id),
      ADD CONSTRAINT fk_tr_mov_caixa  FOREIGN KEY (movimento_caixa_id)  REFERENCES tab_movimento_caixa(id);
  END IF;
END $$;

-- -------------------------------------------------------------
-- 3. TRIGGER DE LIQUIDACAO TITULO A RECEBER
--    (substitui versao basica se ja existia)
-- -------------------------------------------------------------

DROP TRIGGER  IF EXISTS trg_titulo_receber_liquidacao ON tab_titulo_receber;
DROP FUNCTION IF EXISTS fn_trigger_liquidar_titulo_receber();

CREATE OR REPLACE FUNCTION fn_trigger_liquidar_titulo_receber()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_banco_id  INT;
  v_mov_caixa_id  INT;
  v_conta_id      INT;
  v_destino       CHAR(1);
BEGIN
  -- Só age na transição A → L
  IF NOT (OLD.status = 'A' AND NEW.status = 'L') THEN
    RETURN NEW;
  END IF;

  IF NEW.data_liquidacao IS NULL THEN
    RAISE EXCEPTION 'data_liquidacao obrigatória ao liquidar título a receber';
  END IF;
  IF COALESCE(NEW.valor_liquidado, 0) <= 0 THEN
    RAISE EXCEPTION 'valor_liquidado deve ser maior que zero';
  END IF;

  -- Determina destino:
  --   1. destino_liquidacao (explícito)
  --   2. conta_banco_liq_id preenchida → B
  --   3. conta_banco_id preenchida     → B  (compatibilidade)
  --   4. fallback                      → C
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
      RAISE EXCEPTION 'Informe conta_banco_liq_id para liquidar título a receber via banco';
    END IF;

    INSERT INTO tab_movimento_banco (
      empresa_id, conta_banco_id, titulo_receber_id, pessoa_id,
      tipo, valor, data_movimento, documento, observacao, created_by
    ) VALUES (
      NEW.empresa_id, v_conta_id, NEW.id, NEW.pessoa_id,
      'E', NEW.valor_liquidado,
      NEW.data_liquidacao,
      COALESCE(NEW.num_documento, NEW.numero_titulo),
      NEW.observacao, NEW.created_by
    ) RETURNING id INTO v_mov_banco_id;

    UPDATE tab_titulo_receber SET
      movimento_banco_id = v_mov_banco_id,
      destino_liquidacao = 'B',
      conta_banco_liq_id = v_conta_id
    WHERE id = NEW.id;

  ELSE  -- C = Caixa
    INSERT INTO tab_movimento_caixa (
      empresa_id, titulo_receber_id, pessoa_id,
      tipo, valor, data_movimento, documento, observacao, created_by
    ) VALUES (
      NEW.empresa_id, NEW.id, NEW.pessoa_id,
      'E', NEW.valor_liquidado,
      NEW.data_liquidacao,
      COALESCE(NEW.num_documento, NEW.numero_titulo),
      NEW.observacao, NEW.created_by
    ) RETURNING id INTO v_mov_caixa_id;

    UPDATE tab_titulo_receber SET
      movimento_caixa_id = v_mov_caixa_id,
      destino_liquidacao = 'C'
    WHERE id = NEW.id;
  END IF;

  -- Fecha parcelas em aberto
  UPDATE tab_titulo_receber_parcela
  SET status = 'L'
  WHERE titulo_id = NEW.id AND status = 'A';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_titulo_receber_liquidacao
  AFTER UPDATE OF status ON tab_titulo_receber
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_liquidar_titulo_receber();

-- -------------------------------------------------------------
-- 4. ESTORNO TITULO A RECEBER
-- -------------------------------------------------------------

DROP TRIGGER  IF EXISTS trg_titulo_receber_estorno   ON tab_titulo_receber;
DROP FUNCTION IF EXISTS fn_trigger_estorno_titulo_receber();

CREATE OR REPLACE FUNCTION fn_trigger_estorno_titulo_receber()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_banco_id     INT;
  v_mov_caixa_id     INT;
  v_banco_conciliado BOOLEAN;
  v_caixa_conciliado BOOLEAN;
  v_del_banco        BOOLEAN := false;
  v_del_caixa        BOOLEAN := false;
BEGIN
  -- Dispara em: qualquer→C (cancelamento) ou L→A (estorno de recebimento)
  IF NOT (
    (NEW.status = 'C' AND OLD.status <> 'C') OR
    (NEW.status = 'A' AND OLD.status = 'L')
  ) THEN
    RETURN NEW;
  END IF;

  -- Busca IDs dos movimentos pelo OLD; fallback por titulo_receber_id
  v_mov_banco_id := OLD.movimento_banco_id;
  IF v_mov_banco_id IS NULL THEN
    SELECT id INTO v_mov_banco_id FROM tab_movimento_banco
    WHERE titulo_receber_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;

  v_mov_caixa_id := OLD.movimento_caixa_id;
  IF v_mov_caixa_id IS NULL THEN
    SELECT id INTO v_mov_caixa_id FROM tab_movimento_caixa
    WHERE titulo_receber_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;

  -- Verifica conciliação
  IF v_mov_banco_id IS NOT NULL THEN
    SELECT conciliado INTO v_banco_conciliado FROM tab_movimento_banco WHERE id = v_mov_banco_id;
    v_del_banco := NOT COALESCE(v_banco_conciliado, false);
  END IF;

  IF v_mov_caixa_id IS NOT NULL THEN
    SELECT conciliado INTO v_caixa_conciliado FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
    v_del_caixa := NOT COALESCE(v_caixa_conciliado, false);
  END IF;

  -- Limpa FKs antes dos DELETEs para liberar constraints
  UPDATE tab_titulo_receber SET
    movimento_banco_id = CASE WHEN v_del_banco THEN NULL ELSE movimento_banco_id END,
    movimento_caixa_id = CASE WHEN v_del_caixa THEN NULL ELSE movimento_caixa_id END,
    destino_liquidacao = CASE WHEN v_del_banco OR v_del_caixa THEN NULL ELSE destino_liquidacao END,
    conta_banco_liq_id = CASE WHEN v_del_banco THEN NULL ELSE conta_banco_liq_id END,
    data_liquidacao    = CASE WHEN v_del_banco OR v_del_caixa THEN NULL ELSE data_liquidacao END,
    valor_liquidado    = CASE WHEN v_del_banco OR v_del_caixa THEN 0   ELSE valor_liquidado END
  WHERE id = OLD.id;

  IF v_del_banco THEN
    DELETE FROM tab_movimento_banco WHERE id = v_mov_banco_id;
  END IF;

  IF v_del_caixa THEN
    DELETE FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
  END IF;

  -- Reabre parcelas se vinha de liquidado
  IF OLD.status = 'L' THEN
    UPDATE tab_titulo_receber_parcela SET status = 'A'
    WHERE titulo_id = OLD.id AND status = 'L';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_titulo_receber_estorno
  AFTER UPDATE OF status ON tab_titulo_receber
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_estorno_titulo_receber();
