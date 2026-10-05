-- =============================================================
-- 65_paciente_campos_obrigatorios.sql
-- Parametros por empresa: quais campos sao obrigatorios no cadastro
-- rapido de paciente (modal Novo Agendamento). Antes a obrigatoriedade
-- era fixa no codigo do front (nome + data de nascimento + celular);
-- agora cada empresa decide via Cadastro > Empresas, sem precisar
-- alterar codigo.
-- =============================================================

SET client_encoding = 'LATIN1';

ALTER TABLE tab_empresa
  ADD COLUMN IF NOT EXISTS paciente_exige_data_nascimento BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paciente_exige_cpf_cnpj        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paciente_exige_celular          BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN tab_empresa.paciente_exige_data_nascimento IS 'Se true, o cadastro rapido de paciente (modal de agendamento) exige data de nascimento';
COMMENT ON COLUMN tab_empresa.paciente_exige_cpf_cnpj        IS 'Se true, o cadastro rapido de paciente (modal de agendamento) exige CPF/CNPJ';
COMMENT ON COLUMN tab_empresa.paciente_exige_celular         IS 'Se true, o cadastro rapido de paciente (modal de agendamento) exige celular';
