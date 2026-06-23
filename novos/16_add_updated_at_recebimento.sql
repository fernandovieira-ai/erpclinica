-- =============================================================
-- 16_add_updated_at_recebimento.sql
-- Adiciona coluna updated_at à tabela recebimento se não existir
-- =============================================================

SET client_encoding = 'LATIN1';

-- Adicionar coluna updated_at se não existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tab_recebimento_consulta') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'tab_recebimento_consulta'
                   AND column_name = 'updated_at') THEN
      ALTER TABLE tab_recebimento_consulta
        ADD COLUMN updated_at TIMESTAMPTZ;

      COMMENT ON COLUMN tab_recebimento_consulta.updated_at IS 'Data da última atualização';
    END IF;
  END IF;
END
$$;
