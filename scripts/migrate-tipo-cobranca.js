/**
 * migrate-tipo-cobranca.js
 * Drop tab_forma_pagamento e cria tab_tipo_cobranca no banco hiitcor.
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
-- 1. Remove referências a tab_forma_pagamento nas tabelas filhas
ALTER TABLE tab_despesa       DROP COLUMN IF EXISTS forma_pagamento_id;
ALTER TABLE tab_receita       DROP COLUMN IF EXISTS forma_pagamento_id;
ALTER TABLE tab_titulo_pagar  DROP COLUMN IF EXISTS forma_pagamento_id;
ALTER TABLE tab_titulo_receber DROP COLUMN IF EXISTS forma_pagamento_id;

-- 2. Drop da tabela antiga
DROP TABLE IF EXISTS tab_forma_pagamento CASCADE;

-- 3. Cria nova tabela de tipo de cobrança (catálogo global, sem empresa_id)
CREATE TABLE IF NOT EXISTS tab_tipo_cobranca (
  cod_tipo_cobranca INTEGER     NOT NULL,
  des_tipo_cobranca VARCHAR(60) NOT NULL,
  ind_status        CHAR(1)     NOT NULL DEFAULT 'A'
                      CONSTRAINT tab_tipo_cobranca_status_ck CHECK (ind_status IN ('A','I')),
  CONSTRAINT tab_tipo_cobranca_pkey PRIMARY KEY (cod_tipo_cobranca)
);

COMMENT ON TABLE  tab_tipo_cobranca                    IS 'Tipos de cobrança para parcelamento e boleto';
COMMENT ON COLUMN tab_tipo_cobranca.cod_tipo_cobranca  IS 'Código manual (ex: 1=Boleto, 2=PIX, 3=Cartão Crédito)';
COMMENT ON COLUMN tab_tipo_cobranca.des_tipo_cobranca  IS 'Descrição do tipo de cobrança';
COMMENT ON COLUMN tab_tipo_cobranca.ind_status         IS 'A=Ativo, I=Inativo';

-- 4. Adiciona coluna cod_tipo_cobranca nas tabelas filhas (nullable, sem FK por ora)
ALTER TABLE tab_despesa        ADD COLUMN IF NOT EXISTS cod_tipo_cobranca INTEGER
  REFERENCES tab_tipo_cobranca(cod_tipo_cobranca) ON DELETE SET NULL;
ALTER TABLE tab_receita        ADD COLUMN IF NOT EXISTS cod_tipo_cobranca INTEGER
  REFERENCES tab_tipo_cobranca(cod_tipo_cobranca) ON DELETE SET NULL;
ALTER TABLE tab_titulo_pagar   ADD COLUMN IF NOT EXISTS cod_tipo_cobranca INTEGER
  REFERENCES tab_tipo_cobranca(cod_tipo_cobranca) ON DELETE SET NULL;
ALTER TABLE tab_titulo_receber ADD COLUMN IF NOT EXISTS cod_tipo_cobranca INTEGER
  REFERENCES tab_tipo_cobranca(cod_tipo_cobranca) ON DELETE SET NULL;

-- 5. Seed inicial
INSERT INTO tab_tipo_cobranca (cod_tipo_cobranca, des_tipo_cobranca, ind_status) VALUES
  (1, 'BOLETO BANCÁRIO', 'A'),
  (2, 'PIX',             'A'),
  (3, 'CARTÃO DE CRÉDITO', 'A'),
  (4, 'CARTÃO DE DÉBITO',  'A'),
  (5, 'TRANSFERÊNCIA / TED / DOC', 'A'),
  (6, 'DINHEIRO',         'A')
ON CONFLICT (cod_tipo_cobranca) DO NOTHING;
`

async function run() {
  const client = await pool.connect()
  try {
    process.stdout.write('Aplicando migração tipo_cobranca... ')
    await client.query(SQL)
    console.log('OK')
  } catch (err) {
    console.error('\nERRO:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
