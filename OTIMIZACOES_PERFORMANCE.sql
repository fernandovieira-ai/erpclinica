-- ============================================================================
-- OTIMIZAÇÕES DE PERFORMANCE - APLICAR APÓS ANÁLISE
-- Data: 2026-06-23
-- ============================================================================
-- Este script contém APENAS os índices novos que foram adicionados
-- ao schema. Aplicar este script após deploy das mudanças de código.
-- ============================================================================

-- ÍNDICES ADICIONADOS PARA MOVIMENTO-CAIXA
-- Melhoram performance de queries com filtro por origem_modulo e data
CREATE INDEX IF NOT EXISTS idx_mc_origem_modulo
  ON tab_movimento_caixa(empresa_id, origem_modulo, data_movimento DESC);

CREATE INDEX IF NOT EXISTS idx_mc_empresa_tipo_data
  ON tab_movimento_caixa(empresa_id, tipo, data_movimento DESC);

-- ÍNDICE MELHORADO PARA TITULO-RECEBER
-- Agora inclui status para suportar filtros origem + status
DROP INDEX IF EXISTS idx_trec_origem;
CREATE INDEX IF NOT EXISTS idx_trec_origem
  ON tab_titulo_receber(origem_modulo, origem_id, status);

-- ÍNDICE MELHORADO PARA MOVIMENTO-CAIXA DATA
-- Ordem descending para paginação
DROP INDEX IF EXISTS idx_mc_data;
CREATE INDEX IF NOT EXISTS idx_mc_data
  ON tab_movimento_caixa(empresa_id, data_movimento DESC);

-- ============================================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO
-- ============================================================================
-- Rode depois de aplicar os índices para verificar se foi bem-sucedido:

-- Listar todos índices de movimento_caixa
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'tab_movimento_caixa'
ORDER BY indexname;

-- Listar todos índices de titulo_receber
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'tab_titulo_receber'
ORDER BY indexname;

-- Verificar tamanho dos índices criados
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS tamanho
FROM pg_stat_user_indexes
WHERE tablename IN ('tab_movimento_caixa', 'tab_titulo_receber')
ORDER BY pg_relation_size(indexrelid) DESC;
