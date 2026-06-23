/**
 * _run15.js
 * Aplica 15_recebimento_com_triggers.sql + GRANTs para hiitcor
 * Uso: node scripts/_run15.js
 */
const { Pool } = require('pg')
const fs   = require('fs')
const path = require('path')

const pool = new Pool({
  host:     'cloud.digitalrf.com.br',
  port:     5433,
  user:     'user_dba',
  password: '89aUS@8d7TA76g4y0Bv',
  database: 'hiitcor',
  ssl:      false,
})

;(async () => {
  const client = await pool.connect()
  try {
    process.stdout.write('Executando 15_recebimento_com_triggers.sql... ')
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'novos', '15_recebimento_com_triggers.sql'),
      'latin1'
    )
    await client.query(sql)
    console.log('OK')

    process.stdout.write('Fazendo GRANTs para hiitcor... ')
    await client.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON tab_recebimento_consulta TO hiitcor;
      GRANT EXECUTE ON FUNCTION fn_processar_recebimento_movimento()        TO hiitcor;
      GRANT EXECUTE ON FUNCTION fn_estornar_recebimento(INT, VARCHAR, VARCHAR) TO hiitcor;
    `)
    console.log('OK')

    // Verificar resultado
    const { rows: triggers } = await client.query(`
      SELECT trigger_name, event_object_table, action_timing
        FROM information_schema.triggers
       WHERE trigger_name IN ('trg_movimento_caixa_recebimento','trg_movimento_banco_recebimento')
       ORDER BY trigger_name
    `)
    console.log('\nTriggers criadas:')
    triggers.forEach(t => console.log(`  ${t.trigger_name} → ${t.event_object_table} (${t.action_timing})`))

    const { rows: cols } = await client.query(`
      SELECT table_name, column_name
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
               (table_name = 'tab_recebimento_consulta' AND column_name = 'status_recebimento')
               OR (table_name = 'tab_movimento_caixa'   AND column_name IN ('origem_modulo','origem_id'))
               OR (table_name = 'tab_movimento_banco'   AND column_name IN ('origem_modulo','origem_id'))
             )
       ORDER BY table_name, column_name
    `)
    console.log('\nColunas adicionadas:')
    cols.forEach(c => console.log(`  ${c.table_name}.${c.column_name}`))

    console.log('\n✅ Script 15 aplicado com sucesso.')
  } catch (err) {
    console.error('\n❌ ERRO:', err.message)
    if (err.detail) console.error('  Detail:', err.detail)
    if (err.hint)   console.error('  Hint:',   err.hint)
    process.exit(1)
  } finally {
    client.release()
    pool.end()
  }
})()
