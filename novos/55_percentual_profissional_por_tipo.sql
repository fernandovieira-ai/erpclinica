SET client_encoding = 'LATIN1';

-- =============================================================
-- 55_percentual_profissional_por_tipo.sql
-- O percentual de repasse deixa de ser por tipo de atendimento
-- (igual pra todos) e passa a ser por PROFISSIONAL x TIPO.
--
-- Motivo: o valor que fica com o medico depende de quem atende
-- (socio x nao-socio, negociacao individual), nao so do tipo.
-- =============================================================

-- -------------------------------------------------------------
-- 1. TABELA: tab_profissional_tipo_percentual
--    % do valor do atendimento que fica com o profissional,
--    definido por par (profissional, tipo de atendimento).
--    A clinica fica com o restante (100 - esse valor).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tab_profissional_tipo_percentual (
  id                      SERIAL        PRIMARY KEY,
  empresa_id              INT           NOT NULL REFERENCES tab_empresa(id),
  profissional_id         INT           NOT NULL REFERENCES tab_pessoa(id)           ON DELETE CASCADE,
  tipo_id                 INT           NOT NULL REFERENCES tab_agendamento_tipo(id) ON DELETE CASCADE,
  percentual_profissional NUMERIC(5,2)  NOT NULL DEFAULT 100
                          CHECK (percentual_profissional BETWEEN 0 AND 100),
  created_at              TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMP     NOT NULL DEFAULT NOW(),
  UNIQUE (profissional_id, tipo_id)
);

CREATE INDEX IF NOT EXISTS idx_proftipopct_empresa      ON tab_profissional_tipo_percentual(empresa_id);
CREATE INDEX IF NOT EXISTS idx_proftipopct_profissional ON tab_profissional_tipo_percentual(profissional_id);
CREATE INDEX IF NOT EXISTS idx_proftipopct_tipo         ON tab_profissional_tipo_percentual(tipo_id);

COMMENT ON TABLE  tab_profissional_tipo_percentual                         IS '% de repasse do atendimento por profissional x tipo de atendimento';
COMMENT ON COLUMN tab_profissional_tipo_percentual.percentual_profissional IS '% do valor que fica com o profissional executante; a clinica fica com (100 - esse valor)';

-- -------------------------------------------------------------
-- 2. Semeia com o valor atual de tab_agendamento_tipo.percentual_profissional
--    para todo profissional ativo x todo tipo (ativo ou nao),
--    ANTES de remover a coluna. Assim nenhum par nasce sem config.
-- -------------------------------------------------------------
INSERT INTO tab_profissional_tipo_percentual (empresa_id, profissional_id, tipo_id, percentual_profissional)
SELECT t.empresa_id, p.id, t.id, COALESCE(t.percentual_profissional, 100)
  FROM tab_agendamento_tipo t
  JOIN tab_pessoa p
    ON p.empresa_id = t.empresa_id
   AND p.ind_profissional = true
   AND p.ativo = true
ON CONFLICT (profissional_id, tipo_id) DO NOTHING;

-- -------------------------------------------------------------
-- 3. Remove o percentual do tipo de atendimento (migrou pro profissional).
-- -------------------------------------------------------------
ALTER TABLE tab_agendamento_tipo DROP COLUMN IF EXISTS percentual_profissional;

-- -------------------------------------------------------------
-- 4. Snapshot do repasse no recebimento - congela o calculo no
--    momento do pagamento pra que ajuste posterior de config nao
--    altere repasse ja realizado (mesmo principio do MDR de cartao).
-- -------------------------------------------------------------
ALTER TABLE tab_recebimento_consulta
  ADD COLUMN IF NOT EXISTS percentual_profissional NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS valor_profissional      NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS valor_clinica           NUMERIC(15,2);

COMMENT ON COLUMN tab_recebimento_consulta.percentual_profissional IS '% aplicado no momento do recebimento (snapshot)';
COMMENT ON COLUMN tab_recebimento_consulta.valor_profissional      IS 'Parte do total_recebimento que fica com o profissional (snapshot)';
COMMENT ON COLUMN tab_recebimento_consulta.valor_clinica           IS 'Parte do total_recebimento que fica com a clinica (snapshot)';

-- -------------------------------------------------------------
-- 5. GRANT da tabela nova pra role do tenant (mesmo nome do database).
-- -------------------------------------------------------------
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_profissional_tipo_percentual TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_profissional_tipo_percentual_id_seq TO %I', app_role);
  END IF;
END $$;
