const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const pool = new Pool({
  host: 'cloud.digitalrf.com.br',
  port: 5433,
  user: 'user_dba',
  password: '89aUS@8d7TA76g4y0Bv',
  database: 'hiitcor',
  ssl: false,
})

;(async () => {
  const client = await pool.connect()
  try {
    for (const file of ['05_schema_clinica_ajustes.sql', '06_schema_clinica_categoria.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '..', 'novos', file), 'latin1')
      process.stdout.write(`Executando ${file}... `)
      await client.query(sql)
      console.log('OK')
    }
  } catch (err) {
    console.error('\nERRO:', err.message)
    if (err.detail) console.error('Detail:', err.detail)
    if (err.hint)   console.error('Hint:', err.hint)
    process.exit(1)
  } finally {
    client.release()
    pool.end()
  }
})()
