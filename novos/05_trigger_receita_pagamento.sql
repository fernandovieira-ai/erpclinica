-- =============================================================
-- MIGRACAO: Ajuste do trigger de receita + trigger de estorno
--
-- Problema: fn_trigger_receita so gerava movimento quando
--   ind_avista = true. O formulario usa destino='B'/'C' para
--   indicar recebimento via banco/caixa sem setar ind_avista.
--
-- Ajuste: gerar movimento quando destino IS NOT NULL
--   (independente de ind_avista), mantendo compatibilidade
--   com registros que usam ind_avista=true sem destino.
--
-- Novo: trg_receita_estorno - exclui movimento ao cancelar.
--
-- Novo: fn_trigger_liquidar_titulo_receber atualizado para
--   suportar destino_liquidacao + conta_banco_liq_id e gravar
--   movimento_banco_id / movimento_caixa_id de volta no titulo.
-- =============================================================

-- ------------------------------------------------------------
-- 1. Campos de liquidacao em tab_titulo_receber (se ausentes)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tab_titulo_receber' AND column_name = 'destino_liquidacao'
  ) THEN
    ALTER TABLE tab_titulo_receber
      ADD COLUMN destino_liquidacao CHAR(1) CHECK (destino_liquidacao IN ('C','B'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tab_titulo_receber' AND column_name = 'conta_banco_liq_id'
  ) THEN
    ALTER TABLE tab_titulo_receber
      ADD COLUMN conta_banco_liq_id INT REFERENCES tab_conta_banco(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tab_titulo_receber' AND column_name = 'movimento_caixa_id'
  ) THEN
    ALTER TABLE tab_titulo_receber
      ADD COLUMN movimento_caixa_id INT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tab_titulo_receber' AND column_name = 'movimento_banco_id'
  ) THEN
    ALTER TABLE tab_titulo_receber
      ADD COLUMN movimento_banco_id INT;
  END IF;
END;
$$;

-- FKs tardias dos campos de movimento no titulo receber
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tr_mov_caixa'
  ) THEN
    ALTER TABLE tab_titulo_receber
      ADD CONSTRAINT fk_tr_mov_caixa FOREIGN KEY (movimento_caixa_id) REFERENCES tab_movimento_caixa(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tr_mov_banco'
  ) THEN
    ALTER TABLE tab_titulo_receber
      ADD CONSTRAINT fk_tr_mov_banco FOREIGN KEY (movimento_banco_id) REFERENCES tab_movimento_banco(id);
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 2. Atualiza fn_trigger_receita
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_trigger_receita()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_caixa_id  INT;
  v_mov_banco_id  INT;
  v_titulo_id     INT;
  v_data_venc     DATE;
  v_valor_parcela NUMERIC(15,2);
  v_i             INT;
BEGIN
  -- So processa quando status chega em 'A'
  IF NEW.status <> 'A' THEN RETURN NEW; END IF;
  -- Evita reprocessar em updates que nao alteram status
  IF TG_OP = 'UPDATE' AND OLD.status = 'A' THEN RETURN NEW; END IF;

  -- RECEBIMENTO DIRETO: destino informado OU ind_avista = true
  IF NEW.destino IS NOT NULL OR NEW.ind_avista THEN

    IF NEW.destino IS NULL THEN
      RAISE EXCEPTION 'Receita a vista requer destino: C=Caixa ou B=Banco';
    END IF;
    IF NEW.destino = 'B' AND NEW.conta_banco_id IS NULL THEN
      RAISE EXCEPTION 'Recebimento em banco requer conta_banco_id';
    END IF;

    IF NEW.destino = 'C' THEN
      INSERT INTO tab_movimento_caixa (
        empresa_id, tipo_operacao_id, pessoa_id, receita_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.tipo_operacao_id, NEW.pessoa_id, NEW.id,
        'E', NEW.valor,
        COALESCE(NEW.data_recebimento, NEW.data_receita),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_caixa_id;

      UPDATE tab_receita SET
        movimento_caixa_id = v_mov_caixa_id,
        data_recebimento   = COALESCE(NEW.data_recebimento, NEW.data_receita)
      WHERE id = NEW.id;

    ELSE -- destino = 'B'
      INSERT INTO tab_movimento_banco (
        empresa_id, conta_banco_id, tipo_operacao_id, pessoa_id, receita_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.conta_banco_id, NEW.tipo_operacao_id,
        NEW.pessoa_id, NEW.id,
        'E', NEW.valor,
        COALESCE(NEW.data_recebimento, NEW.data_receita),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_banco_id;

      UPDATE tab_receita SET
        movimento_banco_id = v_mov_banco_id,
        data_recebimento   = COALESCE(NEW.data_recebimento, NEW.data_receita)
      WHERE id = NEW.id;
    END IF;

  -- A PRAZO: gera parcelas + titulos a receber
  ELSE
    v_valor_parcela := ROUND(NEW.valor / NEW.num_parcelas, 2);

    FOR v_i IN 1..NEW.num_parcelas LOOP
      v_data_venc := NEW.data_receita + (v_i * NEW.intervalo_dias);

      INSERT INTO tab_titulo_receber (
        empresa_id, pessoa_id, tipo_receita_id, cod_tipo_cobranca,
        centro_custo_id, conta_banco_id, receita_id,
        numero_titulo, num_documento, origem_modulo, origem_id,
        data_emissao, data_vencimento, data_competencia,
        valor_original, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.pessoa_id, NEW.tipo_receita_id,
        NEW.cod_tipo_cobranca, NEW.centro_custo_id,
        NEW.conta_banco_id, NEW.id,
        NEW.id || '/' || LPAD(v_i::TEXT, 2, '0'),
        NEW.documento, 'REC', NEW.id,
        NEW.data_receita, v_data_venc,
        COALESCE(NEW.data_competencia, NEW.data_receita),
        v_valor_parcela, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_titulo_id;

      INSERT INTO tab_receita_parcela (
        receita_id, numero_parcela, data_vencimento, valor, titulo_receber_id
      ) VALUES (
        NEW.id, v_i, v_data_venc, v_valor_parcela, v_titulo_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 3. Trigger de estorno/cancelamento de receita
-- ------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_receita_estorno ON tab_receita;
DROP FUNCTION IF EXISTS fn_trigger_estorno_receita();

CREATE OR REPLACE FUNCTION fn_trigger_estorno_receita()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_banco_id     INT;
  v_mov_caixa_id     INT;
  v_banco_conciliado BOOLEAN;
  v_caixa_conciliado BOOLEAN;
  v_del_banco        BOOLEAN := false;
  v_del_caixa        BOOLEAN := false;
BEGIN
  -- Dispara somente quando status vai para 'C' (cancelamento)
  IF NOT (NEW.status = 'C' AND OLD.status <> 'C') THEN
    RETURN NEW;
  END IF;

  v_mov_banco_id := OLD.movimento_banco_id;
  v_mov_caixa_id := OLD.movimento_caixa_id;

  -- Fallback: busca pelo receita_id no movimento (caso FK esteja nula)
  IF v_mov_banco_id IS NULL THEN
    SELECT id INTO v_mov_banco_id FROM tab_movimento_banco
    WHERE receita_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;
  IF v_mov_caixa_id IS NULL THEN
    SELECT id INTO v_mov_caixa_id FROM tab_movimento_caixa
    WHERE receita_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;

  -- Verifica conciliacao - movimento conciliado nao e excluido
  IF v_mov_banco_id IS NOT NULL THEN
    SELECT conciliado INTO v_banco_conciliado
    FROM tab_movimento_banco WHERE id = v_mov_banco_id;
    v_del_banco := NOT COALESCE(v_banco_conciliado, false);
  END IF;
  IF v_mov_caixa_id IS NOT NULL THEN
    SELECT conciliado INTO v_caixa_conciliado
    FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
    v_del_caixa := NOT COALESCE(v_caixa_conciliado, false);
  END IF;

  -- Limpa FKs antes de excluir os movimentos
  UPDATE tab_receita SET
    movimento_banco_id = CASE WHEN v_del_banco THEN NULL ELSE movimento_banco_id END,
    movimento_caixa_id = CASE WHEN v_del_caixa THEN NULL ELSE movimento_caixa_id END
  WHERE id = OLD.id;

  IF v_del_banco THEN
    DELETE FROM tab_movimento_banco WHERE id = v_mov_banco_id;
  END IF;
  IF v_del_caixa THEN
    DELETE FROM tab_movimento_caixa WHERE id = v_mov_caixa_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_receita_estorno
  AFTER UPDATE OF status ON tab_receita
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_estorno_receita();

-- ------------------------------------------------------------
-- 4. Atualiza fn_trigger_liquidar_titulo_receber
--    Espelho exato do fn_trigger_liquidar_titulo_pagar:
--    suporta destino_liquidacao + conta_banco_liq_id e grava
--    movimento_banco_id / movimento_caixa_id no titulo.
--    Tipo do movimento: 'E' (Entrada) em vez de 'S' (Saida).
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

  -- Fecha parcelas em aberto
  UPDATE tab_titulo_receber_parcela
  SET status = 'L'
  WHERE titulo_id = NEW.id AND status = 'A';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
