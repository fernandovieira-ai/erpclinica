-- ============================================================
-- 38_estorno_fatura_cartao.sql
-- Ate aqui so era possivel avancar o fluxo de cartao (gerar fatura,
-- confirmar fatura). Nao havia como desfazer nada: uma fatura
-- confirmada por engano ficava presa com o movimento bancario
-- errado, e uma fatura gerada com o filtro errado nao liberava
-- as parcelas de volta pra serem re-agrupadas.
--
-- fn_estornar_fatura_cartao(fatura_id, created_by) resolve os dois
-- casos, decidindo a acao pelo status atual da fatura:
--   CONFIRMADA -> estorna a confirmacao: apaga o tab_movimento_banco
--                 (bloqueia se ja foi conciliado no extrato -- tem
--                 que desconciliar no modulo bancario antes), volta
--                 fatura pra ABERTA e parcelas de CONCILIADA pra FATURADA.
--   ABERTA     -> cancela a fatura (desfaz a geracao): parcelas voltam
--                 pra PENDENTE (sem fatura_cartao_id) para poderem ser
--                 re-agrupadas por fn_gerar_faturas_cartao numa proxima
--                 geracao; fatura fica CANCELADA com totais zerados.
--   CANCELADA  -> nao ha o que estornar.
--
-- fn_gerar_faturas_cartao tambem precisa saber reabrir (status ABERTA)
-- uma fatura CANCELADA quando o mesmo grupo conta+adquirente+data
-- aparecer de novo numa geracao futura -- sem isso a chave unica
-- (empresa,conta,adquirente,data_prevista) faria o ON CONFLICT cair
-- numa fatura cancelada e ela nunca reapareceria como ABERTA.
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

-- ============================================================
-- FUNCTION: fn_estornar_fatura_cartao(fatura_id, created_by)
-- ============================================================

CREATE OR REPLACE FUNCTION fn_estornar_fatura_cartao(p_fatura_id int4, p_created_by varchar)
RETURNS varchar
LANGUAGE plpgsql AS $$
DECLARE
    v_fatura     record;
    v_conciliado boolean;
BEGIN
    SELECT * INTO v_fatura FROM tab_fatura_cartao WHERE id = p_fatura_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fatura % nao encontrada', p_fatura_id;
    END IF;

    IF v_fatura.status = 'CONFIRMADA' THEN
        IF v_fatura.movimento_banco_id IS NOT NULL THEN
            SELECT conciliado INTO v_conciliado FROM tab_movimento_banco WHERE id = v_fatura.movimento_banco_id;
            IF COALESCE(v_conciliado, false) THEN
                RAISE EXCEPTION 'O lancamento bancario desta fatura ja foi conciliado com o extrato -- desconcilie no modulo bancario antes de estornar';
            END IF;
        END IF;

        -- precisa zerar a FK em tab_fatura_cartao antes de apagar o
        -- tab_movimento_banco referenciado, senao viola a constraint
        UPDATE tab_fatura_cartao
        SET status = 'ABERTA',
            valor_cobrado = NULL,
            movimento_banco_id = NULL,
            data_confirmacao = NULL
        WHERE id = p_fatura_id;

        IF v_fatura.movimento_banco_id IS NOT NULL THEN
            DELETE FROM tab_movimento_banco WHERE id = v_fatura.movimento_banco_id;
        END IF;

        UPDATE tab_venda_cartao_parcela
        SET status = 'FATURADA'
        WHERE fatura_cartao_id = p_fatura_id AND status = 'CONCILIADA';

        RETURN 'CONFIRMACAO_ESTORNADA';

    ELSIF v_fatura.status = 'ABERTA' THEN
        UPDATE tab_venda_cartao_parcela
        SET status = 'PENDENTE', fatura_cartao_id = NULL
        WHERE fatura_cartao_id = p_fatura_id AND status = 'FATURADA';

        UPDATE tab_fatura_cartao
        SET status = 'CANCELADA', valor_previsto = 0, qtd_parcelas = 0
        WHERE id = p_fatura_id;

        RETURN 'FATURA_CANCELADA';

    ELSE
        RAISE EXCEPTION 'Fatura % ja esta cancelada, nao ha o que estornar', p_fatura_id;
    END IF;
END;
$$;
