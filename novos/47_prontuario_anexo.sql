-- =============================================================
-- 47_prontuario_anexo.sql
-- Anexos de exames/laudos por consulta — arquivo fica em disco
-- (volume /data/uploads no Railway), so o metadado fica no banco.
-- Rodar no database do cliente
-- Pre-requisito: 28_prontuario.sql ja aplicado (tab_agendamento)
-- =============================================================

SET client_encoding = 'LATIN1';

CREATE TABLE IF NOT EXISTS tab_prontuario_anexo (
  id              SERIAL        PRIMARY KEY,
  empresa_id      INT           NOT NULL REFERENCES tab_empresa(id),
  agendamento_id  INT           NOT NULL REFERENCES tab_agendamento(id) ON DELETE CASCADE,
  nome_arquivo    VARCHAR(255)  NOT NULL,
  tipo_mime       VARCHAR(100),
  tamanho_bytes   INT,
  caminho_arquivo VARCHAR(500)  NOT NULL,
  created_by      VARCHAR(100),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prontuario_anexo_agendamento ON tab_prontuario_anexo(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_prontuario_anexo_empresa     ON tab_prontuario_anexo(empresa_id);

COMMENT ON TABLE tab_prontuario_anexo IS 'Anexos (exames/laudos) de uma consulta — arquivo em disco, caminho_arquivo relativo a UPLOADS_DIR';
COMMENT ON COLUMN tab_prontuario_anexo.caminho_arquivo IS 'Caminho relativo dentro do volume de uploads, ex: prontuario/123/1690000000000-laudo.pdf';
