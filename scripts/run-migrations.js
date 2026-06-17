/**
 * run-migrations.js
 * Dropa tudo no public e executa 01→02→04 no banco do cliente
 * Uso: node scripts/run-migrations.js
 */
const { Pool } = require('pg')
const fs       = require('fs')
const path     = require('path')

const pool = new Pool({
  host:     'cloud.digitalrf.com.br',
  port:     5433,
  user:     'user_dba',
  password: '89aUS@8d7TA76g4y0Bv',
  database: 'hiitcor',
  ssl:      false,
})

const ROOT = path.join(__dirname, '..', 'novos')

const SCRIPTS = [
  '01_schema_cadastros.sql',
  '02_schema_financeiro.sql',
  '03_schema_fiscal.sql',
]
// seed fica na raiz do projeto
const SEED = path.join(__dirname, '..', '04_seed_tab_banco.sql')

// Dropa todas as tabelas e views do schema public em ordem segura
const DROP_ALL = `
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Views
  FOR r IN (SELECT table_name FROM information_schema.views
            WHERE table_schema = 'public') LOOP
    EXECUTE 'DROP VIEW IF EXISTS ' || quote_ident(r.table_name) || ' CASCADE';
  END LOOP;
  -- Tabelas
  FOR r IN (SELECT tablename FROM pg_tables
            WHERE schemaname = 'public') LOOP
    EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END;
$$;
`

async function run() {
  const client = await pool.connect()
  try {
    // 1. Limpa tudo
    process.stdout.write('Limpando schema public... ')
    await client.query(DROP_ALL)
    console.log('OK')

    // 2. Executa cada script em sequência
    for (const script of SCRIPTS) {
      process.stdout.write(`Executando ${script}... `)
      const sql = fs.readFileSync(path.join(ROOT, script), 'latin1')
      await client.query(sql)
      console.log('OK')
    }
    // Seed de bancos (na raiz)
    process.stdout.write('Executando 04_seed_tab_banco.sql... ')
    await client.query(fs.readFileSync(SEED, 'latin1'))
    console.log('OK')

    console.log('\n✅ Banco hiitcor recriado com sucesso.')

    // 3. Lista tabelas criadas
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    )
    console.log(`\nTabelas (${rows.length}):`)
    rows.forEach(r => console.log(' ', r.table_name))

  } catch (err) {
    console.error('\n❌ ERRO:', err.message)
    if (err.detail)   console.error('   Detail:', err.detail)
    if (err.position) console.error('   Position:', err.position)
    process.exit(1)
  } finally {
    client.release()
    pool.end()
  }
}

run()
