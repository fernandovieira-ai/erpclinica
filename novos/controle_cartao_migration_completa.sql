-- ============================================================
-- CONTROLE DE CARTÃO (CRÉDITO/DÉBITO) — MIGRATION COMPLETA
-- Ordem de execução importa (respeita as dependências de FK).
--
-- Resumo da modelagem:
--   tab_condicao_pagamento  -> centro: guarda adquirente/bandeira
--   tab_taxa_cartao         -> taxa (MDR + antecipação) por condição, com vigência
--   tab_venda_cartao        -> venda no cartão; trigger auto-preenche tudo
--                              a partir da condição de pagamento
--   tab_recebimento_cartao  -> extrato/relatório do adquirente + conciliação
--   tab_movimento_banco     -> tabela JÁ EXISTENTE; geração de lançamento
--                              agrupado por conta+adquirente+dia
--
-- Pendências que dependem de você (não automatizadas aqui):
--   1) tipo_operacao_id do INSERT em tab_movimento_banco — se você tiver
--      um tipo cadastrado em tab_tipo_operacao_caixa pra "Recebimento Cartão",
--      inclua o id no INSERT da seção 6.
--   2) confirme se trg_cli_banco_status (trigger já existente em
--      tab_movimento_banco) depende de pessoa_id — lançamento de cartão
--      não tem pessoa associada.
-- ============================================================


-- ============================================================
-- 1) tab_condicao_pagamento — adquirente/bandeira viram o centro
-- ============================================================

ALTER TABLE tab_condicao_pagamento
    ADD COLUMN adquirente varchar(30),
    ADD COLUMN bandeira   varchar(20) NOT NULL DEFAULT 'TODAS';

-- obriga adquirente quando a condição é de fato cartão
ALTER TABLE tab_condicao_pagamento
    ADD CONSTRAINT chk_cp_adquirente_cartao
    CHECK (tipo_pagamento NOT IN ('debito','credito') OR adquirente IS NOT NULL);

-- exemplo de cadastro (uma linha por combinação real que você usa):
-- INSERT INTO tab_condicao_pagamento
--   (empresa_id, descricao, tipo_pagamento, num_parcelas, intervalo_dias, adquirente, bandeira)
-- VALUES
--   (1, 'Débito Stone',        'debito',  1, 0,  'STONE', 'TODAS'),
--   (1, 'Crédito Stone 1x',    'credito', 1, 0,  'STONE', 'TODAS'),
--   (1, 'Crédito Stone 3x',    'credito', 3, 30, 'STONE', 'TODAS');


-- ============================================================
-- 2) tab_taxa_cartao — MDR + antecipação vinculados à condição
-- ============================================================

DROP TABLE IF EXISTS tab_taxa_cartao;

CREATE TABLE tab_taxa_cartao (
    id                        serial PRIMARY KEY,
    empresa_id                int4 NOT NULL REFERENCES tab_empresa(id),
    condicao_pagamento_id     int4 NOT NULL REFERENCES tab_condicao_pagamento(id),
    percentual_mdr            numeric(6,4) NOT NULL,
    percentual_antecipacao_am numeric(6,4) NOT NULL DEFAULT 0,
    prazo_recebimento_dias    smallint NOT NULL,
    data_vigencia_inicio      date NOT NULL,
    data_vigencia_fim         date,
    created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_taxa_cartao_condicao
    ON tab_taxa_cartao (condicao_pagamento_id, data_vigencia_inicio DESC);

-- empresa_id preenchido sozinho a partir da condição
CREATE OR REPLACE FUNCTION fn_trg_taxa_cartao_empresa()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    SELECT empresa_id INTO NEW.empresa_id
    FROM tab_condicao_pagamento WHERE id = NEW.condicao_pagamento_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Condição de pagamento % não existe', NEW.condicao_pagamento_id;
    END IF;

    RETURN NEW;
END;
$$;

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
-- 3) tab_venda_cartao — venda no cartão, auto-preenchida
-- ============================================================

CREATE TABLE tab_venda_cartao (
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
    created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_venda_cartao_nsu ON tab_venda_cartao (empresa_id, nsu);
CREATE INDEX idx_venda_cartao_parcelas ON tab_venda_cartao USING gin (parcelas);

-- trigger: deriva adquirente/bandeira/modalidade/parcelas/taxa e monta o
-- array de parcelas (valor líquido + data prevista) a partir da condição
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
        RAISE EXCEPTION 'Condição de pagamento % não existe', NEW.condicao_pagamento_id;
    END IF;

    IF v_cp.tipo_pagamento NOT IN ('debito','credito') THEN
        RAISE EXCEPTION 'Condição % não é cartão (tipo_pagamento=%)', NEW.condicao_pagamento_id, v_cp.tipo_pagamento;
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
        RAISE EXCEPTION 'Nenhuma taxa vigente cadastrada pra condição % na data %',
            NEW.condicao_pagamento_id, NEW.data_venda;
    END IF;

    NEW.percentual_mdr_aplicado := v_taxa.percentual_mdr;

    -- monta as parcelas: divide o valor bruto, ajusta a última pra fechar
    -- o total exato (arredondamento), calcula líquido e data prevista
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

CREATE TRIGGER trg_venda_cartao_auto
    BEFORE INSERT ON tab_venda_cartao
    FOR EACH ROW EXECUTE FUNCTION fn_trg_venda_cartao_auto();

-- exemplo de uso: só isso é necessário pra gravar a venda inteira
-- INSERT INTO tab_venda_cartao
--     (empresa_id, conta_banco_id, condicao_pagamento_id, valor_bruto, nsu, codigo_autorizacao, data_venda)
-- VALUES
--     (1, 3, 9, 500.00, '123456', '998877', now());


-- ============================================================
-- 4) tab_recebimento_cartao — extrato do adquirente + conciliação
-- ============================================================

CREATE TABLE tab_recebimento_cartao (
    id                    serial PRIMARY KEY,
    empresa_id            int4 NOT NULL REFERENCES tab_empresa(id),
    conta_banco_id        int4 NOT NULL REFERENCES tab_conta_banco(id),
    adquirente            varchar(30) NOT NULL,
    data_recebimento      date NOT NULL,
    nsu                   varchar(20),
    valor_bruto           numeric(15,2) NOT NULL,
    valor_taxa            numeric(15,2) NOT NULL DEFAULT 0,   -- MDR + antecipação já somados
    valor_liquido         numeric(15,2) NOT NULL CHECK (valor_liquido > 0),
    tipo_lancamento       varchar(20) NOT NULL DEFAULT 'VENDA'
                            CHECK (tipo_lancamento IN ('VENDA','ANTECIPACAO','AJUSTE','CHARGEBACK','CANCELAMENTO')),
    venda_cartao_id       int4 REFERENCES tab_venda_cartao(id),    -- preenchido na conciliação
    movimento_banco_id    int4 REFERENCES tab_movimento_banco(id), -- preenchido ao gerar o lançamento agrupado
    status_conciliacao    varchar(20) NOT NULL DEFAULT 'PENDENTE'
                            CHECK (status_conciliacao IN ('PENDENTE','CONCILIADO','DIVERGENTE')),
    arquivo_origem        varchar(150),
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_recebimento_cartao_match
    ON tab_recebimento_cartao (empresa_id, adquirente, nsu, data_recebimento);

CREATE INDEX idx_recebimento_cartao_pendente_banco
    ON tab_recebimento_cartao (empresa_id, conta_banco_id, adquirente, data_recebimento)
    WHERE movimento_banco_id IS NULL;


-- ============================================================
-- 5) CONCILIAÇÃO — venda x recebimento
--    Passo 1: NSU exato. Passo 2: adquirente+data+valor (±1 centavo).
--    Rode isso a cada importação de extrato/relatório do adquirente.
-- ============================================================

-- Passo 1: match exato por NSU
UPDATE tab_recebimento_cartao r
SET venda_cartao_id    = v.id,
    status_conciliacao = 'CONCILIADO'
FROM tab_venda_cartao v
WHERE r.nsu = v.nsu
  AND r.empresa_id = v.empresa_id
  AND r.tipo_lancamento = 'VENDA'
  AND r.status_conciliacao = 'PENDENTE';

-- Passo 2: fallback por adquirente + data + valor aproximado
UPDATE tab_recebimento_cartao r
SET venda_cartao_id    = cand.id_venda,
    status_conciliacao = CASE WHEN abs(cand.diferenca) <= 0.01 THEN 'CONCILIADO' ELSE 'DIVERGENTE' END
FROM LATERAL (
    SELECT v.id AS id_venda, (r.valor_bruto - v.valor_bruto) AS diferenca
    FROM tab_venda_cartao v
    WHERE v.empresa_id = r.empresa_id
      AND v.adquirente = r.adquirente
      AND v.data_venda::date = r.data_recebimento
      AND v.status = 'PENDENTE'
    ORDER BY abs(r.valor_bruto - v.valor_bruto)
    LIMIT 1
) cand
WHERE r.status_conciliacao = 'PENDENTE'
  AND r.tipo_lancamento = 'VENDA';

-- reflete o resultado de volta na venda
UPDATE tab_venda_cartao v
SET status = r.status_conciliacao
FROM tab_recebimento_cartao r
WHERE r.venda_cartao_id = v.id
  AND r.status_conciliacao IN ('CONCILIADO','DIVERGENTE');


-- ============================================================
-- 6) MOVIMENTO BANCÁRIO — gera lançamento agrupado em tab_movimento_banco
--    (a tabela já existe no seu sistema; não é criada aqui)
--    Agrupa por conta+adquirente+dia porque o depósito do adquirente
--    costuma vir em lote, não 1 por venda.
--    Rode isso depois do passo 5, sempre que houver recebimento
--    conciliado ainda sem lançamento bancário gerado.
-- ============================================================

WITH grupos AS (
    SELECT
        empresa_id,
        conta_banco_id,
        adquirente,
        data_recebimento,
        sum(valor_liquido) AS valor_total,
        sum(valor_taxa)    AS valor_taxa_total,
        count(*)           AS qtd_lancamentos,
        min(id)            AS id_referencia   -- usado só como origem_id representativo do lote
    FROM tab_recebimento_cartao
    WHERE status_conciliacao = 'CONCILIADO'
      AND movimento_banco_id IS NULL
    GROUP BY empresa_id, conta_banco_id, adquirente, data_recebimento
),
inseridos AS (
    INSERT INTO tab_movimento_banco
        (empresa_id, conta_banco_id, tipo, valor, data_movimento,
         documento, observacao, origem_modulo, origem_id, created_by)
    SELECT
        empresa_id,
        conta_banco_id,
        'E',                                     -- entrada
        valor_total,
        data_recebimento,
        adquirente,
        format('Recebimento cartão %s - %s lançamento(s) - taxa total R$ %s',
               adquirente, qtd_lancamentos, valor_taxa_total),
        'CARTAO',
        id_referencia,
        'fn_gerar_movimento_cartao'
    FROM grupos
    RETURNING id, empresa_id, conta_banco_id, data_movimento
)
UPDATE tab_recebimento_cartao r
SET movimento_banco_id = i.id
FROM inseridos i
WHERE r.empresa_id       = i.empresa_id
  AND r.conta_banco_id   = i.conta_banco_id
  AND r.data_recebimento = i.data_movimento
  AND r.status_conciliacao = 'CONCILIADO'
  AND r.movimento_banco_id IS NULL;

-- A conciliação desse lançamento com o EXTRATO (OFX) continua sendo feita
-- normalmente pelo seu módulo bancário existente: ele só vê mais um
-- registro em tab_movimento_banco com conciliado = false, igual qualquer outro.
