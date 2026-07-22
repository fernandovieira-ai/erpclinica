SET client_encoding = 'LATIN1';

ALTER TABLE tab_prontuario
  ADD COLUMN IF NOT EXISTS imc NUMERIC(4,2);

COMMENT ON COLUMN tab_prontuario.imc IS 'Indice de massa corporal (kg/m2), arredondado a 2 casas decimais';
