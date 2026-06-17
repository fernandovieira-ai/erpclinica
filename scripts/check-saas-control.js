/**
 * check-saas-control.js
 * Verifica o estado atual do banco saas_control
 */
const { Pool } = require('pg')

const pool = new Pool({
  host:     'cloud.digitalrf.com.br',
  port:     5433,
  user:     'user_dba',
  password: '89aUS@8d7TA76g4y0Bv',
  database: 'saas_control',
  ssl:      false,
})

async function run() {
  const client = await pool.connect()
  try {
    // Tabelas existentes
    const { rows: tables } = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    )
    console.log('Tabelas no saas_control:')
    tables.forEach(r => console.log(' ', r.table_name))

    // Verifica colunas de tab_instancia (detectar versão)
    const { rows: cols } = await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tab_instancia'
       ORDER BY ordinal_position`
    )
    console.log('\nColunas de tab_instancia:')
    cols.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`))

    // Verifica se tem dados
    for (const t of tables) {
      const { rows } = await client.query(
        `SELECT COUNT(*) AS n FROM ${t.table_name}`
      )
      if (rows[0].n > 0) {
        console.log(`\n${t.table_name}: ${rows[0].n} registros`)
      }
    }

    // Verifica colunas de tab_saas_admin
    const { rows: adminCols } = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tab_saas_admin'
       ORDER BY ordinal_position`
    )
    console.log('\nColunas de tab_saas_admin:', adminCols.map(r => r.column_name).join(', '))

  } catch (err) {
    console.error('ERRO:', err.message)
  } finally {
    client.release()
    pool.end()
  }
}

run()
