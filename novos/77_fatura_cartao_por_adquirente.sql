-- ============================================================
-- 77_fatura_cartao_por_adquirente.sql
-- Ajuste pedido pelo cliente: a fatura de cartao agrupava por
-- conta+adquirente+data_prevista, o que na pratica gerava uma fatura
-- por data (quase 1 por titulo, ja que cada parcela tem sua propria
-- data prevista de recebimento). O certo e agrupar so por ADQUIRENTE:
-- tudo que o usuario selecionar na tela entra numa fatura so por
-- adquirente, somando os valores (ex: titulo de R$10 + R$20 + R$30 =
-- 1 fatura de R$60), e a conta bancaria so e escolhida na hora da
-- confirmacao/baixa (o cartao fica "aberto" e so depois e baixado
-- numa conta especifica, quando o dinheiro de fato cai).
--
-- Mudancas:
--  1) tab_fatura_cartao.conta_banco_id passa a ser NULLABLE -- fica
--     vazio enquanto a fatura esta ABERTA, preenchido so na
--     confirmacao (fn_confirmar_fatura_cartao ganha o parametro
--     p_conta_banco_id).
--  2) Chave unica antiga (empresa,conta,adquirente,data_prevista) cai;
--     entra um indice unico parcial por (empresa,adquirente) valido
--     so enquanto status='ABERTA' -- cada adquirente tem no maximo
--     1 fatura aberta por vez, que vai crescendo a cada geracao ate
--     ser confirmada; depois disso uma nova geracao abre outra.
--  3) fn_gerar_faturas_cartao e fn_gerar_faturas_cartao_selecao
--     agrupam so por adquirente (data_prevista guardada passa a ser
--     a MIN das parcelas incluidas, so como referencia/ordenacao).
--  4) tab_fatura_cartao ganha valor_desconto/valor_acrescimo (padrao
--     ja usado em tab_titulo_receber -- Original/Juros/Multa/Desconto
--     -> Liquido, ver TituloReceberFormPage). fn_confirmar_fatura_cartao
--     exige a conta bancaria escolhida pelo usuario na baixa, recebe
--     desconto/acrescimo/data de confirmacao e calcula o valor cobrado
--     (valor_previsto - desconto + acrescimo) em vez de aceitar um
--     valor livre digitado.
--  5) fn_estornar_fatura_cartao volta conta_banco_id/desconto/acrescimo
--     pra NULL/0 ao desfazer uma confirmacao (senao a fatura reaberta
--     ficaria com dados "fantasma" de uma baixa que foi desfeita).
--  6) fn_confirmar_fatura_cartao valida que a conta bancaria informada
--     pertence a mesma empresa da fatura (senao um payload manipulado
--     pelo cliente poderia gerar movimento_banco numa conta de outra
--     empresa) e arredonda os valores com ROUND(...,2) antes de gravar
--     (evita resíduo de ponto flutuante vindo do client).
-- ============================================================

SET client_encoding = 'LATIN1';

-- ------------------------------------------------------------
-- 1) conta_banco_id nullable + troca da chave unica
-- ------------------------------------------------------------

ALTER TABLE tab_fatura_cartao ALTER COLUMN conta_banco_id DROP NOT NULL;

ALTER TABLE tab_fatura_cartao
  DROP CONSTRAINT IF EXISTS tab_fatura_cartao_empresa_id_conta_banco_id_adquirente_data_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fatura_cartao_aberta_adquirente
  ON tab_fatura_cartao (empresa_id, adquirente)
  WHERE status = 'ABERTA';

COMMENT ON COLUMN tab_fatura_cartao.conta_banco_id IS 'Conta bancaria que recebeu o deposito -- preenchida so na confirmacao/baixa, nao na geracao (fatura agrupa so por adquirente)';

ALTER TABLE tab_fatura_cartao
  ADD COLUMN IF NOT EXISTS valor_desconto  numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_acrescimo numeric(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN tab_fatura_cartao.valor_desconto  IS 'Ajuste informado na confirmacao/baixa (ex: tarifa do adquirente) -- reduz o valor cobrado em relacao ao previsto';
COMMENT ON COLUMN tab_fatura_cartao.valor_acrescimo IS 'Ajuste informado na confirmacao/baixa -- aumenta o valor cobrado em relacao ao previsto';

-- ------------------------------------------------------------
-- 2) fn_gerar_faturas_cartao -- agrupamento por filtro de data
-- ------------------------------------------------------------

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
        SELECT p.id AS parcela_id, v.adquirente, p.data_prevista, p.valor_liquido
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
        SELECT adquirente,
               min(data_prevista) AS data_prevista,
               sum(valor_liquido) AS total_previsto,
               count(*)           AS qtd
        FROM pendentes
        GROUP BY adquirente
    ),
    faturas AS (
        INSERT INTO tab_fatura_cartao
            (empresa_id, adquirente, data_prevista, valor_previsto, qtd_parcelas, created_by)
        SELECT p_empresa_id, adquirente, data_prevista, total_previsto, qtd, 'fn_gerar_faturas_cartao'
        FROM grupos
        ON CONFLICT (empresa_id, adquirente) WHERE (status = 'ABERTA')
        DO UPDATE SET
            valor_previsto = tab_fatura_cartao.valor_previsto + EXCLUDED.valor_previsto,
            qtd_parcelas   = tab_fatura_cartao.qtd_parcelas   + EXCLUDED.qtd_parcelas,
            data_prevista  = LEAST(tab_fatura_cartao.data_prevista, EXCLUDED.data_prevista)
        RETURNING id, adquirente
    ),
    atualiza_parcelas AS (
        UPDATE tab_venda_cartao_parcela p
        SET status = 'FATURADA', fatura_cartao_id = f.id
        FROM pendentes pd
        JOIN faturas f ON f.adquirente = pd.adquirente
        WHERE p.id = pd.parcela_id
        RETURNING p.id
    )
    SELECT count(*)::int4, COALESCE((SELECT sum(total_previsto) FROM grupos), 0)
      INTO v_count, v_total
    FROM faturas;

    RETURN QUERY SELECT v_count, v_total;
END;
$$;

-- ------------------------------------------------------------
-- 3) fn_gerar_faturas_cartao_selecao -- agrupamento pela selecao
--    manual do usuario (a usada pela tela hoje)
-- ------------------------------------------------------------

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
        SELECT p.id AS parcela_id, v.adquirente, p.data_prevista, p.valor_liquido
        FROM tab_venda_cartao_parcela p
        JOIN tab_venda_cartao v ON v.id = p.venda_cartao_id
        WHERE v.empresa_id = p_empresa_id
          AND v.status = 'PENDENTE'
          AND p.status = 'PENDENTE'
          AND p.id = ANY(p_parcela_ids)
        FOR UPDATE OF p
    ),
    grupos AS (
        SELECT adquirente,
               min(data_prevista) AS data_prevista,
               sum(valor_liquido) AS total_previsto,
               count(*)           AS qtd
        FROM pendentes
        GROUP BY adquirente
    ),
    faturas AS (
        INSERT INTO tab_fatura_cartao
            (empresa_id, adquirente, data_prevista, valor_previsto, qtd_parcelas, created_by)
        SELECT p_empresa_id, adquirente, data_prevista, total_previsto, qtd, p_created_by
        FROM grupos
        ON CONFLICT (empresa_id, adquirente) WHERE (status = 'ABERTA')
        DO UPDATE SET
            valor_previsto = tab_fatura_cartao.valor_previsto + EXCLUDED.valor_previsto,
            qtd_parcelas   = tab_fatura_cartao.qtd_parcelas   + EXCLUDED.qtd_parcelas,
            data_prevista  = LEAST(tab_fatura_cartao.data_prevista, EXCLUDED.data_prevista)
        RETURNING id, adquirente
    ),
    atualiza_parcelas AS (
        UPDATE tab_venda_cartao_parcela p
        SET status = 'FATURADA', fatura_cartao_id = f.id
        FROM pendentes pd
        JOIN faturas f ON f.adquirente = pd.adquirente
        WHERE p.id = pd.parcela_id
        RETURNING p.id
    )
    SELECT count(*)::int4, COALESCE((SELECT sum(total_previsto) FROM grupos), 0)
      INTO v_count, v_total
    FROM faturas;

    RETURN QUERY SELECT v_count, v_total;
END;
$$;

-- ------------------------------------------------------------
-- 4) fn_confirmar_fatura_cartao -- agora recebe a conta bancaria
--    escolhida na baixa, desconto/acrescimo e data de confirmacao
--    (assinatura mudou, precisa DROP antes). Valor cobrado deixa de
--    ser digitado livre e passa a ser calculado: previsto - desconto
--    + acrescimo -- mesmo padrao de tab_titulo_receber (Original +
--    Juros + Multa - Desconto - Retencao = Liquido).
-- ------------------------------------------------------------

DROP FUNCTION IF EXISTS fn_confirmar_fatura_cartao(int4, numeric, varchar);
DROP FUNCTION IF EXISTS fn_confirmar_fatura_cartao(int4, int4, numeric, varchar);

CREATE OR REPLACE FUNCTION fn_confirmar_fatura_cartao(
    p_fatura_id         int4,
    p_conta_banco_id    int4,
    p_valor_desconto    numeric,
    p_valor_acrescimo   numeric,
    p_data_confirmacao  date,
    p_created_by        varchar
)
RETURNS int4
LANGUAGE plpgsql AS $$
DECLARE
    v_fatura          record;
    v_mov_id          int4;
    v_valor_desconto  numeric(15,2);
    v_valor_acrescimo numeric(15,2);
    v_valor_cobrado   numeric(15,2);
    v_data            date;
BEGIN
    SELECT * INTO v_fatura FROM tab_fatura_cartao WHERE id = p_fatura_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fatura % nao encontrada', p_fatura_id;
    END IF;
    IF v_fatura.status <> 'ABERTA' THEN
        RAISE EXCEPTION 'Fatura % ja esta %, nao pode ser confirmada novamente', p_fatura_id, v_fatura.status;
    END IF;
    IF p_conta_banco_id IS NULL THEN
        RAISE EXCEPTION 'Informe a conta bancaria que recebeu o deposito';
    END IF;
    -- impede que uma fatura de uma empresa seja baixada numa conta bancaria
    -- de outra empresa (ex: payload manipulado pelo cliente)
    IF NOT EXISTS (
        SELECT 1 FROM tab_conta_banco cb
        WHERE cb.id = p_conta_banco_id AND cb.empresa_id = v_fatura.empresa_id
    ) THEN
        RAISE EXCEPTION 'A conta bancaria informada nao pertence a empresa desta fatura';
    END IF;
    IF COALESCE(p_valor_desconto, 0) < 0 OR COALESCE(p_valor_acrescimo, 0) < 0 THEN
        RAISE EXCEPTION 'Desconto e acrescimo devem ser maiores ou iguais a zero';
    END IF;

    v_valor_desconto  := ROUND(COALESCE(p_valor_desconto, 0), 2);
    v_valor_acrescimo := ROUND(COALESCE(p_valor_acrescimo, 0), 2);
    v_valor_cobrado   := ROUND(v_fatura.valor_previsto - v_valor_desconto + v_valor_acrescimo, 2);
    IF v_valor_cobrado <= 0 THEN
        RAISE EXCEPTION 'O valor liquido da fatura deve ser maior que zero';
    END IF;
    v_data := COALESCE(p_data_confirmacao, CURRENT_DATE);

    INSERT INTO tab_movimento_banco
        (empresa_id, conta_banco_id, tipo, valor, data_movimento, documento, observacao, origem_modulo, origem_id, created_by)
    VALUES
        (v_fatura.empresa_id, p_conta_banco_id, 'E', v_valor_cobrado,
         v_data, v_fatura.adquirente,
         format('FATURA CARTAO %s - %s PARCELA(S) - PREVISTO R$ %s', v_fatura.adquirente, v_fatura.qtd_parcelas, v_fatura.valor_previsto),
         'CARTAO', v_fatura.id, p_created_by)
    RETURNING id INTO v_mov_id;

    UPDATE tab_fatura_cartao
    SET status              = 'CONFIRMADA',
        conta_banco_id      = p_conta_banco_id,
        valor_desconto      = v_valor_desconto,
        valor_acrescimo     = v_valor_acrescimo,
        valor_cobrado       = v_valor_cobrado,
        movimento_banco_id  = v_mov_id,
        data_confirmacao    = v_data
    WHERE id = p_fatura_id;

    UPDATE tab_venda_cartao_parcela
    SET status = 'CONCILIADA'
    WHERE fatura_cartao_id = p_fatura_id;

    RETURN v_mov_id;
END;
$$;

-- ------------------------------------------------------------
-- 5) fn_estornar_fatura_cartao -- limpa conta_banco_id ao
--    estornar uma confirmacao (assinatura nao muda)
-- ------------------------------------------------------------

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
            conta_banco_id = NULL,
            valor_cobrado = NULL,
            valor_desconto = 0,
            valor_acrescimo = 0,
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

        DELETE FROM tab_fatura_cartao WHERE id = p_fatura_id;

        RETURN 'FATURA_REMOVIDA';

    ELSE
        RAISE EXCEPTION 'Fatura % ja esta cancelada, nao ha o que estornar', p_fatura_id;
    END IF;
END;
$$;
