SET client_encoding = 'LATIN1';

ALTER TABLE tab_pessoa
  ADD COLUMN IF NOT EXISTS cod_tipo_cobranca INT
    REFERENCES tab_tipo_cobranca(cod_tipo_cobranca);

COMMENT ON COLUMN tab_pessoa.cod_tipo_cobranca IS 'Tipo de cobranca padrao do cliente';
