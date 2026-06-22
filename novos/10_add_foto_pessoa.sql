-- Foto do paciente (base64 JPEG, comprimida no client)
ALTER TABLE tab_pessoa
  ADD COLUMN IF NOT EXISTS foto TEXT;
