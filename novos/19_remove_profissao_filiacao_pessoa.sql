-- Remove colunas de profissão da filiação (não utilizadas na interface)
ALTER TABLE tab_pessoa
  DROP COLUMN IF EXISTS pai_profissao,
  DROP COLUMN IF EXISTS mae_profissao,
  DROP COLUMN IF EXISTS conjuge_profissao;
