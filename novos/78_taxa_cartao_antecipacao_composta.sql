-- ============================================================
-- 78_taxa_cartao_antecipacao_composta.sql
--
-- Decisao de negocio: o MDR aplicado numa venda de cartao parcelada
-- (fn_trg_venda_cartao_parcelas) estava FLAT -- a mesma % pra todas
-- as parcelas da venda (parcela 1/5 e 5/5 saiam com o mesmo desconto).
-- Analise de um extrato real da Cielo (relatorio de vendas recebidas,
-- cliente hiiltcor, 10/2026) mostrou que a adquirente desconta cada
-- parcela de forma CRESCENTE e COMPOSTA: a razao entre o valor liquido
-- fracionario de parcelas consecutivas e praticamente constante
-- (~0.983, ou seja ~1.65%-1.68% a.m. de custo de antecipacao de
-- recebiveis, igual entre Visa/Mastercard/Elo) -- a adquirente paga
-- tudo adiantado (D+1) mas desconta cada parcela como se estivesse
-- comprando o direito de receber aquele valor N meses no futuro.
--
-- tab_taxa_cartao.percentual_antecipacao_am ja existia pra isso, mas
-- so era usado na acao MANUAL de antecipar uma parcela especifica
-- (fn_antecipar_parcela_cartao, novos/41). Essa migration passa a
-- aplicar automaticamente esse percentual, de forma composta por
-- numero de parcela, no momento em que a venda e criada.
--
-- Vendas/parcelas ja existentes NAO sao recalculadas (muitas ja
-- viraram fatura/movimento bancario conciliado) -- so vendas novas,
-- criadas a partir desta migration, usam a formula composta.
-- ============================================================

SET client_encoding = 'LATIN1';

-- ============================================================
-- 1) snapshot da taxa de antecipacao na venda (mesmo padrao ja usado
--    pra percentual_mdr_aplicado -- imutavel apos a venda, mesmo que
--    o cadastro da taxa mude depois)
-- ============================================================

ALTER TABLE tab_venda_cartao
    ADD COLUMN IF NOT EXISTS percentual_antecipacao_am_aplicado numeric(6,4) NOT NULL DEFAULT 0;

-- ============================================================
-- 2) percentual efetivo de CADA parcela (MDR base composto com a
--    antecipacao acumulada ate aquela parcela) -- guardado pra
--    auditoria/relatorio, ja que valor/valor_liquido por si so nao
--    deixa claro qual foi a % real descontada parcela a parcela
-- ============================================================

ALTER TABLE tab_venda_cartao_parcela
    ADD COLUMN IF NOT EXISTS percentual_mdr_efetivo numeric(6,4);

-- ============================================================
-- 3) fn_trg_venda_cartao_auto -- alem do MDR, agora tambem faz o
--    snapshot do percentual de antecipacao vigente na venda
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
    -- bloqueia o recebimento, so nao aplica desconto nenhum
    NEW.percentual_mdr_aplicado            := COALESCE(v_taxa.percentual_mdr, 0);
    NEW.percentual_antecipacao_am_aplicado := COALESCE(v_taxa.percentual_antecipacao_am, 0);

    RETURN NEW;
END;
$$;

-- ============================================================
-- 4) fn_trg_venda_cartao_parcelas -- MDR efetivo de cada parcela i
--    agora e: (1 - mdr_base) * (1 - antecipacao_am)^(i-1)
--    (parcela 1 so leva o MDR base; cada parcela seguinte acumula
--    mais um mes de custo de antecipacao, de forma composta)
-- ============================================================

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
    i                int;
BEGIN
    SELECT intervalo_dias INTO v_intervalo_dias
      FROM tab_condicao_pagamento WHERE id = NEW.condicao_pagamento_id;

    SELECT prazo_recebimento_dias INTO v_prazo
      FROM fn_taxa_cartao_vigente(NEW.condicao_pagamento_id, NEW.qtd_parcelas);

    v_prazo := COALESCE(v_prazo, 0);
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
        v_data_prev       := NEW.data_venda::date + (v_prazo + (i - 1) * v_intervalo_dias);

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

-- ============================================================
-- 5) fn_antecipar_parcela_cartao -- antecipacao VOLUNTARIA (operador
--    adianta uma parcela especifica antes do prazo contratual) passa
--    a usar o snapshot da venda em vez de reconsultar a taxa vigente,
--    pro mesmo motivo do MDR: imutavel apos a venda. Continua sendo
--    um desconto ADICIONAL sobre o valor_liquido que ja saiu da venda
--    com a antecipacao automatica (item 4) embutida.
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

    v_dias := v_parcela.data_prevista - p_nova_data;
    IF COALESCE(v_venda.percentual_antecipacao_am_aplicado, 0) > 0 THEN
        v_pct := v_venda.percentual_antecipacao_am_aplicado * v_dias / 30.0;
    ELSE
        SELECT percentual_antecipacao_am INTO v_taxa
          FROM fn_taxa_cartao_vigente(v_venda.condicao_pagamento_id, v_venda.qtd_parcelas);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Nenhuma taxa de antecipacao cadastrada pra essa venda';
        END IF;
        v_pct := v_taxa.percentual_antecipacao_am * v_dias / 30.0;
    END IF;

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
