-- =============================================================
-- 15_recebimento_com_triggers.sql
-- Adiciona status de recebimento e triggers para automatizar o fluxo
-- =============================================================

SET client_encoding = 'LATIN1';

-- 0. Adicionar colunas de origem nas tabelas de movimento (pré-requisito para triggers)
ALTER TABLE tab_movimento_caixa
  ADD COLUMN IF NOT EXISTS origem_modulo VARCHAR(10),
  ADD COLUMN IF NOT EXISTS origem_id     INT;

ALTER TABLE tab_movimento_banco
  ADD COLUMN IF NOT EXISTS origem_modulo VARCHAR(10),
  ADD COLUMN IF NOT EXISTS origem_id     INT;

CREATE INDEX IF NOT EXISTS idx_mc_origem ON tab_movimento_caixa(origem_modulo, origem_id);
CREATE INDEX IF NOT EXISTS idx_mb_origem ON tab_movimento_banco(origem_modulo, origem_id);

-- 1. Adicionar coluna de status ao recebimento
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tab_recebimento_consulta') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'tab_recebimento_consulta'
                   AND column_name = 'status_recebimento') THEN
      ALTER TABLE tab_recebimento_consulta
        ADD COLUMN status_recebimento VARCHAR(20) DEFAULT 'PAGO'
          CHECK (status_recebimento IN ('PENDENTE', 'PAGO', 'ESTORNADO'));

      COMMENT ON COLUMN tab_recebimento_consulta.status_recebimento IS 'PENDENTE|PAGO|ESTORNADO - Status do recebimento';
    END IF;
  END IF;
END
$$;

-- 2. Criar índice para buscar recebimentos por status
CREATE INDEX IF NOT EXISTS idx_rc_status ON tab_recebimento_consulta(status_recebimento);

-- 3. Função para processar recebimento automaticamente quando movimento é registrado
CREATE OR REPLACE FUNCTION fn_processar_recebimento_movimento()
RETURNS TRIGGER AS $$
DECLARE
  v_agendamento_id INT;
  v_paciente_id INT;
  v_condicao_pagamento_id INT;
  v_tipo_condicao CHAR(1);  -- 'V' = À Vista, 'P' = Parcelado
  v_recebimento_id INT;
  v_existe BOOLEAN;
  v_tipo_receita_id INT;
  v_numero_titulo VARCHAR(50);
  v_titulo_id INT;
  v_deve_criar_titulo BOOLEAN;
BEGIN
  -- Processa quando é um movimento de entrada com origem CLI (clinica)
  IF NEW.tipo = 'E' AND NEW.origem_modulo = 'CLI' THEN
    v_agendamento_id := NEW.origem_id;

    -- Busca informações do agendamento
    SELECT ag.paciente_id, cat.condicao_pagamento_id
    INTO v_paciente_id, v_condicao_pagamento_id
    FROM tab_agendamento ag
    LEFT JOIN (
      SELECT agendamento_id, condicao_pagamento_id
      FROM tab_recebimento_consulta
      WHERE agendamento_id = v_agendamento_id
      ORDER BY id DESC LIMIT 1
    ) cat ON true
    WHERE ag.id = v_agendamento_id;

    -- Se conseguiu encontrar o agendamento
    IF v_agendamento_id > 0 AND v_paciente_id IS NOT NULL THEN
      -- Verifica se já existe recebimento para este agendamento
      SELECT EXISTS(
        SELECT 1 FROM tab_recebimento_consulta
        WHERE agendamento_id = v_agendamento_id
      ) INTO v_existe;

      IF NOT v_existe AND v_condicao_pagamento_id IS NULL THEN
        -- Se não existe e não achou a condição, busca a padrão
        SELECT id INTO v_condicao_pagamento_id
        FROM tab_condicao_pagamento
        WHERE empresa_id = NEW.empresa_id AND ativo = true
        ORDER BY id ASC LIMIT 1;
      END IF;

      IF v_condicao_pagamento_id IS NOT NULL THEN
        -- Buscar tipo da condição (V=À Vista, P=Parcelado)
        SELECT tipo INTO v_tipo_condicao
        FROM tab_condicao_pagamento
        WHERE id = v_condicao_pagamento_id;

        -- Determinar se deve criar título (apenas para parcelado)
        v_deve_criar_titulo := (v_tipo_condicao = 'P');

        -- Criar título apenas se for parcelado
        IF v_deve_criar_titulo THEN
          v_numero_titulo := 'AG-' || v_agendamento_id || '-' || LPAD(CAST(NEW.id AS VARCHAR), 6, '0');

          SELECT id INTO v_tipo_receita_id
          FROM tab_tipo_receita
          WHERE descricao ILIKE '%Consul%' OR descricao ILIKE '%Serviço%'
          LIMIT 1;

          IF v_tipo_receita_id IS NULL THEN
            SELECT id INTO v_tipo_receita_id FROM tab_tipo_receita ORDER BY id ASC LIMIT 1;
          END IF;

          INSERT INTO tab_titulo_receber (
            empresa_id, pessoa_id, tipo_receita_id, numero_titulo,
            data_emissao, data_vencimento, data_liquidacao,
            valor_original, valor_juros, valor_multa, valor_desconto, valor_retencao, valor_liquidado,
            status, origem_modulo, origem_id, observacao, created_by
          ) VALUES (
            NEW.empresa_id, v_paciente_id, v_tipo_receita_id, v_numero_titulo,
            NEW.data_movimento, NEW.data_movimento, NEW.data_movimento,
            NEW.valor, 0, 0, 0, 0, NEW.valor,
            'L', 'CLI', v_agendamento_id, 'Recebimento de consulta - ' || NEW.observacao, NEW.created_by
          ) RETURNING id INTO v_titulo_id;
        END IF;

        -- Criar recebimento
        INSERT INTO tab_recebimento_consulta (
          empresa_id, agendamento_id, paciente_id, condicao_pagamento_id,
          valor_original, valor_desconto, valor_acrescimo, valor_recebido, total_recebimento,
          titulo_receber_id, movimento_caixa_id, movimento_banco_id, data_recebimento,
          status_recebimento, observacao, created_by
        ) VALUES (
          NEW.empresa_id, v_agendamento_id, v_paciente_id, v_condicao_pagamento_id,
          NEW.valor, 0, 0, NEW.valor, NEW.valor,
          CASE WHEN v_deve_criar_titulo THEN v_titulo_id ELSE NULL END,
          CASE WHEN TG_TABLE_NAME = 'tab_movimento_caixa' THEN NEW.id ELSE NULL END,
          CASE WHEN TG_TABLE_NAME = 'tab_movimento_banco'  THEN NEW.id ELSE NULL END,
          NEW.data_movimento,
          'PAGO', NEW.observacao, NEW.created_by
        ) RETURNING id INTO v_recebimento_id;

        -- Atualizar status do agendamento para ATENDIDO
        UPDATE tab_agendamento
        SET status = 'ATENDIDO', updated_at = NOW()
        WHERE id = v_agendamento_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger para movimento_caixa
DROP TRIGGER IF EXISTS trg_movimento_caixa_recebimento ON tab_movimento_caixa;
CREATE TRIGGER trg_movimento_caixa_recebimento
AFTER INSERT ON tab_movimento_caixa
FOR EACH ROW
EXECUTE FUNCTION fn_processar_recebimento_movimento();

-- 5. Trigger para movimento_banco
DROP TRIGGER IF EXISTS trg_movimento_banco_recebimento ON tab_movimento_banco;
CREATE TRIGGER trg_movimento_banco_recebimento
AFTER INSERT ON tab_movimento_banco
FOR EACH ROW
EXECUTE FUNCTION fn_processar_recebimento_movimento();

-- 6. Função para estornar recebimento
CREATE OR REPLACE FUNCTION fn_estornar_recebimento(
  p_recebimento_id INT,
  p_motivo_estorno VARCHAR(255),
  p_usuario_estorno VARCHAR(100)
)
RETURNS TABLE (sucesso BOOLEAN, mensagem VARCHAR(255)) AS $$
DECLARE
  v_agendamento_id INT;
  v_status_atual VARCHAR(20);
  v_titulo_id INT;
  v_movimento_caixa_id INT;
  v_movimento_banco_id INT;
BEGIN
  -- Buscar dados do recebimento
  SELECT rc.status_recebimento, rc.agendamento_id, rc.titulo_receber_id,
         rc.movimento_caixa_id, rc.movimento_banco_id
  INTO v_status_atual, v_agendamento_id, v_titulo_id, v_movimento_caixa_id, v_movimento_banco_id
  FROM tab_recebimento_consulta rc
  WHERE rc.id = p_recebimento_id;

  IF v_status_atual IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Recebimento não encontrado'::VARCHAR;
    RETURN;
  END IF;

  IF v_status_atual = 'ESTORNADO' THEN
    RETURN QUERY SELECT FALSE, 'Recebimento já foi estornado'::VARCHAR;
    RETURN;
  END IF;

  BEGIN
    -- Marcar recebimento como estornado
    UPDATE tab_recebimento_consulta
    SET status_recebimento = 'ESTORNADO',
        observacao = COALESCE(observacao, '') || ' | ESTORNADO: ' || p_motivo_estorno
    WHERE id = p_recebimento_id;

    -- Reverter movimentos de caixa/banco
    IF v_movimento_caixa_id IS NOT NULL THEN
      DELETE FROM tab_movimento_caixa WHERE id = v_movimento_caixa_id;
    END IF;

    IF v_movimento_banco_id IS NOT NULL THEN
      DELETE FROM tab_movimento_banco WHERE id = v_movimento_banco_id;
    END IF;

    -- Reabrir o título a receber
    IF v_titulo_id IS NOT NULL THEN
      UPDATE tab_titulo_receber
      SET status = 'A', data_liquidacao = NULL, valor_liquidado = 0
      WHERE id = v_titulo_id;
    END IF;

    -- Retornar agendamento para ATENDIDO (ou status anterior)
    UPDATE tab_agendamento
    SET status = 'ATENDIDO', updated_at = NOW()
    WHERE id = v_agendamento_id;

    RETURN QUERY SELECT TRUE, 'Recebimento estornado com sucesso'::VARCHAR;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT FALSE, 'Erro ao estornar recebimento: ' || SQLERRM;
  END;
END;
$$ LANGUAGE plpgsql;
