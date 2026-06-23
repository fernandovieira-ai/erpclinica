-- =============================================================
-- 12_add_categoria_recebimentos.sql
-- Adiciona suporte a categorias e valores de consulta
-- Rodar no database do cliente: fin_{slug}
-- =============================================================

SET client_encoding = 'LATIN1';

-- Adicionar coluna 'valor' a tab_agendamento_tipo se não existir
ALTER TABLE tab_agendamento_tipo
  ADD COLUMN IF NOT EXISTS valor NUMERIC(10,2) DEFAULT NULL;

COMMENT ON COLUMN tab_agendamento_tipo.valor IS 'Valor padrão da consulta/procedimento';

-- Adicionar tabela de categorias de agendamento
CREATE TABLE IF NOT EXISTS tab_categoria (
  id          SERIAL        PRIMARY KEY,
  empresa_id  INT           NOT NULL REFERENCES tab_empresa(id),
  descricao   VARCHAR(80)   NOT NULL,
  ativo       BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, descricao)
);

CREATE INDEX IF NOT EXISTS idx_categoria_empresa ON tab_categoria(empresa_id);

-- Adicionar coluna categoria_id a tab_agendamento se não existir
ALTER TABLE tab_agendamento
  ADD COLUMN IF NOT EXISTS categoria_id INT REFERENCES tab_categoria(id);

CREATE INDEX IF NOT EXISTS idx_ag_categoria ON tab_agendamento(categoria_id);

-- Tabela de vinculação entre tipo de atendimento e categoria com valor customizado
CREATE TABLE IF NOT EXISTS tab_tipo_categoria_valor (
  id              SERIAL        PRIMARY KEY,
  tipo_id         INT           NOT NULL REFERENCES tab_agendamento_tipo(id) ON DELETE CASCADE,
  categoria_id    INT           NOT NULL REFERENCES tab_categoria(id) ON DELETE CASCADE,
  valor           NUMERIC(10,2) NOT NULL,
  ativo           BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (tipo_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS idx_tcv_tipo       ON tab_tipo_categoria_valor(tipo_id);
CREATE INDEX IF NOT EXISTS idx_tcv_categoria  ON tab_tipo_categoria_valor(categoria_id);

-- Tabela para armazenar recebimentos de consultas
CREATE TABLE IF NOT EXISTS tab_recebimento_consulta (
  id                      SERIAL        PRIMARY KEY,
  empresa_id              INT           NOT NULL REFERENCES tab_empresa(id),
  agendamento_id          INT           NOT NULL REFERENCES tab_agendamento(id),
  paciente_id             INT           NOT NULL REFERENCES tab_pessoa(id),
  condicao_pagamento_id   INT           NOT NULL REFERENCES tab_condicao_pagamento(id),
  valor_original          NUMERIC(15,2) NOT NULL,
  valor_desconto          NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_acrescimo         NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_recebido          NUMERIC(15,2) NOT NULL,
  total_recebimento       NUMERIC(15,2) NOT NULL,
  titulo_receber_id       INT           REFERENCES tab_titulo_receber(id),
  movimento_caixa_id      INT           REFERENCES tab_movimento_caixa(id),
  data_recebimento        DATE          NOT NULL,
  observacao              TEXT,
  created_by              VARCHAR(100),
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (agendamento_id, data_recebimento)
);

CREATE INDEX IF NOT EXISTS idx_rc_empresa       ON tab_recebimento_consulta(empresa_id);
CREATE INDEX IF NOT EXISTS idx_rc_agendamento   ON tab_recebimento_consulta(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_rc_paciente      ON tab_recebimento_consulta(paciente_id);
CREATE INDEX IF NOT EXISTS idx_rc_condicao      ON tab_recebimento_consulta(condicao_pagamento_id);
CREATE INDEX IF NOT EXISTS idx_rc_data          ON tab_recebimento_consulta(empresa_id, data_recebimento);
CREATE INDEX IF NOT EXISTS idx_rc_titulo        ON tab_recebimento_consulta(titulo_receber_id);
CREATE INDEX IF NOT EXISTS idx_rc_movimento     ON tab_recebimento_consulta(movimento_caixa_id);

COMMENT ON TABLE tab_recebimento_consulta IS 'Registro de recebimentos de consultas/procedimentos';
COMMENT ON COLUMN tab_recebimento_consulta.condicao_pagamento_id IS 'FK para tab_condicao_pagamento (condição de pagamento cadastrada)';
