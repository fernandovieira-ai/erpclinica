-- ============================================================
-- 37_filtro_geracao_fatura_cartao.sql
-- A geracao de fatura de cartao (fn_gerar_faturas_cartao) so aceitava
-- data de referencia (vencimento ate). Para permitir conciliacao mais
-- precisa contra o extrato do adquirente, a tela de geracao passa a
-- filtrar por tudo que a venda no cartao guarda: emissao (data_venda),
-- vencimento (data_prevista), conta bancaria, adquirente, bandeira,
-- modalidade e NSU/codigo de autorizacao.
--
-- CREATE OR REPLACE mantendo os 2 parametros originais na mesma posicao
-- (compatibilidade com chamadas antigas) e acrescentando os novos
-- filtros opcionais no final, todos com DEFAULT NULL (= sem filtro).
-- ============================================================

SET client_encoding = 'LATIN1';

-- CREATE OR REPLACE nao substitui a versao antiga aqui: Postgres identifica
-- overload pela lista de tipos dos parametros, e essa lista mudou (parametros
-- novos no meio/fim contam como assinatura diferente mesmo com DEFAULT).
-- Sem o DROP abaixo ficariam 2 funcoes com o mesmo nome (2 e 10 parametros).
DROP FUNCTION IF EXISTS fn_gerar_faturas_cartao(int4, date);

CREATE OR REPLACE FUNCTION fn_gerar_faturas_cartao(
    p_empresa_id             int4,
    p_data_referencia        date DEFAULT CURRENT_DATE,   -- vencimento ate (mantido p/ compatibilidade)
    p_data_vencimento_inicio date DEFAULT NULL,
    p_data_emissao_inicio    date DEFAULT NULL,
    p_data_emissao_fim       date DEFAULT NULL,
    p_conta_banco_id         int4 DEFAULT NULL,
    p_adquirente             varchar DEFAULT NULL,
    p_bandeira               varchar DEFAULT NULL,
    p_modalidade             varchar DEFAULT NULL,
    p_busca                  varchar DEFAULT NULL         -- NSU ou codigo de autorizacao
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
            valor_previsto = tab_fatura_cartao.valor_previsto + EXCLUDED.valor_previsto,
            qtd_parcelas   = tab_fatura_cartao.qtd_parcelas   + EXCLUDED.qtd_parcelas
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
