SET client_encoding = 'LATIN1';

-- =============================================================
-- 61_bloqueio_horario_agenda.sql
-- Bloqueio pontual de horario na agenda do profissional.
--
-- Motivo: a recepcao precisa fechar um trecho de UM dia especifico
-- (ex.: medico sai mais cedo, reuniao, exame urgente) sem mexer na
-- grade semanal fixa. A excecao por data (tab_agenda_profissional_excecao)
-- so cobre "nao atende o dia todo" ou "atende apenas de X a Y" - nao
-- consegue fechar um miolo do dia nem varias faixas no mesmo dia.
-- Bloqueio de DIA TODO continua sendo a excecao com nao_atende = true.
-- =============================================================

CREATE TABLE IF NOT EXISTS tab_agenda_profissional_bloqueio (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  profissional_id INT           NOT NULL REFERENCES tab_pessoa(id) ON DELETE CASCADE,
  data            DATE          NOT NULL,
  hora_inicio     TIME          NOT NULL,
  hora_fim        TIME          NOT NULL,
  motivo          VARCHAR(100),
  created_by      VARCHAR(100),
  created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_bloqueio_horario CHECK (hora_fim > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_bloqueio_prof_data ON tab_agenda_profissional_bloqueio(profissional_id, data);
CREATE INDEX IF NOT EXISTS idx_bloqueio_empresa   ON tab_agenda_profissional_bloqueio(empresa_id);

COMMENT ON TABLE  tab_agenda_profissional_bloqueio             IS 'Bloqueio pontual de faixa de horario em uma data especifica (nao recorrente)';
COMMENT ON COLUMN tab_agenda_profissional_bloqueio.motivo      IS 'Ex: Reuniao, Saida antecipada, Exame urgente';

-- GRANT da tabela nova pra role do tenant (mesmo nome do database).
DO $$
DECLARE
  app_role text := current_database();
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tab_agenda_profissional_bloqueio TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tab_agenda_profissional_bloqueio_id_seq TO %I', app_role);
  END IF;
END $$;
