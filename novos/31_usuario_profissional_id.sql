SET client_encoding = 'LATIN1';

ALTER TABLE tab_usuario ADD COLUMN IF NOT EXISTS profissional_id INT REFERENCES tab_pessoa(id);
CREATE INDEX IF NOT EXISTS idx_usuario_profissional ON tab_usuario(profissional_id);

COMMENT ON COLUMN tab_usuario.profissional_id IS 'Vincula o usuario a um profissional (tab_pessoa) para pre-selecionar o filtro de agenda/sala de espera';
