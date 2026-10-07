-- =============================================================
-- 69_agendamento_encaixe_periodo.sql
-- Encaixe simplificado: em vez de hora exata, o encaixe informa só a data
-- e o periodo (manha/tarde). Mostrado numa lista separada no final da
-- agenda do dia, fora da grade de horarios. data_hora_inicio/fim continuam
-- preenchidos (ancora tecnica: 08:00/13:00 + duracao do tipo) so para
-- manter as colunas NOT NULL e os filtros por data que ja existem no
-- sistema -- a tela nunca mostra essa hora pro encaixe, so o periodo.
-- =============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_agendamento
  ADD COLUMN IF NOT EXISTS periodo VARCHAR(10)
    CHECK (periodo IS NULL OR periodo IN ('MANHA', 'TARDE'));

COMMENT ON COLUMN tab_agendamento.periodo IS 'Preenchido so quando eh_encaixe=true: MANHA ou TARDE (sem hora exata) -- ver novos/68_agendamento_encaixe.sql';

-- Motivo do encaixe deixa de ser obrigatorio na regra de negocio (continua opcional no banco)
