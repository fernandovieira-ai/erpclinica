-- =============================================================
-- 67_recebimento_valor_digitado.sql
-- Parametro por empresa: permite digitar o valor efetivamente pago no
-- recebimento de consulta, em vez de preencher desconto/acrescimo.
-- Quando ativo, o modal de recebimento esconde os campos de desconto e
-- acrescimo; o operador digita quanto cada forma de pagamento recebeu e
-- o sistema calcula sozinho o desconto (valor digitado menor que o de
-- tabela) ou acrescimo (valor digitado maior) necessario para fechar a
-- venda, inclusive cortesia 100% (valor digitado = 0).
-- =============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_empresa
  ADD COLUMN IF NOT EXISTS recebimento_permite_valor_digitado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tab_empresa.recebimento_permite_valor_digitado IS 'Se true, o recebimento de consulta permite digitar o valor pago por forma de pagamento (desconto/acrescimo calculados automaticamente, inclusive cortesia 100%), em vez de preencher desconto/acrescimo manualmente';
