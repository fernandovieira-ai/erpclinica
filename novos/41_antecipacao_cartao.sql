-- ============================================================
-- 41_antecipacao_cartao.sql
-- Diagnostico: tab_taxa_cartao.percentual_antecipacao_am era cadastrado
-- na tela de Taxas mas nunca usado em nenhum calculo -- fn_trg_venda_cartao_auto
-- buscava o valor e descartava (so gravava percentual_mdr_aplicado). Nao
-- existia nenhuma acao de "antecipar recebivel" em rota, function ou tela.
--
-- Este script implementa a antecipacao de fato:
--   - snapshot do valor/data originais na parcela (pra sempre poder voltar)
--   - fn_antecipar_parcela_cartao(parcela_id, nova_data, created_by):
--       desconto pro-rata = percentual_antecipacao_am * dias_antecipados / 30,
--       aplicado sobre o valor_liquido ATUAL (que ja tem o MDR descontado)
--   - fn_estornar_antecipacao_parcela_cartao(parcela_id): desfaz
--
-- So parcelas com status='PENDENTE' (ainda nao faturadas) podem ser
-- antecipadas -- depois de faturada, a data/valor ja fazem parte do
-- agrupamento da fatura e mexer ali exigiria re-agrupar.
-- ============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_venda_cartao_parcela
  ADD COLUMN IF NOT EXISTS valor_liquido_original numeric(15,2),
  ADD COLUMN IF NOT EXISTS data_prevista_original date,
  ADD COLUMN IF NOT EXISTS antecipado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS percentual_antecipacao_aplicado numeric(6,4),
  ADD COLUMN IF NOT EXISTS antecipado_em timestamptz,
  ADD COLUMN IF NOT EXISTS antecipado_por varchar(100);

-- popula o snapshot nas parcelas ja existentes (equivale ao estado atual,
-- ja que nunca houve antecipacao ate agora)
UPDATE tab_venda_cartao_parcela
   SET valor_liquido_original = valor_liquido,
       data_prevista_original = data_prevista
 WHERE valor_liquido_original IS NULL;

ALTER TABLE tab_venda_cartao_parcela
  ALTER COLUMN valor_liquido_original SET NOT NULL,
  ALTER COLUMN data_prevista_original SET NOT NULL;

COMMENT ON COLUMN tab_venda_cartao_parcela.valor_liquido_original IS 'Valor liquido (so MDR) no momento da venda, antes de qualquer antecipacao -- nunca muda depois';
COMMENT ON COLUMN tab_venda_cartao_parcela.data_prevista_original IS 'Data prevista original (prazo normal do adquirente) -- nunca muda depois';
COMMENT ON COLUMN tab_venda_cartao_parcela.antecipado IS 'true se essa parcela teve o recebimento antecipado (taxa de antecipacao aplicada sobre o valor_liquido)';

-- ============================================================
-- trigger de criacao da parcela agora tambem grava o snapshot original
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
      FROM fn_taxa_cartao_vigente(NEW.condicao_pagamento_id, NEW.data_venda::date);

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
-- FUNCTION: fn_antecipar_parcela_cartao(parcela_id, nova_data, created_by)
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
      FROM fn_taxa_cartao_vigente(v_venda.condicao_pagamento_id, v_venda.data_venda::date);
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

-- ============================================================
-- FUNCTION: fn_estornar_antecipacao_parcela_cartao(parcela_id)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_estornar_antecipacao_parcela_cartao(p_parcela_id int4)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
    v_parcela record;
BEGIN
    SELECT * INTO v_parcela FROM tab_venda_cartao_parcela WHERE id = p_parcela_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parcela % nao encontrada', p_parcela_id;
    END IF;
    IF v_parcela.status <> 'PENDENTE' THEN
        RAISE EXCEPTION 'Parcela % ja esta % -- nao pode estornar antecipacao', p_parcela_id, v_parcela.status;
    END IF;
    IF NOT v_parcela.antecipado THEN
        RAISE EXCEPTION 'Parcela % nao foi antecipada', p_parcela_id;
    END IF;

    UPDATE tab_venda_cartao_parcela
    SET data_prevista  = data_prevista_original,
        valor_liquido  = valor_liquido_original,
        antecipado     = false,
        percentual_antecipacao_aplicado = NULL,
        antecipado_em  = NULL,
        antecipado_por = NULL
    WHERE id = p_parcela_id;
END;
$$;
