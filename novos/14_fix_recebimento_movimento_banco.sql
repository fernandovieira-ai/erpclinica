-- =============================================================
-- 14_fix_recebimento_movimento_banco.sql
-- Garante que a coluna movimento_banco_id existe na tab_recebimento_consulta
-- =============================================================

SET client_encoding = 'LATIN1';

-- Adicionar coluna movimento_banco_id se não existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tab_recebimento_consulta') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'tab_recebimento_consulta'
                   AND column_name = 'movimento_banco_id') THEN
      ALTER TABLE tab_recebimento_consulta
        ADD COLUMN movimento_banco_id INT REFERENCES tab_movimento_banco(id);

      CREATE INDEX IF NOT EXISTS idx_rc_movimento_banco ON tab_recebimento_consulta(movimento_banco_id);

      RAISE NOTICE 'Coluna movimento_banco_id adicionada a tab_recebimento_consulta';
    ELSE
      RAISE NOTICE 'Coluna movimento_banco_id já existe em tab_recebimento_consulta';
    END IF;
  ELSE
    RAISE NOTICE 'Tabela tab_recebimento_consulta não encontrada';
  END IF;
END
$$;
