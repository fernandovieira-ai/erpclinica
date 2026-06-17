-- =============================================================
-- 04_schema_clinica.sql
-- Módulo Clínica — agendamento de pacientes
-- Rodar no database do cliente: fin_{slug}
-- Pré-requisito: 01_schema_cadastros.sql já aplicado
-- =============================================================

SET client_encoding = 'LATIN1';

-- -------------------------------------------------------------
-- Extensão dos papéis na tab_pessoa
-- -------------------------------------------------------------
ALTER TABLE tab_pessoa
  ADD COLUMN IF NOT EXISTS ind_paciente     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ind_profissional BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pessoa_paciente     ON tab_pessoa(empresa_id, ind_paciente)     WHERE ind_paciente = true;
CREATE INDEX IF NOT EXISTS idx_pessoa_profissional ON tab_pessoa(empresa_id, ind_profissional) WHERE ind_profissional = true;

COMMENT ON COLUMN tab_pessoa.ind_paciente     IS 'Aparece na agenda como paciente';
COMMENT ON COLUMN tab_pessoa.ind_profissional IS 'Aparece na agenda como profissional (médico, enfermeiro, etc.)';

-- =============================================================
-- TABELA: tab_especialidade
-- Especialidades dos profissionais
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_especialidade (
  id          SERIAL        PRIMARY KEY,
  empresa_id  INT           NOT NULL REFERENCES tab_empresa(id),
  descricao   VARCHAR(80)   NOT NULL,
  cor         VARCHAR(7)    NOT NULL DEFAULT '#6366F1',  -- hex para calendar
  ativo       BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, descricao)
);

CREATE INDEX IF NOT EXISTS idx_esp_empresa ON tab_especialidade(empresa_id);

COMMENT ON COLUMN tab_especialidade.cor IS 'Cor hex para exibição no calendário';

-- =============================================================
-- TABELA: tab_profissional_especialidade
-- Vínculo N:N pessoa(profissional) × especialidade
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_profissional_especialidade (
  id               SERIAL  PRIMARY KEY,
  pessoa_id        INT     NOT NULL REFERENCES tab_pessoa(id) ON DELETE CASCADE,
  especialidade_id INT     NOT NULL REFERENCES tab_especialidade(id) ON DELETE CASCADE,
  UNIQUE (pessoa_id, especialidade_id)
);

CREATE INDEX IF NOT EXISTS idx_profesp_pessoa ON tab_profissional_especialidade(pessoa_id);

-- =============================================================
-- TABELA: tab_agendamento_tipo
-- Tipos de consulta/procedimento
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_agendamento_tipo (
  id          SERIAL        PRIMARY KEY,
  empresa_id  INT           NOT NULL REFERENCES tab_empresa(id),
  descricao   VARCHAR(80)   NOT NULL,
  duracao_min INT           NOT NULL DEFAULT 30 CHECK (duracao_min > 0),
  cor         VARCHAR(7)    NOT NULL DEFAULT '#0EA5E9',
  ativo       BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, descricao)
);

CREATE INDEX IF NOT EXISTS idx_agtipo_empresa ON tab_agendamento_tipo(empresa_id);

COMMENT ON COLUMN tab_agendamento_tipo.duracao_min IS 'Duração padrão em minutos';

-- =============================================================
-- TABELA: tab_agenda_profissional
-- Grade de disponibilidade semanal por profissional
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_agenda_profissional (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  profissional_id INT           NOT NULL REFERENCES tab_pessoa(id) ON DELETE CASCADE,
  dia_semana      SMALLINT      NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
                  -- 0=Domingo, 1=Segunda, ..., 6=Sábado
  hora_inicio     TIME          NOT NULL,
  hora_fim        TIME          NOT NULL,
  intervalo_min   INT           NOT NULL DEFAULT 30 CHECK (intervalo_min > 0),
  ativo           BOOLEAN       NOT NULL DEFAULT true,
  CONSTRAINT chk_agenda_horario CHECK (hora_fim > hora_inicio),
  UNIQUE (profissional_id, dia_semana)
);

CREATE INDEX IF NOT EXISTS idx_agenda_profissional ON tab_agenda_profissional(profissional_id);
CREATE INDEX IF NOT EXISTS idx_agenda_empresa      ON tab_agenda_profissional(empresa_id);

COMMENT ON COLUMN tab_agenda_profissional.dia_semana    IS '0=Dom 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex 6=Sáb';
COMMENT ON COLUMN tab_agenda_profissional.intervalo_min IS 'Duração de cada slot em minutos';

-- =============================================================
-- TABELA: tab_agendamento
-- Agendamentos / consultas
-- =============================================================
CREATE TABLE IF NOT EXISTS tab_agendamento (
  id               SERIAL        PRIMARY KEY,
  empresa_id       INT           NOT NULL REFERENCES tab_empresa(id),
  paciente_id      INT           NOT NULL REFERENCES tab_pessoa(id),
  profissional_id  INT           NOT NULL REFERENCES tab_pessoa(id),
  tipo_id          INT           REFERENCES tab_agendamento_tipo(id),
  especialidade_id INT           REFERENCES tab_especialidade(id),
  data_hora_inicio TIMESTAMPTZ   NOT NULL,
  data_hora_fim    TIMESTAMPTZ   NOT NULL,
  status           VARCHAR(20)   NOT NULL DEFAULT 'AGENDADO'
                     CHECK (status IN ('AGENDADO','CONFIRMADO','AGUARDANDO','ATENDIDO','FALTOU','CANCELADO')),
  motivo           VARCHAR(255),
  observacao       TEXT,
  created_by       VARCHAR(100),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ag_horario CHECK (data_hora_fim > data_hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_ag_empresa       ON tab_agendamento(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ag_paciente      ON tab_agendamento(paciente_id);
CREATE INDEX IF NOT EXISTS idx_ag_profissional  ON tab_agendamento(profissional_id);
CREATE INDEX IF NOT EXISTS idx_ag_data          ON tab_agendamento(empresa_id, data_hora_inicio);
CREATE INDEX IF NOT EXISTS idx_ag_status        ON tab_agendamento(empresa_id, status);

CREATE TRIGGER trg_agendamento_updated_at
  BEFORE UPDATE ON tab_agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON COLUMN tab_agendamento.status IS 'AGENDADO|CONFIRMADO|AGUARDANDO|ATENDIDO|FALTOU|CANCELADO';

-- =============================================================
-- VIEW: vw_agendamentos
-- =============================================================
CREATE OR REPLACE VIEW vw_agendamentos AS
SELECT
  a.id,
  a.empresa_id,
  a.data_hora_inicio,
  a.data_hora_fim,
  a.status,
  a.motivo,
  a.observacao,
  a.created_at,
  a.updated_at,
  -- paciente
  pac.id          AS paciente_id,
  pac.nome        AS paciente_nome,
  pac.celular     AS paciente_celular,
  pac.cpf_cnpj    AS paciente_cpf,
  -- profissional
  pro.id          AS profissional_id,
  pro.nome        AS profissional_nome,
  -- tipo
  tp.id           AS tipo_id,
  tp.descricao    AS tipo_descricao,
  tp.cor          AS tipo_cor,
  tp.duracao_min  AS tipo_duracao_min,
  -- especialidade
  esp.id          AS especialidade_id,
  esp.descricao   AS especialidade_descricao,
  esp.cor         AS especialidade_cor
FROM tab_agendamento a
  JOIN tab_pessoa pac  ON pac.id = a.paciente_id
  JOIN tab_pessoa pro  ON pro.id = a.profissional_id
  LEFT JOIN tab_agendamento_tipo tp  ON tp.id = a.tipo_id
  LEFT JOIN tab_especialidade    esp ON esp.id = a.especialidade_id;
