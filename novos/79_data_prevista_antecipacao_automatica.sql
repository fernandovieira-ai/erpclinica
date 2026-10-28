-- ============================================================
-- 79_data_prevista_antecipacao_automatica.sql
--
-- Decisao de negocio: reexaminando o mesmo extrato real da Cielo que
-- motivou a migration 78 (taxa composta por parcela), notou-se que a
-- "Data prevista de liquidacao" de TODAS as parcelas de uma venda
-- parcelada e A MESMA (D+1 da venda) -- a adquirente nao paga uma
-- parcela por mes, ela antecipa automaticamente TODO o recebivel e
-- deposita tudo de uma vez, cobrando o custo dessa antecipacao como
-- o desconto crescente por parcela (ja tratado na migration 78).
--
-- fn_trg_venda_cartao_parcelas calculava data_prevista escalonada
-- (data_venda + prazo + (i-1)*intervalo_dias, uma parcela por mes) --
-- isso so e correto pra condicao SEM antecipacao automatica (sem
-- percentual_antecipacao_am cadastrado, onde cada parcela realmente
-- chega no seu vencimento natural, sem desconto extra de antecipacao).
-- Quando ha antecipacao automatica (percentual_antecipacao_am_aplicado
-- > 0 -- o mesmo campo que ja dispara o desconto composto), todas as
-- parcelas da venda devem ter a MESMA data_prevista (data_venda + prazo),
-- sem o escalonamento por intervalo_dias.
-- ============================================================

SET client_encoding = 'LATIN1';

CREATE OR REPLACE FUNCTION fn_trg_venda_cartao_parcelas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_intervalo_dias int;
    v_prazo          int;
    v_valor_parc     numeric(15,2);
    v_soma           numeric(15,2) := 0;
    v_fator_antecip  numeric;
    v_fracao_liquida numeric;
    v_liquido        numeric(15,2);
    v_pct_efetivo    numeric(6,4);
    v_data_prev      date;
    v_tem_antecip    boolean;
    i                int;
BEGIN
    SELECT intervalo_dias INTO v_intervalo_dias
      FROM tab_condicao_pagamento WHERE id = NEW.condicao_pagamento_id;

    SELECT prazo_recebimento_dias INTO v_prazo
      FROM fn_taxa_cartao_vigente(NEW.condicao_pagamento_id, NEW.qtd_parcelas);

    v_prazo       := COALESCE(v_prazo, 0);
    v_tem_antecip := COALESCE(NEW.percentual_antecipacao_am_aplicado, 0) > 0;
    v_fator_antecip := 1 - NEW.percentual_antecipacao_am_aplicado / 100;

    v_valor_parc := round(NEW.valor_bruto / NEW.qtd_parcelas, 2);
    FOR i IN 1..NEW.qtd_parcelas LOOP
        IF i = NEW.qtd_parcelas THEN
            v_valor_parc := NEW.valor_bruto - v_soma;
        END IF;
        v_soma := v_soma + v_valor_parc;

        v_fracao_liquida := (1 - NEW.percentual_mdr_aplicado / 100) * power(v_fator_antecip, i - 1);
        v_liquido         := round(v_valor_parc * v_fracao_liquida, 2);
        v_pct_efetivo     := round(100 * (1 - v_fracao_liquida), 4);

        -- com antecipacao automatica contratada, a adquirente deposita
        -- tudo junto em D+prazo (mesma data pra todas as parcelas);
        -- sem antecipacao, cada parcela chega no seu vencimento natural
        IF v_tem_antecip THEN
            v_data_prev := NEW.data_venda::date + v_prazo;
        ELSE
            v_data_prev := NEW.data_venda::date + (v_prazo + (i - 1) * v_intervalo_dias);
        END IF;

        INSERT INTO tab_venda_cartao_parcela
            (venda_cartao_id, numero_parcela, valor, valor_liquido, data_prevista,
             valor_liquido_original, data_prevista_original, percentual_mdr_efetivo)
        VALUES
            (NEW.id, i, v_valor_parc, v_liquido, v_data_prev,
             v_liquido, v_data_prev, v_pct_efetivo);
    END LOOP;

    RETURN NEW;
END;
$$;
