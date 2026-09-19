SET client_encoding = 'LATIN1';

-- =============================================================
-- 59_tipo_atendimento_eh_exame.sql
-- Marca quais tipos de atendimento sao EXAMES (procedimentos).
--
-- Usado pelo relatorio "Exames por medico executante" do Fechamento
-- Diario: so entram nele os agendamentos cujo tipo tem eh_exame = true.
-- Consulta e retorno ficam de fora (eh_exame = false).
--
-- Classificacao inicial: tudo que nao comeca com CONSULTA nem RETORNO
-- vira exame. Depois disso a marcacao e manual, na tela
-- Clinica > Tipos de Atendimento (caixa "E exame").
-- =============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'tab_agendamento_tipo' AND column_name = 'eh_exame'
  ) THEN
    ALTER TABLE tab_agendamento_tipo ADD COLUMN eh_exame BOOLEAN NOT NULL DEFAULT false;

    -- Classificacao inicial: so na PRIMEIRA execucao (quando a coluna e criada), para que
    -- rodar a migracao de novo nunca desfaca uma marcacao feita depois pela tela.
    UPDATE tab_agendamento_tipo
       SET eh_exame = true
     WHERE UPPER(descricao) NOT LIKE 'CONSULTA%'
       AND UPPER(descricao) NOT LIKE 'RETORNO%';
  END IF;
END $$;

COMMENT ON COLUMN tab_agendamento_tipo.eh_exame IS
  'true = o tipo e um exame/procedimento (entra no relatorio Exames por medico executante); false = consulta/retorno';

-- ADD COLUMN em tabela ja existente nao precisa de GRANT (ver padroes, secao 8).
