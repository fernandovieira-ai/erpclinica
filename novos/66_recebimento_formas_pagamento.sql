-- =============================================================
-- 66_recebimento_formas_pagamento.sql
-- Pagamento misto no recebimento de consulta: um lote (batch_agendamento_id)
-- passa a poder ser pago com N formas de pagamento (ex.: metade dinheiro,
-- metade cartao), cada uma gerando seu proprio instrumento financeiro
-- (movimento de caixa/banco, venda de cartao ou titulo a prazo).
--
-- tab_recebimento_consulta e lib/clinica/repasse.ts NAO mudam - o split
-- e uma propriedade do lote (como o dinheiro entrou), nao do agendamento/
-- item. Um recebimento de forma unica (caso comum, hoje) vira exatamente
-- 1 linha aqui.
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE TABLE IF NOT EXISTS tab_recebimento_pagamento (
  id                    SERIAL        PRIMARY KEY,
  empresa_id            INT           NOT NULL REFERENCES tab_empresa(id),
  batch_agendamento_id  INT           NOT NULL,
  condicao_pagamento_id INT           NOT NULL REFERENCES tab_condicao_pagamento(id),
  valor                 NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  movimento_caixa_id    INT           REFERENCES tab_movimento_caixa(id),
  movimento_banco_id    INT           REFERENCES tab_movimento_banco(id),
  venda_cartao_id       INT           REFERENCES tab_venda_cartao(id),
  nsu                   VARCHAR(50),
  parcelas_cartao       INT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rp_empresa ON tab_recebimento_pagamento(empresa_id);
CREATE INDEX IF NOT EXISTS idx_rp_batch   ON tab_recebimento_pagamento(batch_agendamento_id);

COMMENT ON TABLE tab_recebimento_pagamento IS 'Uma linha por forma de pagamento usada num lote de recebimento (pagamento misto); titulo a prazo identificado via tab_titulo_receber.origem_id = batch_agendamento_id, sem FK duplicada aqui';

DO $$
DECLARE
  app_role text := current_database();
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_recebimento_pagamento TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_recebimento_pagamento_id_seq TO %I', app_role);
  END IF;
END $$;
