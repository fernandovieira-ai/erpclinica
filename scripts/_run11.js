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
    const sql = fs.readFileSync(path.join(__dirname, '..', 'novos', '11_agenda_profissional_extensao.sql'), 'latin1')
    process.stdout.write('Executando 11_agenda_profissional_extensao.sql... ')
    await client.query(sql)
    console.log('OK')

    process.stdout.write('Fazendo GRANT para hiitcor... ')
    await client.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON tab_agenda_profissional_pausa    TO hiitcor;
      GRANT SELECT, INSERT, UPDATE, DELETE ON tab_agenda_profissional_excecao  TO hiitcor;
      GRANT USAGE, SELECT ON SEQUENCE tab_agenda_profissional_pausa_id_seq    TO hiitcor;
      GRANT USAGE, SELECT ON SEQUENCE tab_agenda_profissional_excecao_id_seq  TO hiitcor;
    `)
    console.log('OK')
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
