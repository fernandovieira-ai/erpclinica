-- =============================================================
-- 51_fechamento_diario.sql
-- Fechamento diario de caixa da clinica (tela Gerencial > Fechamento Diario)
-- Rodar no database do cliente
-- Pre-requisito: 04_schema_clinica.sql, 15_recebimento_com_triggers.sql ja aplicados
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE TABLE IF NOT EXISTS tab_fechamento_caixa_diario (
  id                 SERIAL        PRIMARY KEY,
  empresa_id         INT           NOT NULL REFERENCES tab_empresa(id),
  data               DATE          NOT NULL,
  status             VARCHAR(10)   NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'FECHADO')),
  fechado_por        VARCHAR(100),
  fechado_em         TIMESTAMPTZ,
  reaberto_por       VARCHAR(100),
  reaberto_em        TIMESTAMPTZ,
  motivo_reabertura  TEXT,
  -- Snapshot dos totais no momento do fechamento (auditoria - nao muda em reabertura)
  total_agendados    INT           NOT NULL DEFAULT 0,
  total_atendidos    INT           NOT NULL DEFAULT 0,
  total_faltas       INT           NOT NULL DEFAULT 0,
  total_cancelados   INT           NOT NULL DEFAULT 0,
  total_dinheiro     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_pix          NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_debito       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_credito      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_a_prazo      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_recebido     NUMERIC(14,2) NOT NULL DEFAULT 0,
  observacao         TEXT,
  created_by         VARCHAR(100),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, data)
);

CREATE INDEX IF NOT EXISTS idx_fechamento_empresa_data ON tab_fechamento_caixa_diario(empresa_id, data DESC);

COMMENT ON TABLE tab_fechamento_caixa_diario IS 'Estado (aberto/fechado) do fechamento diario de caixa por empresa+data, com snapshot dos totais no momento do fechamento';

CREATE TABLE IF NOT EXISTS tab_reclassificacao_recebimento (
  id                    SERIAL        PRIMARY KEY,
  empresa_id            INT           NOT NULL REFERENCES tab_empresa(id),
  data_original         DATE          NOT NULL,
  agendamento_id        INT           NOT NULL REFERENCES tab_agendamento(id),
  recebimento_id_novo   INT,
  condicao_id_antiga    INT           REFERENCES tab_condicao_pagamento(id),
  condicao_id_nova      INT           REFERENCES tab_condicao_pagamento(id),
  tipo_pgto_antigo      VARCHAR(30),
  tipo_pgto_novo        VARCHAR(30),
  valor                 NUMERIC(14,2) NOT NULL,
  motivo                TEXT          NOT NULL,
  reclassificado_por    VARCHAR(100)  NOT NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reclassificacao_empresa_data ON tab_reclassificacao_recebimento(empresa_id, data_original DESC);
CREATE INDEX IF NOT EXISTS idx_reclassificacao_agendamento  ON tab_reclassificacao_recebimento(agendamento_id);

COMMENT ON TABLE tab_reclassificacao_recebimento IS 'Auditoria de correcao de forma de pagamento de um recebimento ja pago (o recebimento original e apagado no processo, entao o historico fica so aqui)';

-- GRANT obrigatorio em tabela nova (ver padroes.md secao 8 - role de app != owner da migration)
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_fechamento_caixa_diario TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_fechamento_caixa_diario_id_seq TO %I', app_role);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_reclassificacao_recebimento TO %I', app_role);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_reclassificacao_recebimento_id_seq TO %I', app_role);
EXCEPTION WHEN others THEN NULL;
END;
$$;
