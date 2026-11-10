SET client_encoding = 'LATIN1';

-- Convênio/categoria padrão do paciente (tab_categoria), preenchido no cadastro de pessoa
-- pra já vir sugerido no agendamento/recebimento. Opcional (NULL = sem convênio padrão).
ALTER TABLE tab_pessoa ADD COLUMN IF NOT EXISTS categoria_id INT REFERENCES tab_categoria(id);

CREATE INDEX IF NOT EXISTS idx_pessoa_categoria ON tab_pessoa(categoria_id);

COMMENT ON COLUMN tab_pessoa.categoria_id IS 'Convênio/categoria padrão do paciente (tab_categoria), sugerido no agendamento/recebimento';
