-- Adiciona coluna valor_prazo em tab_agendamento_tipo_categoria
-- O valor existente passa a ser o "valor à vista", valor_prazo é o "valor a prazo"
ALTER TABLE tab_agendamento_tipo_categoria
  ADD COLUMN IF NOT EXISTS valor_prazo NUMERIC(15,2) DEFAULT NULL;

COMMENT ON COLUMN tab_agendamento_tipo_categoria.valor       IS 'Valor à vista do tipo de atendimento por categoria';
COMMENT ON COLUMN tab_agendamento_tipo_categoria.valor_prazo IS 'Valor a prazo do tipo de atendimento por categoria';
