-- =============================================================
-- 34_logo_empresa.sql
-- Logo da empresa (cliente), exibida no dashboard - nao confundir
-- com a logo do sistema (fixa, em public/brand)
-- =============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_empresa
  ADD COLUMN IF NOT EXISTS logo_base64 TEXT;

COMMENT ON COLUMN tab_empresa.logo_base64 IS 'Logo da empresa em data URL base64 (image/png), exibida no dashboard';
