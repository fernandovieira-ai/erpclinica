-- =============================================================
-- 29_voa_config_empresa.sql
-- Configuracao da integracao Voa por empresa (evita token fixo no codigo)
-- =============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_empresa
  ADD COLUMN IF NOT EXISTS voa_auth_token VARCHAR(120),
  ADD COLUMN IF NOT EXISTS voa_ambiente   VARCHAR(20) NOT NULL DEFAULT 'desenvolvimento'
    CHECK (voa_ambiente IN ('desenvolvimento', 'producao'));

COMMENT ON COLUMN tab_empresa.voa_auth_token IS 'Token de integracao da Voa (x-voa-token), por empresa';
COMMENT ON COLUMN tab_empresa.voa_ambiente   IS 'desenvolvimento = usa o Auth Token direto; producao = fluxo de Bearer Token por consulta';
