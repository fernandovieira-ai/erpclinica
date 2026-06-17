const { Pool } = require('pg')
const p = new Pool({ host: 'cloud.digitalrf.com.br', port: 5433, database: 'hiitcor', user: 'user_dba', password: '89aUS@8d7TA76g4y0Bv', ssl: false })

async function run() {
  const { rows } = await p.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'tab_despesa_rateio' ORDER BY ordinal_position`
  )
  console.log('Colunas tab_despesa_rateio:')
  rows.forEach(c => console.log(' ', c.column_name, '-', c.data_type))

  // tenta inserir um registro de teste para ver se há erro de FK ou constraint
  try {
    const despesas = await p.query(`SELECT id, empresa_id FROM tab_despesa ORDER BY id DESC LIMIT 1`)
    if (!despesas.rows.length) { console.log('Nenhuma despesa encontrada'); return }
    const { id: despesa_id } = despesas.rows[0]
    console.log('\nUltima despesa id:', despesa_id)

    const centros = await p.query(`SELECT id FROM tab_centro_custo LIMIT 1`)
    if (!centros.rows.length) { console.log('Nenhum centro de custo encontrado'); return }
    const { id: centro_custo_id } = centros.rows[0]

    await p.query(
      `INSERT INTO tab_despesa_rateio (despesa_id, centro_custo_id, percentual, valor) VALUES ($1,$2,$3,$4)`,
      [despesa_id, centro_custo_id, 100, 50]
    )
    console.log('INSERT OK — rateio salvo com sucesso!')
    await p.query(`DELETE FROM tab_despesa_rateio WHERE despesa_id=$1`, [despesa_id])
    console.log('DELETE OK — limpeza feita')
  } catch (e) {
    console.error('ERRO no INSERT:', e.message)
  }
}
run().finally(() => p.end())
