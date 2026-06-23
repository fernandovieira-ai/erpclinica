-- =============================================================
-- 13_add_pix_condicao_pagamento.sql
-- Adiciona suporte a PIX vinculado na Condição de Pagamento
-- =============================================================

SET client_encoding = 'LATIN1';

-- Adicionar coluna tipo_pagamento para distinguir: Dinheiro, Débito, Crédito, PIX
-- Tipo será selecionado ao cadastrar a condição, não na hora de receber
ALTER TABLE tab_condicao_pagamento
  ADD COLUMN IF NOT EXISTS tipo_pagamento VARCHAR(20) DEFAULT 'dinheiro'
    CHECK (tipo_pagamento IN ('dinheiro', 'debito', 'credito', 'pix'));

-- Se for PIX, qual conta bancária receberá
ALTER TABLE tab_condicao_pagamento
  ADD COLUMN IF NOT EXISTS conta_banco_pix_id INT REFERENCES tab_conta_banco(id);

-- Índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_cp_conta_banco_pix ON tab_condicao_pagamento(conta_banco_pix_id);

COMMENT ON COLUMN tab_condicao_pagamento.tipo_pagamento IS 'dinheiro|debito|credito|pix - Tipo de pagamento';
COMMENT ON COLUMN tab_condicao_pagamento.conta_banco_pix_id IS 'Conta bancária se tipo_pagamento=pix';

-- Adicionar coluna movimento_banco_id a tab_recebimento_consulta se não existir (e a tabela existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tab_recebimento_consulta') THEN
    ALTER TABLE tab_recebimento_consulta
      ADD COLUMN IF NOT EXISTS movimento_banco_id INT REFERENCES tab_movimento_banco(id);

    CREATE INDEX IF NOT EXISTS idx_rc_movimento_banco ON tab_recebimento_consulta(movimento_banco_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'tab_recebimento_consulta'
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tab_recebimento_consulta' AND column_name = 'movimento_banco_id')
  ) THEN
    EXECUTE 'COMMENT ON COLUMN tab_recebimento_consulta.movimento_banco_id IS ''Movimento bancário se tipo_pagamento=pix''';
  END IF;
END
$$;

-- Remover colunas de tipo_recebimento da tabela de recebimento se existirem (e a tabela existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tab_recebimento_consulta') THEN
    ALTER TABLE tab_recebimento_consulta
      DROP COLUMN IF EXISTS tipo_recebimento,
      DROP COLUMN IF EXISTS conta_banco_id;
  END IF;
END
$$;

-- View para facilitar consultas de recebimentos com detalhes (se a tabela existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tab_recebimento_consulta') THEN
    EXECUTE 'CREATE OR REPLACE VIEW vw_recebimentos_consulta AS
    SELECT
      rc.id,
      rc.empresa_id,
      rc.agendamento_id,
      ag.paciente_id,
      pac.nome AS paciente_nome,
      pac.cpf_cnpj AS paciente_cpf,
      prof.nome AS profissional_nome,
      cp.descricao AS condicao_pagamento_desc,
      cp.tipo_pagamento,
      cb.mnemonico AS conta_banco_nome,
      rc.valor_original,
      rc.valor_desconto,
      rc.valor_acrescimo,
      rc.valor_recebido,
      rc.total_recebimento,
      rc.titulo_receber_id,
      rc.movimento_caixa_id,
      rc.data_recebimento,
      rc.observacao,
      rc.created_by,
      rc.created_at
    FROM tab_recebimento_consulta rc
      JOIN tab_agendamento ag ON ag.id = rc.agendamento_id
      JOIN tab_pessoa pac ON pac.id = ag.paciente_id
      JOIN tab_pessoa prof ON prof.id = ag.profissional_id
      JOIN tab_condicao_pagamento cp ON cp.id = rc.condicao_pagamento_id
      LEFT JOIN tab_conta_banco cb ON cb.id = cp.conta_banco_pix_id';
  END IF;
END
$$;
