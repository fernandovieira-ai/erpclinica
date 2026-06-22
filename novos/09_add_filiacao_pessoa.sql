-- Filiação e relacionamentos familiares
ALTER TABLE tab_pessoa
  ADD COLUMN IF NOT EXISTS pai_pessoa_id      INT REFERENCES tab_pessoa(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pai_nome           VARCHAR(150),
  ADD COLUMN IF NOT EXISTS pai_profissao      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pai_paciente       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS mae_pessoa_id      INT REFERENCES tab_pessoa(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mae_nome           VARCHAR(150),
  ADD COLUMN IF NOT EXISTS mae_profissao      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS mae_paciente       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS conjuge_pessoa_id  INT REFERENCES tab_pessoa(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conjuge_nome       VARCHAR(150),
  ADD COLUMN IF NOT EXISTS conjuge_profissao  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS conjuge_paciente   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS indicacao_pessoa_id INT REFERENCES tab_pessoa(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS indicacao_nome     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS indicacao_fone     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS indicacao_ligacao  VARCHAR(150);
