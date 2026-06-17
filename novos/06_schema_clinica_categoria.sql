-- =============================================================
-- 06_schema_clinica_categoria.sql
-- Módulo Clínica — tabela de categorias (convênios / planos)
-- Rodar no database do cliente: fin_{slug}
-- Pré-requisito: 04_schema_clinica.sql e 05_schema_clinica_ajustes.sql aplicados
-- =============================================================

SET client_encoding = 'LATIN1';

-- =============================================================
-- TABELA: tab_categoria
-- Categorias de atendimento (convênios, planos, particular, etc.)
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_categoria (
  id          SERIAL        PRIMARY KEY,
  empresa_id  INT           NOT NULL REFERENCES tab_empresa(id),
  descricao   VARCHAR(80)   NOT NULL,
  ativo       BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, descricao)
);

CREATE INDEX IF NOT EXISTS idx_categoria_empresa ON tab_categoria(empresa_id);

COMMENT ON TABLE  tab_categoria          IS 'Categorias de atendimento: convênios, planos, particular, etc.';
COMMENT ON COLUMN tab_categoria.descricao IS 'Ex: UNIMED, BRADESCO SAUDE, PARTICULAR';

-- =============================================================
-- AJUSTE: tab_agendamento
-- Adiciona FK para categoria e remove texto livre convenio
-- =============================================================
ALTER TABLE tab_agendamento
  ADD COLUMN IF NOT EXISTS categoria_id INT REFERENCES tab_categoria(id);

ALTER TABLE tab_agendamento
  DROP COLUMN IF EXISTS convenio;

CREATE INDEX IF NOT EXISTS idx_ag_categoria ON tab_agendamento(categoria_id);

-- =============================================================
-- VIEW: vw_agendamentos (atualizada com categoria)
-- =============================================================
CREATE OR REPLACE VIEW vw_agendamentos AS
SELECT
  a.id,
  a.empresa_id,
  a.data_hora_inicio,
  a.data_hora_fim,
  a.status,
  a.motivo,
  a.observacao,
  a.created_at,
  a.updated_at,
  -- paciente
  pac.id          AS paciente_id,
  pac.nome        AS paciente_nome,
  pac.celular     AS paciente_celular,
  pac.cpf_cnpj    AS paciente_cpf,
  -- profissional
  pro.id          AS profissional_id,
  pro.nome        AS profissional_nome,
  -- tipo de atendimento
  tp.id           AS tipo_id,
  tp.descricao    AS tipo_descricao,
  tp.cor          AS tipo_cor,
  tp.duracao_min  AS tipo_duracao_min,
  -- especialidade
  esp.id          AS especialidade_id,
  esp.descricao   AS especialidade_descricao,
  esp.cor         AS especialidade_cor,
  -- categoria
  cat.id          AS categoria_id,
  cat.descricao   AS categoria_descricao
FROM tab_agendamento a
  JOIN  tab_pessoa             pac ON pac.id  = a.paciente_id
  JOIN  tab_pessoa             pro ON pro.id  = a.profissional_id
  LEFT JOIN tab_agendamento_tipo tp  ON tp.id  = a.tipo_id
  LEFT JOIN tab_especialidade    esp ON esp.id = a.especialidade_id
  LEFT JOIN tab_categoria        cat ON cat.id = a.categoria_id;
