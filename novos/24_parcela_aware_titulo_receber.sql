SET client_encoding = 'LATIN1';

-- =============================================================
-- MIGRACAO: Titulos a receber parcelados - baixa/estorno por parcela
--
-- Problema: titulo parcelado (A Prazo) deve gerar UM movimento
--   (caixa ou banco) POR PARCELA paga, com destino escolhido pelo
--   usuario no momento da baixa - nao um unico movimento com o
--   valor total do titulo quando a ULTIMA parcela fecha o titulo.
--
-- As triggers fn_trigger_liquidar_titulo_receber e
-- fn_trigger_estorno_titulo_receber foram desenhadas para titulo
-- "de tiro unico" (1 movimento por titulo, guardado em
-- movimento_caixa_id/movimento_banco_id). Isso nao serve para
-- titulo com N parcelas = N movimentos.
--
-- Ajuste: as duas triggers viram NO-OP quando o titulo tem
-- parcelas (EXISTS em tab_titulo_receber_parcela). Para esses
-- titulos, a aplicacao (rota PATCH .../parcelas/[parcela_id])
-- passa a criar/excluir o movimento de cada parcela diretamente.
--
-- Para titulo SEM parcelas o comportamento das triggers fica
-- 100% igual ao anterior.
-- =============================================================

-- ------------------------------------------------------------
-- 1. Coluna de rastreio: a qual parcela pertence o movimento
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tab_movimento_caixa' AND column_name = 'parcela_receber_id'
  ) THEN
    ALTER TABLE tab_movimento_caixa
      ADD COLUMN parcela_receber_id INT REFERENCES tab_titulo_receber_parcela(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tab_movimento_banco' AND column_name = 'parcela_receber_id'
  ) THEN
    ALTER TABLE tab_movimento_banco
      ADD COLUMN parcela_receber_id INT REFERENCES tab_titulo_receber_parcela(id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_mc_parcela_receber ON tab_movimento_caixa(parcela_receber_id);
CREATE INDEX IF NOT EXISTS idx_mb_parcela_receber ON tab_movimento_banco(parcela_receber_id);

-- ------------------------------------------------------------
-- 2. fn_trigger_liquidar_titulo_receber - guarda para parcelado
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_trigger_liquidar_titulo_receber()
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

  -- Titulo parcelado: cada parcela gera seu proprio movimento via
  -- aplicacao (rota PATCH .../parcelas/[parcela_id]) - nao faz nada aqui.
  IF EXISTS (SELECT 1 FROM tab_titulo_receber_parcela WHERE titulo_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.data_liquidacao IS NULL THEN
    RAISE EXCEPTION 'data_liquidacao obrigatoria ao liquidar titulo a receber';
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
      RAISE EXCEPTION 'Informe conta_banco_liq_id para liquidar titulo a receber via banco';
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

  -- Fecha parcelas em aberto (nao deveria existir nenhuma aqui, ja que
  -- o bloco acima retorna cedo quando o titulo tem parcelas)
  UPDATE tab_titulo_receber_parcela
  SET status = 'L'
  WHERE titulo_id = NEW.id AND status = 'A';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 3. fn_trigger_estorno_titulo_receber - guarda para parcelado
-- ------------------------------------------------------------
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
  -- Dispara em: qualquer->C (cancelamento) ou L->A (estorno de recebimento)
  IF NOT (
    (NEW.status = 'C' AND OLD.status <> 'C') OR
    (NEW.status = 'A' AND OLD.status = 'L')
  ) THEN
    RETURN NEW;
  END IF;

  -- Titulo parcelado: estorno de movimento e reabertura de parcela sao
  -- feitos pela aplicacao (rota PATCH .../parcelas/[parcela_id]),
  -- parcela a parcela - nao faz nada aqui.
  IF EXISTS (SELECT 1 FROM tab_titulo_receber_parcela WHERE titulo_id = OLD.id) THEN
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
