-- Dados pessoais adicionais para pessoa física
ALTER TABLE tab_pessoa ADD COLUMN IF NOT EXISTS sexo          CHAR(1);
ALTER TABLE tab_pessoa ADD COLUMN IF NOT EXISTS cor_raca      VARCHAR(20);
ALTER TABLE tab_pessoa ADD COLUMN IF NOT EXISTS estado_civil  VARCHAR(20);
ALTER TABLE tab_pessoa ADD COLUMN IF NOT EXISTS naturalidade  VARCHAR(80);

COMMENT ON COLUMN tab_pessoa.sexo         IS 'Sexo: F=Feminino, M=Masculino';
COMMENT ON COLUMN tab_pessoa.cor_raca     IS 'Cor/Raça: BRANCA, PRETA, PARDA, AMARELA, INDIGENA';
COMMENT ON COLUMN tab_pessoa.estado_civil IS 'Estado civil: SOLTEIRO, CASADO, DIVORCIADO, VIUVO, UNIAO_ESTAVEL';
COMMENT ON COLUMN tab_pessoa.naturalidade IS 'Naturalidade (cidade de nascimento)';
