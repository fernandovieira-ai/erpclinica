-- ============================================================
-- 62_taxa_cartao_opcional.sql
--
-- Decisao de negocio: taxa de cartao (tab_taxa_cartao) deixa de ser
-- obrigatoria pra registrar o recebimento de uma consulta no debito/
-- credito. Se nao existir taxa cadastrada pra condicao+faixa de
-- parcelas, a venda no cartao e criada normalmente (percentual_mdr
-- aplicado = 0, prazo de recebimento = 0 dias -- sem desconto, sem
-- atraso presumido) em vez de bloquear o recebimento com excecao.
-- O usuario cadastra a taxa depois e ela passa a valer dali pra
-- frente; vendas ja lancadas sem taxa nao sao recalculadas.
-- ============================================================

SET client_encoding = 'LATIN1';

-- ============================================================
-- 1) fn_trg_venda_cartao_auto -- nao bloqueia mais sem taxa
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

    -- sem taxa cadastrada pra essa condicao/faixa de parcelas: nao
    -- bloqueia o recebimento, so nao aplica desconto de MDR (o
    -- usuario cadastra a taxa depois se precisar)
    NEW.percentual_mdr_aplicado := COALESCE(v_taxa.percentual_mdr, 0);

    RETURN NEW;
END;
$$;

-- ============================================================
-- 2) fn_trg_venda_cartao_parcelas -- prazo default 0 dias sem taxa
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

    v_prazo := COALESCE(v_prazo, 0);

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
