SET client_encoding = 'LATIN1';

ALTER TABLE tab_empresa
  ADD COLUMN IF NOT EXISTS cod_tipo_cobranca INT
    REFERENCES tab_tipo_cobranca(cod_tipo_cobranca);

COMMENT ON COLUMN tab_empresa.cod_tipo_cobranca IS 'Tipo de cobranca padrao da empresa';
