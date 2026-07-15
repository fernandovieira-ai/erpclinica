-- ============================================================
-- 35_controle_cartao.sql
-- CONTROLE DE CARTAO (CREDITO/DEBITO)
-- Revisao da proposta em controle_cartao_migration_completa.sql,
-- adaptada aos padroes do projeto (idempotente, LATIN1, GRANT,
-- rotinas de negocio como FUNCTION em vez de script solto).
--
-- Resumo da modelagem:
--   tab_condicao_pagamento  -> ganha adquirente/bandeira (centro da regra)
--   tab_taxa_cartao         -> taxa (MDR + antecipacao) por condicao, com vigencia
--   tab_venda_cartao        -> venda no cartao; trigger auto-preenche tudo
--                              a partir da condicao de pagamento
--   tab_recebimento_cartao  -> extrato/relatorio do adquirente + conciliacao
--   tab_movimento_banco     -> tabela JA EXISTENTE; lancamento agrupado
--                              por conta+adquirente+dia (via function)
--
-- Chamadas pela aplicacao (API):
--   SELECT * FROM fn_conciliar_recebimento_cartao($empresa_id);
--   SELECT * FROM fn_gerar_movimento_cartao($empresa_id, $usuario);
-- ============================================================

SET client_encoding = 'LATIN1';

-- ============================================================
-- 1) tab_condicao_pagamento -- adquirente/bandeira
-- ============================================================

ALTER TABLE tab_condicao_pagamento
    ADD COLUMN IF NOT EXISTS adquirente varchar(30),
    ADD COLUMN IF NOT EXISTS bandeira   varchar(20) NOT NULL DEFAULT 'TODAS';

-- obriga adquirente quando a condicao e de fato cartao
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cp_adquirente_cartao'
  ) THEN
    ALTER TABLE tab_condicao_pagamento
      ADD CONSTRAINT chk_cp_adquirente_cartao
      CHECK (tipo_pagamento NOT IN ('debito','credito') OR adquirente IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN tab_condicao_pagamento.adquirente IS 'Adquirente/maquininha (STONE, CIELO, REDE, GETNET...) - obrigatorio se tipo_pagamento=debito/credito';
COMMENT ON COLUMN tab_condicao_pagamento.bandeira   IS 'Bandeira do cartao (VISA, MASTERCARD, ELO...) ou TODAS';

-- ============================================================
-- 2) tab_taxa_cartao -- MDR + antecipacao vinculados a condicao
-- ============================================================

CREATE TABLE IF NOT EXISTS tab_taxa_cartao (
    id                        serial PRIMARY KEY,
    empresa_id                int4 NOT NULL REFERENCES tab_empresa(id),
    condicao_pagamento_id     int4 NOT NULL REFERENCES tab_condicao_pagamento(id),
    percentual_mdr            numeric(6,4) NOT NULL,
    percentual_antecipacao_am numeric(6,4) NOT NULL DEFAULT 0,
    prazo_recebimento_dias    smallint NOT NULL,
    data_vigencia_inicio      date NOT NULL,
    data_vigencia_fim         date,
    created_by                varchar(100),
    created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxa_cartao_condicao
    ON tab_taxa_cartao (condicao_pagamento_id, data_vigencia_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_taxa_cartao_empresa
    ON tab_taxa_cartao (empresa_id);

-- empresa_id preenchido sozinho a partir da condicao
CREATE OR REPLACE FUNCTION fn_trg_taxa_cartao_empresa()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    SELECT empresa_id INTO NEW.empresa_id
    FROM tab_condicao_pagamento WHERE id = NEW.condicao_pagamento_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Condicao de pagamento % nao existe', NEW.condicao_pagamento_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_taxa_cartao_empresa ON tab_taxa_cartao;
CREATE TRIGGER trg_taxa_cartao_empresa
    BEFORE INSERT ON tab_taxa_cartao
    FOR EACH ROW EXECUTE FUNCTION fn_trg_taxa_cartao_empresa();

-- busca a taxa vigente na data da venda
CREATE OR REPLACE FUNCTION fn_taxa_cartao_vigente(
    p_condicao_pagamento_id int4,
    p_data_venda            date
) RETURNS TABLE (percentual_mdr numeric, percentual_antecipacao_am numeric, prazo_recebimento_dias smallint)
LANGUAGE sql STABLE AS $$
    SELECT t.percentual_mdr, t.percentual_antecipacao_am, t.prazo_recebimento_dias
    FROM tab_taxa_cartao t
    WHERE t.condicao_pagamento_id = p_condicao_pagamento_id
      AND t.data_vigencia_inicio <= p_data_venda
      AND (t.data_vigencia_fim IS NULL OR t.data_vigencia_fim >= p_data_venda)
    ORDER BY t.data_vigencia_inicio DESC
    LIMIT 1;
$$;

-- ============================================================
-- 3) tab_venda_cartao -- venda no cartao, auto-preenchida
-- ============================================================

CREATE TABLE IF NOT EXISTS tab_venda_cartao (
    id                       serial PRIMARY KEY,
    empresa_id               int4 NOT NULL REFERENCES tab_empresa(id),
    conta_banco_id           int4 NOT NULL REFERENCES tab_conta_banco(id),
    condicao_pagamento_id    int4 NOT NULL REFERENCES tab_condicao_pagamento(id),
    titulo_receber_id        int4 REFERENCES tab_titulo_receber(id),  -- opcional
    adquirente               varchar(30),      -- auto-preenchido pelo trigger
    bandeira                 varchar(20),      -- auto-preenchido pelo trigger
    modalidade               varchar(20)
                               CHECK (modalidade IN ('DEBITO','CREDITO_VISTA','CREDITO_PARCELADO')),
    qtd_parcelas             smallint,         -- auto-preenchido pelo trigger
    valor_bruto              numeric(15,2) NOT NULL CHECK (valor_bruto > 0),
    nsu                      varchar(20),
    codigo_autorizacao       varchar(20),
    data_venda               timestamptz NOT NULL DEFAULT now(),
    percentual_mdr_aplicado  numeric(6,4),     -- auto-preenchido pelo trigger
    -- [{"n":1,"valor":100.00,"valor_liquido":97.05,"data_prevista":"2026-08-15","status":"PENDENTE"}]
    parcelas                 jsonb NOT NULL DEFAULT '[]',
    status                   varchar(20) NOT NULL DEFAULT 'PENDENTE'
                               CHECK (status IN ('PENDENTE','CONCILIADO','DIVERGENTE','CANCELADO')),
    observacao               text,
    created_by               varchar(100),
    created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_venda_cartao_nsu      ON tab_venda_cartao (empresa_id, nsu);
CREATE INDEX IF NOT EXISTS idx_venda_cartao_parcelas ON tab_venda_cartao USING gin (parcelas);
CREATE INDEX IF NOT EXISTS idx_venda_cartao_status   ON tab_venda_cartao (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_venda_cartao_data      ON tab_venda_cartao (empresa_id, data_venda);

-- trigger: deriva adquirente/bandeira/modalidade/parcelas/taxa e monta o
-- array de parcelas (valor liquido + data prevista) a partir da condicao
CREATE OR REPLACE FUNCTION fn_trg_venda_cartao_auto()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_cp         record;
    v_taxa       record;
    v_parcelas   jsonb := '[]'::jsonb;
    v_valor_parc numeric(15,2);
    v_soma       numeric(15,2) := 0;
    v_liquido    numeric(15,2);
    v_data_prev  date;
    i            int;
BEGIN
    SELECT adquirente, bandeira, tipo_pagamento, num_parcelas, intervalo_dias
      INTO v_cp
      FROM tab_condicao_pagamento
      WHERE id = NEW.condicao_pagamento_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Condicao de pagamento % nao existe', NEW.condicao_pagamento_id;
    END IF;

    IF v_cp.tipo_pagamento NOT IN ('debito','credito') THEN
        RAISE EXCEPTION 'Condicao % nao e cartao (tipo_pagamento=%)', NEW.condicao_pagamento_id, v_cp.tipo_pagamento;
    END IF;

    NEW.adquirente   := v_cp.adquirente;
    NEW.bandeira     := v_cp.bandeira;
    NEW.qtd_parcelas := v_cp.num_parcelas;
    NEW.modalidade   := CASE
                            WHEN v_cp.tipo_pagamento = 'debito' THEN 'DEBITO'
                            WHEN v_cp.num_parcelas = 1 THEN 'CREDITO_VISTA'
                            ELSE 'CREDITO_PARCELADO'
                        END;

    SELECT percentual_mdr, percentual_antecipacao_am, prazo_recebimento_dias
      INTO v_taxa
      FROM fn_taxa_cartao_vigente(NEW.condicao_pagamento_id, NEW.data_venda::date);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Nenhuma taxa vigente cadastrada pra condicao % na data %',
            NEW.condicao_pagamento_id, NEW.data_venda;
    END IF;

    NEW.percentual_mdr_aplicado := v_taxa.percentual_mdr;

    -- monta as parcelas: divide o valor bruto, ajusta a ultima pra fechar
    -- o total exato (arredondamento), calcula liquido e data prevista
    v_valor_parc := round(NEW.valor_bruto / v_cp.num_parcelas, 2);
    FOR i IN 1..v_cp.num_parcelas LOOP
        IF i = v_cp.num_parcelas THEN
            v_valor_parc := NEW.valor_bruto - v_soma;
        END IF;
        v_soma      := v_soma + v_valor_parc;
        v_liquido   := round(v_valor_parc * (1 - v_taxa.percentual_mdr / 100), 2);
        v_data_prev := NEW.data_venda::date + (v_taxa.prazo_recebimento_dias + (i - 1) * v_cp.intervalo_dias);

        v_parcelas := v_parcelas || jsonb_build_object(
            'n', i,
            'valor', v_valor_parc,
            'valor_liquido', v_liquido,
            'data_prevista', v_data_prev,
            'status', 'PENDENTE'
        );
    END LOOP;

    NEW.parcelas := v_parcelas;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venda_cartao_auto ON tab_venda_cartao;
CREATE TRIGGER trg_venda_cartao_auto
    BEFORE INSERT ON tab_venda_cartao
    FOR EACH ROW EXECUTE FUNCTION fn_trg_venda_cartao_auto();

-- ============================================================
-- 4) tab_recebimento_cartao -- extrato do adquirente + conciliacao
-- ============================================================

CREATE TABLE IF NOT EXISTS tab_recebimento_cartao (
    id                    serial PRIMARY KEY,
    empresa_id            int4 NOT NULL REFERENCES tab_empresa(id),
    conta_banco_id        int4 NOT NULL REFERENCES tab_conta_banco(id),
    adquirente            varchar(30) NOT NULL,
    data_recebimento      date NOT NULL,
    nsu                   varchar(20),
    valor_bruto           numeric(15,2) NOT NULL,
    valor_taxa            numeric(15,2) NOT NULL DEFAULT 0,   -- MDR + antecipacao ja somados
    valor_liquido         numeric(15,2) NOT NULL CHECK (valor_liquido > 0),
    tipo_lancamento       varchar(20) NOT NULL DEFAULT 'VENDA'
                            CHECK (tipo_lancamento IN ('VENDA','ANTECIPACAO','AJUSTE','CHARGEBACK','CANCELAMENTO')),
    venda_cartao_id       int4 REFERENCES tab_venda_cartao(id),    -- preenchido na conciliacao
    movimento_banco_id    int4 REFERENCES tab_movimento_banco(id), -- preenchido ao gerar o lancamento agrupado
    status_conciliacao    varchar(20) NOT NULL DEFAULT 'PENDENTE'
                            CHECK (status_conciliacao IN ('PENDENTE','CONCILIADO','DIVERGENTE')),
    arquivo_origem        varchar(150),
    observacao            text,
    created_by            varchar(100),
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recebimento_cartao_match
    ON tab_recebimento_cartao (empresa_id, adquirente, nsu, data_recebimento);

CREATE INDEX IF NOT EXISTS idx_recebimento_cartao_pendente_banco
    ON tab_recebimento_cartao (empresa_id, conta_banco_id, adquirente, data_recebimento)
    WHERE movimento_banco_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_recebimento_cartao_status
    ON tab_recebimento_cartao (empresa_id, status_conciliacao);

-- ============================================================
-- 5) FUNCTION: fn_conciliar_recebimento_cartao(empresa_id)
--    Passo 1: NSU exato. Passo 2: adquirente+data+valor (+-1 centavo).
--    Chamada pela API sempre que houver nova importacao de extrato.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_conciliar_recebimento_cartao(p_empresa_id int4)
RETURNS TABLE (qtd_conciliados int4, qtd_divergentes int4)
LANGUAGE plpgsql AS $$
DECLARE
    v_count_nsu       int4;
    v_count2_conc     int4;
    v_count2_div      int4;
BEGIN
    -- Passo 1: match exato por NSU
    UPDATE tab_recebimento_cartao r
    SET venda_cartao_id    = v.id,
        status_conciliacao = 'CONCILIADO'
    FROM tab_venda_cartao v
    WHERE r.nsu = v.nsu
      AND r.empresa_id = p_empresa_id
      AND v.empresa_id = p_empresa_id
      AND r.tipo_lancamento = 'VENDA'
      AND r.status_conciliacao = 'PENDENTE'
      AND r.nsu IS NOT NULL AND r.nsu <> '';
    GET DIAGNOSTICS v_count_nsu = ROW_COUNT;

    -- Passo 2: fallback por adquirente + data + valor aproximado
    -- (usa DISTINCT ON em vez de LATERAL: o alvo do UPDATE não pode ser
    --  referenciado de dentro de uma subquery LATERAL na cláusula FROM)
    WITH candidatos AS (
        SELECT DISTINCT ON (r.id)
               r.id AS recebimento_id, v.id AS venda_id, (r.valor_bruto - v.valor_bruto) AS diferenca
        FROM tab_recebimento_cartao r
        JOIN tab_venda_cartao v
          ON v.empresa_id  = p_empresa_id
         AND v.adquirente  = r.adquirente
         AND v.data_venda::date = r.data_recebimento
         AND v.status = 'PENDENTE'
        WHERE r.empresa_id = p_empresa_id
          AND r.status_conciliacao = 'PENDENTE'
          AND r.tipo_lancamento = 'VENDA'
        ORDER BY r.id, abs(r.valor_bruto - v.valor_bruto)
    ),
    atualizados AS (
        UPDATE tab_recebimento_cartao r
        SET venda_cartao_id    = c.venda_id,
            status_conciliacao = CASE WHEN abs(c.diferenca) <= 0.01 THEN 'CONCILIADO' ELSE 'DIVERGENTE' END
        FROM candidatos c
        WHERE r.id = c.recebimento_id
        RETURNING r.status_conciliacao
    )
    SELECT count(*) FILTER (WHERE status_conciliacao = 'CONCILIADO'),
           count(*) FILTER (WHERE status_conciliacao = 'DIVERGENTE')
      INTO v_count2_conc, v_count2_div
    FROM atualizados;

    -- reflete o resultado de volta na venda
    UPDATE tab_venda_cartao v
    SET status = r.status_conciliacao
    FROM tab_recebimento_cartao r
    WHERE r.venda_cartao_id = v.id
      AND v.empresa_id = p_empresa_id
      AND r.status_conciliacao IN ('CONCILIADO','DIVERGENTE');

    RETURN QUERY SELECT (v_count_nsu + COALESCE(v_count2_conc, 0)), COALESCE(v_count2_div, 0);
END;
$$;

-- ============================================================
-- 6) FUNCTION: fn_gerar_movimento_cartao(empresa_id, created_by)
--    Gera lancamento agrupado em tab_movimento_banco por
--    conta+adquirente+dia (o deposito do adquirente costuma vir
--    em lote, nao 1 por venda). Chamada pela API apos conciliar.
--
--    origem_modulo = 'CARTAO' (nao 'CLI') e pessoa_id nao informado
--    de proposito: trg_cli_banco_status so age em origem_modulo='CLI',
--    entao nao ha conflito com o fluxo do modulo clinica.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_gerar_movimento_cartao(p_empresa_id int4, p_created_by varchar)
RETURNS TABLE (movimentos_gerados int4, valor_total numeric)
LANGUAGE plpgsql AS $$
DECLARE
    v_tipo_operacao_id int4;
    v_count            int4;
    v_total            numeric;
BEGIN
    -- tipo de operacao "Recebimento Cartao" se ja cadastrado (opcional)
    SELECT id INTO v_tipo_operacao_id
    FROM tab_tipo_operacao_caixa
    WHERE empresa_id = p_empresa_id AND tipo = 'E' AND descricao ILIKE '%CART%'
    ORDER BY id LIMIT 1;

    -- os aliases da CTE não podem se chamar "valor_total" (colide com o OUT
    -- param de mesmo nome do RETURNS TABLE e gera erro de ambiguidade)
    WITH grupos AS (
        SELECT
            empresa_id,
            conta_banco_id,
            adquirente,
            data_recebimento,
            sum(valor_liquido) AS total_liquido,
            sum(valor_taxa)    AS total_taxa,
            count(*)           AS qtd_lancamentos,
            min(id)            AS id_referencia   -- origem_id representativo do lote
        FROM tab_recebimento_cartao
        WHERE empresa_id = p_empresa_id
          AND status_conciliacao = 'CONCILIADO'
          AND movimento_banco_id IS NULL
        GROUP BY empresa_id, conta_banco_id, adquirente, data_recebimento
    ),
    inseridos AS (
        INSERT INTO tab_movimento_banco
            (empresa_id, conta_banco_id, tipo_operacao_id, tipo, valor, data_movimento,
             documento, observacao, origem_modulo, origem_id, created_by)
        SELECT
            empresa_id,
            conta_banco_id,
            v_tipo_operacao_id,
            'E',                                     -- entrada
            total_liquido,
            data_recebimento,
            adquirente,
            format('RECEBIMENTO CARTAO %s - %s LANCAMENTO(S) - TAXA TOTAL R$ %s',
                   adquirente, qtd_lancamentos, total_taxa),
            'CARTAO',
            id_referencia,
            p_created_by
        FROM grupos
        RETURNING id, empresa_id, conta_banco_id, data_movimento, valor
    ),
    atualizados AS (
        UPDATE tab_recebimento_cartao r
        SET movimento_banco_id = i.id
        FROM inseridos i
        WHERE r.empresa_id       = i.empresa_id
          AND r.conta_banco_id   = i.conta_banco_id
          AND r.data_recebimento = i.data_movimento
          AND r.status_conciliacao = 'CONCILIADO'
          AND r.movimento_banco_id IS NULL
        RETURNING r.id
    )
    SELECT count(*)::int4, COALESCE(sum(valor), 0) INTO v_count, v_total FROM inseridos;

    RETURN QUERY SELECT v_count, v_total;
END;
$$;

-- ============================================================
-- 7) GRANT -- role de aplicacao tem o mesmo nome do database
-- ============================================================

DO $$
DECLARE
  app_role text := current_database();
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_taxa_cartao TO %I', app_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_venda_cartao TO %I', app_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_recebimento_cartao TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_taxa_cartao_id_seq TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_venda_cartao_id_seq TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_recebimento_cartao_id_seq TO %I', app_role);
  END IF;
END $$;

-- ============================================================
-- RESUMO
-- ============================================================
-- trg_taxa_cartao_empresa  -> BEFORE INSERT ON tab_taxa_cartao
--   preenche empresa_id a partir da condicao de pagamento
--
-- trg_venda_cartao_auto    -> BEFORE INSERT ON tab_venda_cartao
--   deriva adquirente/bandeira/modalidade/parcelas/taxa vigente
--
-- fn_conciliar_recebimento_cartao(empresa_id)
--   -> chamar apos toda importacao/lancamento de extrato do adquirente
--
-- fn_gerar_movimento_cartao(empresa_id, created_by)
--   -> chamar apos conciliar, agrupa recebimentos conciliados sem
--      movimento_banco_id em 1 lancamento por conta+adquirente+dia
--
-- A conciliacao desse lancamento com o EXTRATO BANCARIO (OFX) continua
-- sendo feita normalmente pelo modulo bancario existente: ele so ve
-- mais um registro em tab_movimento_banco com conciliado=false.
