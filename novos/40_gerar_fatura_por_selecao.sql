-- ============================================================
-- 40_gerar_fatura_por_selecao.sql
-- Ate aqui "Gerar Faturas" era uma caixa-preta: preenchia filtros e
-- confiava que o resultado batia com o extrato do adquirente. Agora
-- o usuario precisa CONFERIR as vendas pendentes antes de gerar --
-- a tela lista as vendas que batem com o filtro e o usuario marca
-- quais entram na fatura.
--
-- fn_gerar_faturas_cartao_selecao(empresa_id, parcela_ids[], created_by)
-- agrupa exatamente as parcelas escolhidas (por conta+adquirente+data
-- prevista, igual fn_gerar_faturas_cartao) em vez de tudo que bate
-- com um filtro de data. fn_gerar_faturas_cartao continua existindo
-- (nao e mais chamada pela tela, mas nao ha motivo pra remover uma
-- function que outra rotina possa usar futuramente).
-- ============================================================

SET client_encoding = 'LATIN1';

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
