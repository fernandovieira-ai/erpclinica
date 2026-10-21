SET client_encoding = 'LATIN1';

ALTER TABLE tab_empresa
  ADD COLUMN IF NOT EXISTS recebimento_solicitante_obrigatorio BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tab_empresa.recebimento_solicitante_obrigatorio IS
  'Quando true, o medico solicitante e obrigatorio em todo recebimento (inclusive atendimentos normais, nao so exame com placeholder da clinica).';
