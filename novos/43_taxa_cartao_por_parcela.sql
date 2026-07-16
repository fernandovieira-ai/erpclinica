-- ============================================================
-- 43_taxa_cartao_por_parcela.sql
--
-- Ate aqui, "tab_condicao_pagamento.num_parcelas" para credito
-- era ignorado na pratica: o formulario so deixava editar esse
-- campo quando tipo='P' (a prazo) e o form forcava num_parcelas=1
-- toda vez que tipo='V' -- ou seja, toda condicao de credito
-- sempre virava 1x, mesmo se a maquininha real parcelasse.
--
-- Esta migration muda o significado do campo para credito:
--   num_parcelas agora e o NUMERO MAXIMO DE PARCELAS PERMITIDO
--   nessa condicao. O operador escolhe, no recebimento, quantas
--   parcelas usar (1..maximo) -- ver tab_venda_cartao.qtd_parcelas,
--   que passa a vir do app em vez de ser sempre = num_parcelas.
--
-- E como a MDR cobrada pela adquirente cresce conforme o numero
-- de parcelas (3x custa menos que 12x), tab_taxa_cartao ganha uma
-- faixa (parcelas_de/parcelas_ate) -- permite cadastrar taxas
-- diferentes por faixa de parcelas dentro da mesma condicao.
-- ============================================================

SET client_encoding = 'LATIN1';

-- ============================================================
-- 1) tab_taxa_cartao -- faixa de parcelas a que a taxa se aplica
-- ============================================================

ALTER TABLE tab_taxa_cartao
    ADD COLUMN IF NOT EXISTS parcelas_de  smallint NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS parcelas_ate smallint NOT NULL DEFAULT 99;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tab_taxa_cartao_parcelas_check') THEN
        ALTER TABLE tab_taxa_cartao
            ADD CONSTRAINT tab_taxa_cartao_parcelas_check
            CHECK (parcelas_de >= 1 AND parcelas_ate >= parcelas_de);
    END IF;
END $$;

COMMENT ON COLUMN tab_taxa_cartao.parcelas_de  IS 'Faixa de parcelas (inicio) para a qual este MDR vale -- permite MDR crescente por numero de parcelas';
COMMENT ON COLUMN tab_taxa_cartao.parcelas_ate IS 'Faixa de parcelas (fim) para a qual este MDR vale';

-- ============================================================
-- 2) fn_taxa_cartao_vigente -- passa a considerar a qtd de parcelas
--    escolhida; entre as taxas vigentes na data, prefere a faixa
--    mais especifica (menor amplitude), depois a vigencia mais recente
-- ============================================================

DROP FUNCTION IF EXISTS fn_taxa_cartao_vigente(int4, date);

CREATE OR REPLACE FUNCTION fn_taxa_cartao_vigente(
    p_condicao_pagamento_id int4,
    p_data_venda            date,
    p_qtd_parcelas          smallint DEFAULT 1
) RETURNS TABLE (percentual_mdr numeric, percentual_antecipacao_am numeric, prazo_recebimento_dias smallint)
LANGUAGE sql STABLE AS $$
    SELECT t.percentual_mdr, t.percentual_antecipacao_am, t.prazo_recebimento_dias
    FROM tab_taxa_cartao t
    WHERE t.condicao_pagamento_id = p_condicao_pagamento_id
      AND t.data_vigencia_inicio <= p_data_venda
      AND (t.data_vigencia_fim IS NULL OR t.data_vigencia_fim >= p_data_venda)
      AND p_qtd_parcelas BETWEEN t.parcelas_de AND t.parcelas_ate
    ORDER BY (t.parcelas_ate - t.parcelas_de) ASC, t.data_vigencia_inicio DESC
    LIMIT 1;
$$;

-- ============================================================
-- 3) fn_trg_venda_cartao_auto -- qtd_parcelas passa a vir do app
--    (operador escolhe no recebimento); num_parcelas da condicao
--    vira o maximo permitido. Debito continua sempre 1x.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_trg_venda_cartao_auto()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_cp   record;
    v_taxa record;
BEGIN
    SELECT adquirente, bandeira, tipo_pagamento, num_parcelas, intervalo_dias
      INTO v_cp
      FROM tab_condicao_pagamento WHERE id = NEW.condicao_pagamento_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Condicao de pagamento % nao existe', NEW.condicao_pagamento_id;
    END IF;

    IF v_cp.tipo_pagamento NOT IN ('debito','credito') THEN
        RAISE EXCEPTION 'Condicao % nao e cartao (tipo_pagamento=%)', NEW.condicao_pagamento_id, v_cp.tipo_pagamento;
    END IF;

    NEW.adquirente := v_cp.adquirente;
    NEW.bandeira   := v_cp.bandeira;

    IF v_cp.tipo_pagamento = 'debito' THEN
        NEW.qtd_parcelas := 1;
        NEW.modalidade   := 'DEBITO';
    ELSE
        NEW.qtd_parcelas := COALESCE(NEW.qtd_parcelas, v_cp.num_parcelas);
        IF NEW.qtd_parcelas < 1 OR NEW.qtd_parcelas > v_cp.num_parcelas THEN
            RAISE EXCEPTION 'Numero de parcelas % invalido -- maximo permitido para esta condicao e %',
                NEW.qtd_parcelas, v_cp.num_parcelas;
        END IF;
        NEW.modalidade := CASE WHEN NEW.qtd_parcelas = 1 THEN 'CREDITO_VISTA' ELSE 'CREDITO_PARCELADO' END;
    END IF;

    SELECT percentual_mdr, percentual_antecipacao_am, prazo_recebimento_dias
      INTO v_taxa
      FROM fn_taxa_cartao_vigente(NEW.condicao_pagamento_id, NEW.data_venda::date, NEW.qtd_parcelas);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nenhuma taxa vigente cadastrada pra condicao % (% parcelas) na data %',
            NEW.condicao_pagamento_id, NEW.qtd_parcelas, NEW.data_venda;
    END IF;

    NEW.percentual_mdr_aplicado := v_taxa.percentual_mdr;

    RETURN NEW;
END;
$$;

-- ============================================================
-- 4) fn_trg_venda_cartao_parcelas -- busca a taxa vigente
--    considerando a qtd_parcelas ja definida pelo trigger acima.
--    Reaplica tambem o snapshot de antecipacao (valor_liquido_original/
--    data_prevista_original) introduzido em 41_antecipacao_cartao.sql --
--    essa function e reescrita aqui de novo, entao precisa manter isso.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_trg_venda_cartao_parcelas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_intervalo_dias int;
    v_prazo          int;
    v_valor_parc     numeric(15,2);
    v_soma           numeric(15,2) := 0;
    v_liquido        numeric(15,2);
    v_data_prev      date;
    i                int;
BEGIN
    SELECT intervalo_dias INTO v_intervalo_dias
      FROM tab_condicao_pagamento WHERE id = NEW.condicao_pagamento_id;

    SELECT prazo_recebimento_dias INTO v_prazo
      FROM fn_taxa_cartao_vigente(NEW.condicao_pagamento_id, NEW.data_venda::date, NEW.qtd_parcelas);

    v_valor_parc := round(NEW.valor_bruto / NEW.qtd_parcelas, 2);
    FOR i IN 1..NEW.qtd_parcelas LOOP
        IF i = NEW.qtd_parcelas THEN
            v_valor_parc := NEW.valor_bruto - v_soma;
        END IF;
        v_soma      := v_soma + v_valor_parc;
        v_liquido   := round(v_valor_parc * (1 - NEW.percentual_mdr_aplicado / 100), 2);
        v_data_prev := NEW.data_venda::date + (v_prazo + (i - 1) * v_intervalo_dias);

        INSERT INTO tab_venda_cartao_parcela
            (venda_cartao_id, numero_parcela, valor, valor_liquido, data_prevista,
             valor_liquido_original, data_prevista_original)
        VALUES
            (NEW.id, i, v_valor_parc, v_liquido, v_data_prev,
             v_liquido, v_data_prev);
    END LOOP;

    RETURN NEW;
END;
$$;

-- ============================================================
-- 5) fn_antecipar_parcela_cartao -- a % de antecipacao tambem pode
--    variar por faixa de parcelas; passa a considerar qtd_parcelas
--    da venda em vez de sempre usar a faixa 1x (default)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_antecipar_parcela_cartao(
    p_parcela_id int4,
    p_nova_data  date,
    p_created_by varchar
)
RETURNS TABLE (
    valor_liquido_anterior numeric,
    valor_liquido_novo     numeric,
    percentual_aplicado    numeric,
    dias_antecipados       int4
)
LANGUAGE plpgsql AS $$
DECLARE
    v_parcela record;
    v_venda   record;
    v_taxa    record;
    v_dias    int4;
    v_pct     numeric;
    v_novo    numeric;
BEGIN
    SELECT * INTO v_parcela FROM tab_venda_cartao_parcela WHERE id = p_parcela_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parcela % nao encontrada', p_parcela_id;
    END IF;
    IF v_parcela.status <> 'PENDENTE' THEN
        RAISE EXCEPTION 'Parcela % ja esta % -- so parcelas pendentes (nao faturadas) podem ser antecipadas', p_parcela_id, v_parcela.status;
    END IF;

    SELECT * INTO v_venda FROM tab_venda_cartao WHERE id = v_parcela.venda_cartao_id;
    IF v_venda.status <> 'PENDENTE' THEN
        RAISE EXCEPTION 'Venda % nao esta pendente', v_venda.id;
    END IF;

    IF p_nova_data < CURRENT_DATE THEN
        RAISE EXCEPTION 'Data de antecipacao nao pode ser no passado';
    END IF;
    IF p_nova_data >= v_parcela.data_prevista THEN
        RAISE EXCEPTION 'Data de antecipacao (%) precisa ser anterior a data prevista atual (%)', p_nova_data, v_parcela.data_prevista;
    END IF;

    SELECT percentual_antecipacao_am INTO v_taxa
      FROM fn_taxa_cartao_vigente(v_venda.condicao_pagamento_id, v_venda.data_venda::date, v_venda.qtd_parcelas);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nenhuma taxa vigente encontrada pra essa condicao na data da venda';
    END IF;

    v_dias := v_parcela.data_prevista - p_nova_data;
    v_pct  := v_taxa.percentual_antecipacao_am * v_dias / 30.0;

    IF v_pct >= 100 THEN
        RAISE EXCEPTION 'Percentual de antecipacao calculado (%) invalido -- verifique a taxa cadastrada', v_pct;
    END IF;

    v_novo := round(v_parcela.valor_liquido * (1 - v_pct / 100), 2);

    UPDATE tab_venda_cartao_parcela
    SET data_prevista  = p_nova_data,
        valor_liquido  = v_novo,
        antecipado     = true,
        percentual_antecipacao_aplicado = v_pct,
        antecipado_em  = now(),
        antecipado_por = p_created_by
    WHERE id = p_parcela_id;

    RETURN QUERY SELECT v_parcela.valor_liquido, v_novo, v_pct, v_dias;
END;
$$;
