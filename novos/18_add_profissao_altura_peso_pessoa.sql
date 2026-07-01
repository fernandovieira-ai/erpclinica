-- Adiciona profissão, altura e peso à tab_pessoa
ALTER TABLE tab_pessoa
  ADD COLUMN IF NOT EXISTS profissao VARCHAR(100),
  ADD COLUMN IF NOT EXISTS altura    NUMERIC(4,2),   -- metros, ex: 1.75
  ADD COLUMN IF NOT EXISTS peso      NUMERIC(5,2);   -- kg,     ex: 85.50
