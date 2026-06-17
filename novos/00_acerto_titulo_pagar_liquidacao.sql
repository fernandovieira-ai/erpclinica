-- ============================================================
-- MIGRAÇÃO: Adiciona campos de liquidação em tab_titulo_pagar
-- Executar no banco do cliente ANTES de subir o código novo
-- ============================================================

ALTER TABLE tab_titulo_pagar
  ADD COLUMN IF NOT EXISTS destino_liquidacao CHAR(1)
    CHECK (destino_liquidacao IN ('C','B')),   -- C=Caixa  B=Banco
  ADD COLUMN IF NOT EXISTS conta_banco_liq_id INT
    REFERENCES tab_conta_banco(id),            -- conta bancária debitada na liquidação
  ADD COLUMN IF NOT EXISTS movimento_caixa_id INT,
  ADD COLUMN IF NOT EXISTS movimento_banco_id INT;

-- Nota: FKs para tab_movimento_caixa / tab_movimento_banco serão adicionadas
-- quando essas tabelas forem criadas no módulo de Caixa/Banco.

COMMENT ON COLUMN tab_titulo_pagar.destino_liquidacao IS 'C=Caixa B=Banco — obrigatório ao liquidar';
COMMENT ON COLUMN tab_titulo_pagar.conta_banco_liq_id IS 'Conta bancária debitada; obrigatório quando destino_liquidacao=B';
COMMENT ON COLUMN tab_titulo_pagar.movimento_caixa_id IS 'Movimento de caixa gerado na liquidação';
COMMENT ON COLUMN tab_titulo_pagar.movimento_banco_id IS 'Movimento bancário gerado na liquidação';
