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

  const sql = fs.readFileSync(path.join(__dirname, '..', 'novos', '77_fatura_cartao_por_adquirente.sql'), 'utf8')

  try {
    await pool.query(sql)
    console.log(`[OK] Migração 77 aplicada em "${DB_NAME}".`)
    const { rows } = await pool.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'tab_fatura_cartao'::regclass
       UNION ALL
       SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tab_fatura_cartao'`,
    )
    console.table(rows)
  } finally {
    await pool.end()
  }
}

main().catch(err => { console.error('[ERRO]', err.message); process.exit(1) })
