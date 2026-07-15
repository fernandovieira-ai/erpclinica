-- ============================================================
-- 36_fatura_cartao.sql
-- Reformula o controle de cartao (35_controle_cartao.sql) para o
-- fluxo real do negocio:
--
--   1) Recebimento de consulta / receita / baixa de titulo com
--      condicao de pagamento debito/credito GERA AUTOMATICAMENTE
--      uma tab_venda_cartao (nao existe mais tela manual de "venda").
--      Nenhum movimento de caixa/banco eh criado nesse momento --
--      cartao so vira dinheiro na conta dias depois.
--   2) As parcelas prevdefinidas de cada venda (agora numa tabela
--      propria, nao mais um jsonb) sao agrupadas automaticamente em
--      FATURAS por conta+adquirente+data prevista de recebimento.
--   3) O usuario confere a fatura contra o que a operadora realmente
--      cobrou/depositou (pode ajustar o valor) e confirma -- so ai
--      eh gerado o tab_movimento_banco na conta.
--
-- Substitui por completo o modelo de "Recebimentos de Cartao"
-- manual (extrato digitado a mao) criado em 35_controle_cartao.sql.
-- ============================================================

SET client_encoding = 'LATIN1';

-- ============================================================
-- 1) tab_condicao_pagamento -- conta bancaria da maquininha
--    (equivalente ao conta_banco_pix_id, so que para debito/credito)
-- ============================================================

ALTER TABLE tab_condicao_pagamento
    ADD COLUMN IF NOT EXISTS conta_banco_cartao_id int4 REFERENCES tab_conta_banco(id);

COMMENT ON COLUMN tab_condicao_pagamento.conta_banco_cartao_id IS 'Conta bancaria que recebe o deposito do adquirente -- obrigatorio se tipo_pagamento=debito/credito';

CREATE INDEX IF NOT EXISTS idx_cp_conta_banco_cartao ON tab_condicao_pagamento(conta_banco_cartao_id);

-- ============================================================
-- 2) tab_recebimento_consulta -- vinculo com a venda no cartao
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tab_recebimento_consulta') THEN
    ALTER TABLE tab_recebimento_consulta
      ADD COLUMN IF NOT EXISTS venda_cartao_id int4 REFERENCES tab_venda_cartao(id);
    CREATE INDEX IF NOT EXISTS idx_rc_venda_cartao ON tab_recebimento_consulta(venda_cartao_id);
  END IF;
END $$;

-- ============================================================
-- 3) tab_venda_cartao -- remove o jsonb de parcelas e o status
--    de conciliacao (que agora vive na parcela, nao na venda)
-- ============================================================

ALTER TABLE tab_venda_cartao DROP COLUMN IF EXISTS parcelas;
DROP INDEX IF EXISTS idx_venda_cartao_parcelas;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tab_venda_cartao_status_check') THEN
    ALTER TABLE tab_venda_cartao DROP CONSTRAINT tab_venda_cartao_status_check;
  END IF;
END $$;

ALTER TABLE tab_venda_cartao
  ALTER COLUMN status SET DEFAULT 'PENDENTE',
  ADD CONSTRAINT tab_venda_cartao_status_check CHECK (status IN ('PENDENTE','CANCELADO'));

UPDATE tab_venda_cartao SET status = 'PENDENTE' WHERE status NOT IN ('PENDENTE','CANCELADO');

COMMENT ON COLUMN tab_venda_cartao.status IS 'PENDENTE|CANCELADO -- conciliacao real acontece por parcela, ver tab_venda_cartao_parcela';

-- ============================================================
-- 4) tab_venda_cartao_parcela -- parcelas normalizadas (1 linha
--    por parcela, era um jsonb antes)
-- ============================================================

CREATE TABLE IF NOT EXISTS tab_venda_cartao_parcela (
    id                serial PRIMARY KEY,
    venda_cartao_id   int4 NOT NULL REFERENCES tab_venda_cartao(id),
    numero_parcela    smallint NOT NULL,
    valor             numeric(15,2) NOT NULL,
    valor_liquido     numeric(15,2) NOT NULL,
    data_prevista     date NOT NULL,
    status            varchar(20) NOT NULL DEFAULT 'PENDENTE'
                        CHECK (status IN ('PENDENTE','FATURADA','CONCILIADA','CANCELADA')),
    fatura_cartao_id  int4,  -- FK adicionada apos criar tab_fatura_cartao
    UNIQUE (venda_cartao_id, numero_parcela)
);

CREATE INDEX IF NOT EXISTS idx_vcp_venda        ON tab_venda_cartao_parcela(venda_cartao_id);
CREATE INDEX IF NOT EXISTS idx_vcp_fatura        ON tab_venda_cartao_parcela(fatura_cartao_id);
CREATE INDEX IF NOT EXISTS idx_vcp_pendente_data  ON tab_venda_cartao_parcela(data_prevista) WHERE status = 'PENDENTE';

-- ============================================================
-- 5) tab_fatura_cartao -- agrupamento do que se espera receber
--    do adquirente por conta+adquirente+data prevista
-- ============================================================

CREATE TABLE IF NOT EXISTS tab_fatura_cartao (
    id                  serial PRIMARY KEY,
    empresa_id          int4 NOT NULL REFERENCES tab_empresa(id),
    conta_banco_id      int4 NOT NULL REFERENCES tab_conta_banco(id),
    adquirente          varchar(30) NOT NULL,
    data_prevista       date NOT NULL,
    valor_previsto      numeric(15,2) NOT NULL DEFAULT 0,
    valor_cobrado       numeric(15,2),   -- preenchido na confirmacao (o que a operadora realmente depositou)
    qtd_parcelas        int4 NOT NULL DEFAULT 0,
    status              varchar(20) NOT NULL DEFAULT 'ABERTA'
                          CHECK (status IN ('ABERTA','CONFIRMADA','CANCELADA')),
    movimento_banco_id  int4 REFERENCES tab_movimento_banco(id),
    data_confirmacao    date,
    observacao          text,
    created_by          varchar(100),
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, conta_banco_id, adquirente, data_prevista)
);

CREATE INDEX IF NOT EXISTS idx_fatura_cartao_status ON tab_fatura_cartao(empresa_id, status);

ALTER TABLE tab_venda_cartao_parcela
  DROP CONSTRAINT IF EXISTS tab_venda_cartao_parcela_fatura_cartao_id_fkey;
ALTER TABLE tab_venda_cartao_parcela
  ADD CONSTRAINT tab_venda_cartao_parcela_fatura_cartao_id_fkey
  FOREIGN KEY (fatura_cartao_id) REFERENCES tab_fatura_cartao(id);

-- ============================================================
-- 6) TRIGGERS de tab_venda_cartao -- divididas em duas:
--    BEFORE INSERT preenche os campos derivados da condicao;
--    AFTER INSERT cria as parcelas (precisa do NEW.id).
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

    RETURN NEW;
END;
$$;

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
            (venda_cartao_id, numero_parcela, valor, valor_liquido, data_prevista)
        VALUES
            (NEW.id, i, v_valor_parc, v_liquido, v_data_prev);
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venda_cartao_auto ON tab_venda_cartao;
CREATE TRIGGER trg_venda_cartao_auto
    BEFORE INSERT ON tab_venda_cartao
    FOR EACH ROW EXECUTE FUNCTION fn_trg_venda_cartao_auto();

DROP TRIGGER IF EXISTS trg_venda_cartao_parcelas ON tab_venda_cartao;
CREATE TRIGGER trg_venda_cartao_parcelas
    AFTER INSERT ON tab_venda_cartao
    FOR EACH ROW EXECUTE FUNCTION fn_trg_venda_cartao_parcelas();

-- ============================================================
-- 7) Remove o modelo antigo de extrato manual (35_controle_cartao.sql)
-- ============================================================

DROP FUNCTION IF EXISTS fn_conciliar_recebimento_cartao(int4);
DROP FUNCTION IF EXISTS fn_gerar_movimento_cartao(int4, varchar);
DROP TABLE IF EXISTS tab_recebimento_cartao;

-- ============================================================
-- 8) FUNCTION: fn_gerar_faturas_cartao(empresa_id, data_referencia)
--    Agrupa as parcelas pendentes com vencimento ate a data de
--    referencia por conta+adquirente+data prevista. Idempotente:
--    rodar de novo so soma o que ainda nao tinha sido faturado
--    (fatura existente do mesmo dia/conta/adquirente eh reaproveitada).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_gerar_faturas_cartao(p_empresa_id int4, p_data_referencia date DEFAULT CURRENT_DATE)
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

-- ============================================================
-- 9) FUNCTION: fn_confirmar_fatura_cartao(fatura_id, valor_cobrado, created_by)
--    Fecha a fatura com o valor que a operadora realmente
--    depositou/cobrou e gera o movimento bancario de entrada.
--    So aqui o dinheiro do cartao vira, de fato, saldo em conta.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_confirmar_fatura_cartao(p_fatura_id int4, p_valor_cobrado numeric, p_created_by varchar)
RETURNS int4
LANGUAGE plpgsql AS $$
DECLARE
    v_fatura record;
    v_mov_id int4;
BEGIN
    SELECT * INTO v_fatura FROM tab_fatura_cartao WHERE id = p_fatura_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fatura % nao encontrada', p_fatura_id;
    END IF;
    IF v_fatura.status <> 'ABERTA' THEN
        RAISE EXCEPTION 'Fatura % ja esta %, nao pode ser confirmada novamente', p_fatura_id, v_fatura.status;
    END IF;

    INSERT INTO tab_movimento_banco
        (empresa_id, conta_banco_id, tipo, valor, data_movimento, documento, observacao, origem_modulo, origem_id, created_by)
    VALUES
        (v_fatura.empresa_id, v_fatura.conta_banco_id, 'E', COALESCE(p_valor_cobrado, v_fatura.valor_previsto),
         CURRENT_DATE, v_fatura.adquirente,
         format('FATURA CARTAO %s - %s PARCELA(S) - PREVISTO R$ %s', v_fatura.adquirente, v_fatura.qtd_parcelas, v_fatura.valor_previsto),
         'CARTAO', v_fatura.id, p_created_by)
    RETURNING id INTO v_mov_id;

    UPDATE tab_fatura_cartao
    SET status = 'CONFIRMADA',
        valor_cobrado    = COALESCE(p_valor_cobrado, v_fatura.valor_previsto),
        movimento_banco_id = v_mov_id,
        data_confirmacao = CURRENT_DATE
    WHERE id = p_fatura_id;

    UPDATE tab_venda_cartao_parcela
    SET status = 'CONCILIADA'
    WHERE fatura_cartao_id = p_fatura_id;

    RETURN v_mov_id;
END;
$$;

-- ============================================================
-- 10) GRANT -- role de aplicacao tem o mesmo nome do database
-- ============================================================

DO $$
DECLARE
  app_role text := current_database();
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_venda_cartao_parcela TO %I', app_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_fatura_cartao TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_venda_cartao_parcela_id_seq TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_fatura_cartao_id_seq TO %I', app_role);
  END IF;
END $$;

-- ============================================================
-- RESUMO
-- ============================================================
-- trg_venda_cartao_auto      -> BEFORE INSERT ON tab_venda_cartao
--   deriva adquirente/bandeira/modalidade/qtd_parcelas/taxa vigente
-- trg_venda_cartao_parcelas  -> AFTER INSERT ON tab_venda_cartao
--   gera as N linhas em tab_venda_cartao_parcela (valor liquido + data prevista)
--
-- fn_gerar_faturas_cartao(empresa_id, data_referencia default hoje)
--   -> agrupa parcelas pendentes vencidas/vencendo em tab_fatura_cartao
--      por conta+adquirente+data prevista (idempotente)
--
-- fn_confirmar_fatura_cartao(fatura_id, valor_cobrado, created_by)
--   -> gera tab_movimento_banco (entrada) e marca fatura/parcelas como conciliadas
