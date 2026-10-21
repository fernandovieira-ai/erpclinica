-- =============================================================
-- MIGRACAO 75: Replicar despesa (Caixa/Banco)
--
-- Adiciona rastreabilidade de despesa replicada: quando o usuario
-- duplica uma despesa de pagamento imediato (destino C ou B) para
-- outra data, a nova linha guarda o id da despesa de origem.
-- =============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_despesa
  ADD COLUMN IF NOT EXISTS despesa_origem_id INT REFERENCES tab_despesa(id);

CREATE INDEX IF NOT EXISTS idx_despesa_despesa_origem_id ON tab_despesa(despesa_origem_id);
