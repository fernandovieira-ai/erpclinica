const path = require('path')
const fs   = require('fs')
const { Pool } = require('pg')

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const DB_NAME = process.argv[2] || 'hiitcor'

async function main() {
  const pool = new Pool({
    host:     process.env.PG_HOST,
    port:     Number(process.env.PG_PORT),
    user:     process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: DB_NAME,
    ssl:      process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  })

  const sql = fs.readFileSync(path.join(__dirname, '..', 'novos', '79_data_prevista_antecipacao_automatica.sql'), 'utf8')

  try {
    await pool.query(sql)
    console.log(`[OK] Migração 79 aplicada em "${DB_NAME}".`)
  } finally {
    await pool.end()
  }
}

main().catch(err => { console.error('[ERRO]', err.message); process.exit(1) })
