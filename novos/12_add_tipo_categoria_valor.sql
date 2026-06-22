-- =============================================================
-- 12_add_tipo_categoria_valor.sql
-- Vínculo entre tipo de atendimento e categoria com valor específico
-- Permite configurar o valor do atendimento por categoria (convênio/plano)
-- Pré-requisito: 04_schema_clinica.sql e 06_schema_clinica_categoria.sql aplicados
-- =============================================================

SET client_encoding = 'LATIN1';

-- =============================================================
-- TABELA: tab_agendamento_tipo_categoria
-- Valor do tipo de atendimento por categoria (convênio/plano)
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_agendamento_tipo_categoria (
  id           SERIAL         PRIMARY KEY,
  empresa_id   INT            NOT NULL REFERENCES tab_empresa(id),
  tipo_id      INT            NOT NULL REFERENCES tab_agendamento_tipo(id) ON DELETE CASCADE,
  categoria_id INT            NOT NULL REFERENCES tab_categoria(id)        ON DELETE CASCADE,
  valor        NUMERIC(15,2)  NOT NULL DEFAULT 0,
  UNIQUE (tipo_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS idx_tipocatval_tipo      ON tab_agendamento_tipo_categoria(tipo_id);
CREATE INDEX IF NOT EXISTS idx_tipocatval_empresa   ON tab_agendamento_tipo_categoria(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tipocatval_categoria ON tab_agendamento_tipo_categoria(categoria_id);

COMMENT ON TABLE  tab_agendamento_tipo_categoria       IS 'Valor do atendimento por tipo x categoria (convênio/plano)';
COMMENT ON COLUMN tab_agendamento_tipo_categoria.valor IS 'Valor cobrado nesta combinação tipo + categoria';
