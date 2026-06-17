/**
 * alter-pessoa-global.js
 * Aplica o ajuste de tab_pessoa: empresa_id vira apenas informativo
 * (remove NOT NULL, recria índices, atualiza trigger de CPF/CNPJ)
 */
const { Pool } = require('pg')

const pool = new Pool({
  host:     'cloud.digitalrf.com.br',
  port:     5433,
  user:     'user_dba',
  password: '89aUS@8d7TA76g4y0Bv',
  database: 'hiitcor',
  ssl:      false,
})

const SQL = `
-- 1. empresa_id deixa de ser obrigatorio
ALTER TABLE tab_pessoa ALTER COLUMN empresa_id DROP NOT NULL;

COMMENT ON COLUMN tab_pessoa.empresa_id IS 'Empresa que cadastrou o registro - apenas informativo';

-- 2. Recria indices sem empresa_id composto
DROP INDEX IF EXISTS idx_pessoa_cpf_cnpj;
DROP INDEX IF EXISTS idx_pessoa_nome;
DROP INDEX IF EXISTS idx_pessoa_cliente;
DROP INDEX IF EXISTS idx_pessoa_fornecedor;
DROP INDEX IF EXISTS idx_pessoa_ativo;

CREATE INDEX idx_pessoa_cpf_cnpj   ON tab_pessoa(cpf_cnpj);
CREATE INDEX idx_pessoa_nome       ON tab_pessoa(nome);
CREATE INDEX idx_pessoa_cliente    ON tab_pessoa(ind_cliente)    WHERE ind_cliente = true;
CREATE INDEX idx_pessoa_fornecedor ON tab_pessoa(ind_fornecedor) WHERE ind_fornecedor = true;
CREATE INDEX idx_pessoa_ativo      ON tab_pessoa(ativo);

-- 3. Atualiza trigger: CPF/CNPJ unico globalmente (nao por empresa)
CREATE OR REPLACE FUNCTION fn_check_cpf_cnpj_duplicado()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cpf_cnpj IS NOT NULL AND NEW.cpf_cnpj <> '' THEN
    IF EXISTS (
      SELECT 1 FROM tab_pessoa
      WHERE cpf_cnpj = NEW.cpf_cnpj
        AND id <> COALESCE(NEW.id, 0)
        AND ativo = true
    ) THEN
      RAISE EXCEPTION 'CPF/CNPJ % ja cadastrado', NEW.cpf_cnpj;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`

async function run() {
  const client = await pool.connect()
  try {
    process.stdout.write('Aplicando ajuste em tab_pessoa... ')
    await client.query(SQL)
    console.log('OK')

    // Confirma resultado
    const { rows } = await client.query(`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'tab_pessoa' AND column_name = 'empresa_id'
    `)
    const col = rows[0]
    console.log(`\nempresa_id: ${col.data_type} | nullable: ${col.is_nullable}`)
    console.log('\n✅ Pronto — pessoa agora é cadastro global.')
  } catch (err) {
    console.error('\n❌ ERRO:', err.message)
    process.exit(1)
  } finally {
    client.release()
    pool.end()
  }
}

run()
