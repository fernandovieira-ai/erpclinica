SET client_encoding = 'LATIN1';

-- =============================================================
-- 80_percentual_profissional_por_categoria.sql
-- Override OPCIONAL do repasse por profissional x tipo x categoria
-- (convenio/plano/particular).
--
-- Regra: sem override cadastrado, o repasse continua usando so a
-- regra geral do tipo (categoria_id IS NULL), exatamente como hoje.
-- O override so entra em vigor quando existir uma linha especifica
-- pra aquela categoria (empresa decide isso atendimento a atendimento,
-- nao e obrigatorio pra todos).
-- =============================================================

ALTER TABLE tab_profissional_tipo_percentual
  ADD COLUMN IF NOT EXISTS categoria_id INT REFERENCES tab_categoria(id) ON DELETE CASCADE;

COMMENT ON COLUMN tab_profissional_tipo_percentual.categoria_id IS
  'Override do repasse so para esta categoria (convenio); NULL = regra geral do tipo (usada quando nao ha override)';

-- A UNIQUE (profissional_id, tipo_id) antiga nao serve mais: agora pode
-- existir 1 linha geral (categoria_id NULL) + N overrides (1 por categoria)
-- para o mesmo par profissional+tipo.
ALTER TABLE tab_profissional_tipo_percentual
  DROP CONSTRAINT IF EXISTS tab_profissional_tipo_percentual_profissional_id_tipo_id_key;

-- No maximo 1 linha "geral" (sem categoria) por profissional+tipo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_proftipopct_geral
  ON tab_profissional_tipo_percentual (profissional_id, tipo_id)
  WHERE categoria_id IS NULL;

-- No maximo 1 override por profissional+tipo+categoria.
CREATE UNIQUE INDEX IF NOT EXISTS uq_proftipopct_categoria
  ON tab_profissional_tipo_percentual (profissional_id, tipo_id, categoria_id)
  WHERE categoria_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_proftipopct_categoria ON tab_profissional_tipo_percentual(categoria_id);

-- Snapshot do recebimento: registra se o repasse aplicado veio de um
-- override por categoria ou da regra geral do tipo (so informativo/auditoria,
-- nao entra em nenhum calculo).
ALTER TABLE tab_recebimento_consulta
  ADD COLUMN IF NOT EXISTS categoria_repasse_id INT REFERENCES tab_categoria(id);

COMMENT ON COLUMN tab_recebimento_consulta.categoria_repasse_id IS
  'Categoria do override de repasse aplicado (snapshot); NULL = usou a regra geral do tipo';
