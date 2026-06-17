-- Adiciona data_nascimento em tab_pessoa (nullable, não quebra dados existentes)
ALTER TABLE tab_pessoa ADD COLUMN IF NOT EXISTS data_nascimento DATE;

COMMENT ON COLUMN tab_pessoa.data_nascimento IS 'Data de nascimento (pessoa física)';
