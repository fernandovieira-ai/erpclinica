SET client_encoding = 'LATIN1';

ALTER TABLE tab_empresa
  ADD COLUMN IF NOT EXISTS recebimento_permite_editar_valor_atendimento BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tab_empresa.recebimento_permite_editar_valor_atendimento IS
  'Quando true, o valor de cada atendimento (topo do modal de recebimento) fica editavel, em vez de travado no preco de tabela do tipo/categoria.';
