-- ============================================================
-- 44_taxa_cartao_sem_vigencia.sql
--
-- Decisao de negocio: tab_taxa_cartao nao vai mais ter historico
-- por data de vigencia -- existe UMA taxa vigente por condicao de
-- pagamento + faixa de parcelas, e quando ela muda o usuario
-- ATUALIZA o registro (nao cria um novo com nova vigencia).
-- Remove data_vigencia_inicio/data_vigencia_fim e passa a garantir
-- unicidade por (condicao_pagamento_id, parcelas_de, parcelas_ate).
-- ============================================================

SET client_encoding = 'LATIN1';

-- ============================================================
-- 1) tab_taxa_cartao -- remove colunas de vigencia, garante 1 taxa
--    por condicao+faixa de parcelas
-- ============================================================

ALTER TABLE tab_taxa_cartao
    DROP COLUMN IF EXISTS data_vigencia_inicio,
    DROP COLUMN IF EXISTS data_vigencia_fim;

CREATE UNIQUE INDEX IF NOT EXISTS uq_taxa_cartao_condicao_parcelas
    ON tab_taxa_cartao (condicao_pagamento_id, parcelas_de, parcelas_ate);

-- ============================================================
-- 2) fn_taxa_cartao_vigente -- perde a data (nao existe mais
--    conceito de vigencia), so filtra por condicao + faixa de parcelas
-- ============================================================

DROP FUNCTION IF EXISTS fn_taxa_cartao_vigente(int4, date, smallint);

CREATE OR REPLACE FUNCTION fn_taxa_cartao_vigente(
    p_condicao_pagamento_id int4,
    p_qtd_parcelas          smallint DEFAULT 1
) RETURNS TABLE (percentual_mdr numeric, percentual_antecipacao_am numeric, prazo_recebimento_dias smallint)
LANGUAGE sql STABLE AS $$
    SELECT t.percentual_mdr, t.percentual_antecipacao_am, t.prazo_recebimento_dias
    FROM tab_taxa_cartao t
    WHERE t.condicao_pagamento_id = p_condicao_pagamento_id
      AND p_qtd_parcelas BETWEEN t.parcelas_de AND t.parcelas_ate
    ORDER BY (t.parcelas_ate - t.parcelas_de) ASC
    LIMIT 1;
$$;

-- ============================================================
-- 3) fn_trg_venda_cartao_auto -- chama fn_taxa_cartao_vigente sem data
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
      FROM fn_taxa_cartao_vigente(NEW.condicao_pagamento_id, NEW.qtd_parcelas);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nenhuma taxa cadastrada pra condicao % (% parcelas)',
            NEW.condicao_pagamento_id, NEW.qtd_parcelas;
    END IF;

    NEW.percentual_mdr_aplicado := v_taxa.percentual_mdr;

    RETURN NEW;
END;
$$;

-- ============================================================
-- 4) fn_trg_venda_cartao_parcelas -- idem, sem data
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
      FROM fn_taxa_cartao_vigente(NEW.condicao_pagamento_id, NEW.qtd_parcelas);

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
-- 5) fn_antecipar_parcela_cartao -- idem, sem data
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
      FROM fn_taxa_cartao_vigente(v_venda.condicao_pagamento_id, v_venda.qtd_parcelas);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nenhuma taxa cadastrada pra essa condicao de pagamento';
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
