-- =============================================================
-- 11_agenda_profissional_extensao.sql
-- Extensão de agenda profissional com pausas intraday e exceções
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- TABELA: tab_agenda_profissional_pausa
-- Períodos que o profissional NÃO atende dentro do dia da semana
-- Ex: Almoço de segunda 12:00-13:00
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tab_agenda_profissional_pausa (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  profissional_id INT           NOT NULL REFERENCES tab_pessoa(id) ON DELETE CASCADE,
  dia_semana      SMALLINT      NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio     TIME          NOT NULL,
  hora_fim        TIME          NOT NULL,
  descricao       VARCHAR(50),
  CONSTRAINT chk_pausa_horario CHECK (hora_fim > hora_inicio),
  CONSTRAINT fk_pausa_agenda FOREIGN KEY (profissional_id, dia_semana)
    REFERENCES tab_agenda_profissional(profissional_id, dia_semana) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pausa_profissional ON tab_agenda_profissional_pausa(profissional_id);
CREATE INDEX IF NOT EXISTS idx_pausa_empresa      ON tab_agenda_profissional_pausa(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pausa_dia          ON tab_agenda_profissional_pausa(profissional_id, dia_semana);

COMMENT ON TABLE tab_agenda_profissional_pausa IS 'Períodos de pausa/indisponibilidade dentro de um dia da semana';
COMMENT ON COLUMN tab_agenda_profissional_pausa.descricao IS 'Ex: Almoço, Café, Reunião';

-- ─────────────────────────────────────────────────────────────
-- TABELA: tab_agenda_profissional_excecao
-- Exceções para datas específicas (feriados, eventos, etc)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tab_agenda_profissional_excecao (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  profissional_id INT           NOT NULL REFERENCES tab_pessoa(id) ON DELETE CASCADE,
  data            DATE          NOT NULL,
  descricao       VARCHAR(100),
  nao_atende      BOOLEAN       NOT NULL DEFAULT true,
  hora_inicio     TIME,
  hora_fim        TIME,
  intervalo_min   INT           DEFAULT 30,
  CONSTRAINT chk_excecao_horario CHECK (hora_fim IS NULL OR hora_inicio IS NULL OR hora_fim > hora_inicio),
  UNIQUE (profissional_id, data)
);

CREATE INDEX IF NOT EXISTS idx_excecao_profissional ON tab_agenda_profissional_excecao(profissional_id);
CREATE INDEX IF NOT EXISTS idx_excecao_empresa      ON tab_agenda_profissional_excecao(empresa_id);
CREATE INDEX IF NOT EXISTS idx_excecao_data         ON tab_agenda_profissional_excecao(profissional_id, data);

COMMENT ON TABLE tab_agenda_profissional_excecao IS 'Exceções para datas específicas (feriados, atendimento reduzido, etc)';
COMMENT ON COLUMN tab_agenda_profissional_excecao.nao_atende IS 'true = não atende o dia todo; false = atende com horário especial';
COMMENT ON COLUMN tab_agenda_profissional_excecao.hora_inicio IS 'NULL se nao_atende=true; preenchido se atende com horário especial';
