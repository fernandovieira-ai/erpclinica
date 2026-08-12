-- =============================================================
-- 52_normaliza_cpf_cnpj.sql
-- Normaliza cpf_cnpj para digitos puros (sem mascara) e reforca a trigger
-- de duplicidade pra sempre comparar/gravar normalizado - independente do
-- codigo da aplicacao lembrar de tirar a mascara antes de enviar.
-- Rodar no database do cliente
-- Pre-requisito: 01_schema_cadastros.sql ja aplicado (tab_pessoa, trigger)
-- =============================================================

SET client_encoding = 'LATIN1';

-- 1. Normaliza os registros existentes. Trigger desabilitada temporariamente
--    pra essa correcao em lote nao falhar caso a normalizacao faca um
--    registro migrado com mascara colidir com outro ja cadastrado sem.
ALTER TABLE tab_pessoa DISABLE TRIGGER trg_pessoa_cpf_cnpj_unico;

UPDATE tab_pessoa
SET cpf_cnpj = NULLIF(regexp_replace(cpf_cnpj, '\D', '', 'g'), '')
WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj ~ '\D';

ALTER TABLE tab_pessoa ENABLE TRIGGER trg_pessoa_cpf_cnpj_unico;

-- 2. Reforca a trigger: normaliza NEW.cpf_cnpj (grava sempre so digitos) e
--    so entao checa duplicidade - defesa em profundidade contra qualquer
--    rota que ainda mande o valor com mascara.
CREATE OR REPLACE FUNCTION fn_check_cpf_cnpj_duplicado()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cpf_cnpj IS NOT NULL THEN
    NEW.cpf_cnpj := NULLIF(regexp_replace(NEW.cpf_cnpj, '\D', '', 'g'), '');
  END IF;

  IF NEW.cpf_cnpj IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM tab_pessoa
      WHERE cpf_cnpj = NEW.cpf_cnpj
        AND id <> COALESCE(NEW.id, 0)
        AND ativo = true
    ) THEN
      RAISE EXCEPTION 'CPF/CNPJ % já cadastrado', NEW.cpf_cnpj;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
