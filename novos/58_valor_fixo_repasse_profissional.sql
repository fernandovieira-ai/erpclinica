SET client_encoding = 'LATIN1';

-- =============================================================
-- 58_valor_fixo_repasse_profissional.sql
-- Repasse do profissional por VALOR FIXO (alem do percentual).
--
-- Regra: quando percentual_profissional = 0, o profissional recebe
-- um valor fixo por atendimento (valor_fixo) e a clinica fica com
-- o restante do que foi recebido. Com percentual > 0 a coluna e
-- ignorada (a API grava NULL).
--
-- valor_fixo NULL com percentual 0 = profissional nao recebe nada
-- (comportamento anterior do 0%, nada muda pra quem ja usa).
-- =============================================================

ALTER TABLE tab_profissional_tipo_percentual
  ADD COLUMN IF NOT EXISTS valor_fixo NUMERIC(15,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_proftipopct_valor_fixo'
  ) THEN
    ALTER TABLE tab_profissional_tipo_percentual
      ADD CONSTRAINT ck_proftipopct_valor_fixo CHECK (valor_fixo IS NULL OR valor_fixo >= 0);
  END IF;
END $$;

COMMENT ON COLUMN tab_profissional_tipo_percentual.valor_fixo IS
  'Valor fixo (R$) que fica com o profissional por atendimento quando percentual_profissional = 0; a clinica fica com o restante. Ignorado se percentual > 0';

-- ADD COLUMN em tabela ja existente nao precisa de GRANT (ver padroes, secao 8).
