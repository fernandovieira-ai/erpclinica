-- ============================================================
-- 39_estorno_remove_fatura_cancelada.sql
-- Ajuste pedido: estornar uma fatura ainda ABERTA (desfazer a
-- geracao) nao deve deixar um registro "CANCELADA" acumulado em
-- tab_fatura_cartao -- o registro simplesmente some (DELETE), ja
-- que as parcelas voltam pra PENDENTE e sao re-agrupadas do zero
-- na proxima geracao.
--
-- fn_gerar_faturas_cartao nao precisa mudar: continua funcionando
-- normalmente (INSERT puro, sem conflito) porque a linha cancelada
-- nao existe mais pra colidir com a chave unica.
-- ============================================================

SET client_encoding = 'LATIN1';

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
        -- libera as parcelas primeiro (tira a FK) e so entao apaga a
        -- fatura -- sem isso sobraria um registro CANCELADA acumulado
        UPDATE tab_venda_cartao_parcela
        SET status = 'PENDENTE', fatura_cartao_id = NULL
        WHERE fatura_cartao_id = p_fatura_id AND status = 'FATURADA';

        DELETE FROM tab_fatura_cartao WHERE id = p_fatura_id;

        RETURN 'FATURA_REMOVIDA';

    ELSE
        RAISE EXCEPTION 'Fatura % ja esta cancelada, nao ha o que estornar', p_fatura_id;
    END IF;
END;
$$;
