-- ============================================================
-- 42_lock_geracao_fatura_cartao.sql
-- Analise de seguranca/desempenho no modulo de cartao: as duas
-- functions que agrupam parcelas pendentes em fatura (por filtro e
-- por selecao) liam a CTE "pendentes" sem travar as linhas. Duas
-- chamadas concorrentes (dois cliques, duas abas, dois usuarios)
-- podiam enxergar a mesma parcela como PENDENTE ao mesmo tempo e
-- ambas contarem seu valor_liquido na soma de tab_fatura_cartao
-- (o ON CONFLICT DO UPDATE soma os dois valores, duplicando o
-- valor_previsto da fatura sem nenhuma parcela a mais de fato).
--
-- Fix: FOR UPDATE OF p na CTE que le as parcelas candidatas, antes
-- de agrupar/gravar. A segunda transacao concorrente bloqueia ate a
-- primeira commitar (ou dar rollback) e, ao continuar, ve a parcela
-- ja com status='FATURADA' -- fora do filtro -- entao processa zero
-- parcelas duplicadas em vez de somar duas vezes.
-- ============================================================

SET client_encoding = 'LATIN1';

CREATE OR REPLACE FUNCTION fn_gerar_faturas_cartao(
    p_empresa_id             int4,
    p_data_referencia        date DEFAULT CURRENT_DATE,
    p_data_vencimento_inicio date DEFAULT NULL,
    p_data_emissao_inicio    date DEFAULT NULL,
    p_data_emissao_fim       date DEFAULT NULL,
    p_conta_banco_id         int4 DEFAULT NULL,
    p_adquirente             varchar DEFAULT NULL,
    p_bandeira               varchar DEFAULT NULL,
    p_modalidade             varchar DEFAULT NULL,
    p_busca                  varchar DEFAULT NULL
)
RETURNS TABLE (faturas_geradas int4, valor_total numeric)
LANGUAGE plpgsql AS $$
DECLARE
    v_count int4;
    v_total numeric;
BEGIN
    WITH pendentes AS (
        SELECT p.id AS parcela_id, v.conta_banco_id, v.adquirente, p.data_prevista, p.valor_liquido
        FROM tab_venda_cartao_parcela p
        JOIN tab_venda_cartao v ON v.id = p.venda_cartao_id
        WHERE v.empresa_id = p_empresa_id
          AND v.status = 'PENDENTE'
          AND p.status = 'PENDENTE'
          AND p.data_prevista <= p_data_referencia
          AND (p_data_vencimento_inicio IS NULL OR p.data_prevista >= p_data_vencimento_inicio)
          AND (p_data_emissao_inicio    IS NULL OR v.data_venda::date >= p_data_emissao_inicio)
          AND (p_data_emissao_fim       IS NULL OR v.data_venda::date <= p_data_emissao_fim)
          AND (p_conta_banco_id         IS NULL OR v.conta_banco_id = p_conta_banco_id)
          AND (p_adquirente             IS NULL OR v.adquirente = p_adquirente)
          AND (p_bandeira               IS NULL OR v.bandeira = p_bandeira)
          AND (p_modalidade             IS NULL OR v.modalidade = p_modalidade)
          AND (p_busca IS NULL OR v.nsu ILIKE '%' || p_busca || '%' OR v.codigo_autorizacao ILIKE '%' || p_busca || '%')
        FOR UPDATE OF p
    ),
    grupos AS (
        SELECT conta_banco_id, adquirente, data_prevista,
               sum(valor_liquido) AS total_previsto,
               count(*)           AS qtd
        FROM pendentes
        GROUP BY conta_banco_id, adquirente, data_prevista
    ),
    faturas AS (
        INSERT INTO tab_fatura_cartao
            (empresa_id, conta_banco_id, adquirente, data_prevista, valor_previsto, qtd_parcelas, created_by)
        SELECT p_empresa_id, conta_banco_id, adquirente, data_prevista, total_previsto, qtd, 'fn_gerar_faturas_cartao'
        FROM grupos
        ON CONFLICT (empresa_id, conta_banco_id, adquirente, data_prevista)
        DO UPDATE SET
            valor_previsto = CASE WHEN tab_fatura_cartao.status = 'CANCELADA' THEN EXCLUDED.valor_previsto
                                   ELSE tab_fatura_cartao.valor_previsto + EXCLUDED.valor_previsto END,
            qtd_parcelas   = CASE WHEN tab_fatura_cartao.status = 'CANCELADA' THEN EXCLUDED.qtd_parcelas
                                   ELSE tab_fatura_cartao.qtd_parcelas   + EXCLUDED.qtd_parcelas   END,
            status         = CASE WHEN tab_fatura_cartao.status = 'CANCELADA' THEN 'ABERTA'
                                   ELSE tab_fatura_cartao.status END
        RETURNING id, conta_banco_id, adquirente, data_prevista
    ),
    atualiza_parcelas AS (
        UPDATE tab_venda_cartao_parcela p
        SET status = 'FATURADA', fatura_cartao_id = f.id
        FROM pendentes pd
        JOIN faturas f
          ON f.conta_banco_id = pd.conta_banco_id
         AND f.adquirente     = pd.adquirente
         AND f.data_prevista  = pd.data_prevista
        WHERE p.id = pd.parcela_id
        RETURNING p.id
    )
    SELECT count(*)::int4, COALESCE((SELECT sum(total_previsto) FROM grupos), 0)
      INTO v_count, v_total
    FROM faturas;

    RETURN QUERY SELECT v_count, v_total;
END;
$$;

CREATE OR REPLACE FUNCTION fn_gerar_faturas_cartao_selecao(
    p_empresa_id  int4,
    p_parcela_ids int4[],
    p_created_by  varchar
)
RETURNS TABLE (faturas_geradas int4, valor_total numeric)
LANGUAGE plpgsql AS $$
DECLARE
    v_count int4;
    v_total numeric;
BEGIN
    IF p_parcela_ids IS NULL OR array_length(p_parcela_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'Nenhuma venda selecionada';
    END IF;

    WITH pendentes AS (
        SELECT p.id AS parcela_id, v.conta_banco_id, v.adquirente, p.data_prevista, p.valor_liquido
        FROM tab_venda_cartao_parcela p
        JOIN tab_venda_cartao v ON v.id = p.venda_cartao_id
        WHERE v.empresa_id = p_empresa_id
          AND v.status = 'PENDENTE'
          AND p.status = 'PENDENTE'
          AND p.id = ANY(p_parcela_ids)
        FOR UPDATE OF p
    ),
    grupos AS (
        SELECT conta_banco_id, adquirente, data_prevista,
               sum(valor_liquido) AS total_previsto,
               count(*)           AS qtd
        FROM pendentes
        GROUP BY conta_banco_id, adquirente, data_prevista
    ),
    faturas AS (
        INSERT INTO tab_fatura_cartao
            (empresa_id, conta_banco_id, adquirente, data_prevista, valor_previsto, qtd_parcelas, created_by)
        SELECT p_empresa_id, conta_banco_id, adquirente, data_prevista, total_previsto, qtd, p_created_by
        FROM grupos
        ON CONFLICT (empresa_id, conta_banco_id, adquirente, data_prevista)
        DO UPDATE SET
            valor_previsto = CASE WHEN tab_fatura_cartao.status = 'CANCELADA' THEN EXCLUDED.valor_previsto
                                   ELSE tab_fatura_cartao.valor_previsto + EXCLUDED.valor_previsto END,
            qtd_parcelas   = CASE WHEN tab_fatura_cartao.status = 'CANCELADA' THEN EXCLUDED.qtd_parcelas
                                   ELSE tab_fatura_cartao.qtd_parcelas   + EXCLUDED.qtd_parcelas   END,
            status         = CASE WHEN tab_fatura_cartao.status = 'CANCELADA' THEN 'ABERTA'
                                   ELSE tab_fatura_cartao.status END
        RETURNING id, conta_banco_id, adquirente, data_prevista
    ),
    atualiza_parcelas AS (
        UPDATE tab_venda_cartao_parcela p
        SET status = 'FATURADA', fatura_cartao_id = f.id
        FROM pendentes pd
        JOIN faturas f
          ON f.conta_banco_id = pd.conta_banco_id
         AND f.adquirente     = pd.adquirente
         AND f.data_prevista  = pd.data_prevista
        WHERE p.id = pd.parcela_id
        RETURNING p.id
    )
    SELECT count(*)::int4, COALESCE((SELECT sum(total_previsto) FROM grupos), 0)
      INTO v_count, v_total
    FROM faturas;

    RETURN QUERY SELECT v_count, v_total;
END;
$$;

-- ============================================================
-- Indices ausentes: as rotas de listagem/filtro de vendas no cartao
-- (app/api/financeiro/cartao/vendas/route.ts e
-- app/api/financeiro/cartao/faturas/gerar/route.ts) filtram por
-- adquirente, bandeira, modalidade e conta_banco_id isoladamente --
-- so havia indice composto para status e data_venda. Sem isso, esses
-- filtros caem em sequential scan a medida que a tabela cresce.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_venda_cartao_adquirente ON tab_venda_cartao (empresa_id, adquirente);
CREATE INDEX IF NOT EXISTS idx_venda_cartao_bandeira    ON tab_venda_cartao (empresa_id, bandeira);
CREATE INDEX IF NOT EXISTS idx_venda_cartao_modalidade  ON tab_venda_cartao (empresa_id, modalidade);
CREATE INDEX IF NOT EXISTS idx_venda_cartao_conta       ON tab_venda_cartao (empresa_id, conta_banco_id);
