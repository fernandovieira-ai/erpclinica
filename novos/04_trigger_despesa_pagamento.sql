-- =============================================================
-- MIGRACAO: Ajuste do trigger de despesa + trigger de estorno
--
-- Problema: fn_trigger_despesa so gerava movimento quando
--   ind_avista = true. O formulario usa destino='B'/'C' para
--   indicar pagamento via banco/caixa sem setar ind_avista.
--
-- Ajuste: gerar movimento quando destino IS NOT NULL
--   (independente de ind_avista), mantendo compatibilidade
--   com registros que usam ind_avista=true sem destino.
--
-- Novo: trg_despesa_estorno - exclui movimento ao cancelar.
-- =============================================================

-- ------------------------------------------------------------
-- 1. Atualiza fn_trigger_despesa
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_trigger_despesa()
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

  -- PAGAMENTO DIRETO: destino informado OU ind_avista = true
  IF NEW.destino IS NOT NULL OR NEW.ind_avista THEN

    IF NEW.destino IS NULL THEN
      RAISE EXCEPTION 'Despesa a vista requer destino: C=Caixa ou B=Banco';
    END IF;
    IF NEW.destino = 'B' AND NEW.conta_banco_id IS NULL THEN
      RAISE EXCEPTION 'Pagamento em banco requer conta_banco_id';
    END IF;

    IF NEW.destino = 'C' THEN
      INSERT INTO tab_movimento_caixa (
        empresa_id, tipo_operacao_id, pessoa_id, despesa_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.tipo_operacao_id, NEW.pessoa_id, NEW.id,
        'S', NEW.valor,
        COALESCE(NEW.data_pagamento, NEW.data_despesa),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_caixa_id;

      UPDATE tab_despesa SET
        movimento_caixa_id = v_mov_caixa_id,
        data_pagamento     = COALESCE(NEW.data_pagamento, NEW.data_despesa)
      WHERE id = NEW.id;

    ELSE -- destino = 'B'
      INSERT INTO tab_movimento_banco (
        empresa_id, conta_banco_id, tipo_operacao_id, pessoa_id, despesa_id,
        tipo, valor, data_movimento, documento, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.conta_banco_id, NEW.tipo_operacao_id,
        NEW.pessoa_id, NEW.id,
        'S', NEW.valor,
        COALESCE(NEW.data_pagamento, NEW.data_despesa),
        NEW.documento, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_mov_banco_id;

      UPDATE tab_despesa SET
        movimento_banco_id = v_mov_banco_id,
        data_pagamento     = COALESCE(NEW.data_pagamento, NEW.data_despesa)
      WHERE id = NEW.id;
    END IF;

  -- A PRAZO: gera parcelas + titulos a pagar
  ELSE
    v_valor_parcela := ROUND(NEW.valor / NEW.num_parcelas, 2);

    FOR v_i IN 1..NEW.num_parcelas LOOP
      v_data_venc := NEW.data_despesa + (v_i * NEW.intervalo_dias);

      INSERT INTO tab_titulo_pagar (
        empresa_id, pessoa_id, tipo_despesa_id, cod_tipo_cobranca,
        centro_custo_id, conta_banco_id, despesa_id,
        numero_titulo, num_documento, origem_modulo, origem_id,
        data_emissao, data_vencimento, data_competencia,
        valor_original, observacao, created_by
      ) VALUES (
        NEW.empresa_id, NEW.pessoa_id, NEW.tipo_despesa_id,
        NEW.cod_tipo_cobranca, NEW.centro_custo_id,
        NEW.conta_banco_id, NEW.id,
        NEW.id || '/' || LPAD(v_i::TEXT, 2, '0'),
        NEW.documento, 'DES', NEW.id,
        NEW.data_despesa, v_data_venc,
        COALESCE(NEW.data_competencia, NEW.data_despesa),
        v_valor_parcela, NEW.observacao, NEW.created_by
      ) RETURNING id INTO v_titulo_id;

      INSERT INTO tab_despesa_parcela (
        despesa_id, numero_parcela, data_vencimento, valor, titulo_pagar_id
      ) VALUES (
        NEW.id, v_i, v_data_venc, v_valor_parcela, v_titulo_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 2. Trigger de estorno/cancelamento de despesa
-- ------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_despesa_estorno ON tab_despesa;
DROP FUNCTION IF EXISTS fn_trigger_estorno_despesa();

CREATE OR REPLACE FUNCTION fn_trigger_estorno_despesa()
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

  -- Fallback: busca pelo despesa_id no movimento (caso FK esteja nula)
  IF v_mov_banco_id IS NULL THEN
    SELECT id INTO v_mov_banco_id FROM tab_movimento_banco
    WHERE despesa_id = OLD.id ORDER BY id DESC LIMIT 1;
  END IF;
  IF v_mov_caixa_id IS NULL THEN
    SELECT id INTO v_mov_caixa_id FROM tab_movimento_caixa
    WHERE despesa_id = OLD.id ORDER BY id DESC LIMIT 1;
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
  UPDATE tab_despesa SET
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

CREATE TRIGGER trg_despesa_estorno
  AFTER UPDATE OF status ON tab_despesa
  FOR EACH ROW EXECUTE FUNCTION fn_trigger_estorno_despesa();
