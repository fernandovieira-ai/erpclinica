/**
 * _run1213.js
 * Aplica migrações 11_add_valor_tipo_atendimento → 12_add_categoria_recebimentos
 *                  → 12_add_tipo_categoria_valor → 13_add_pix_condicao_pagamento
 * + GRANTs para o usuário hiitcor
 * Uso: node scripts/_run1213.js
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

const ROOT = path.join(__dirname, '..', 'novos')

const SCRIPTS = [
  '11_add_valor_tipo_atendimento.sql',
  '12_add_categoria_recebimentos.sql',
  '12_add_tipo_categoria_valor.sql',
  '13_add_pix_condicao_pagamento.sql',
]

;(async () => {
  const client = await pool.connect()
  try {
    // ── Executar cada script em sequência ──────────────────────────────
    for (const file of SCRIPTS) {
      process.stdout.write(`Executando ${file}... `)
      const sql = fs.readFileSync(path.join(ROOT, file), 'latin1')
      await client.query(sql)
      console.log('OK')
    }

    // ── GRANTs para o app user hiitcor ─────────────────────────────────
    process.stdout.write('Fazendo GRANTs para hiitcor... ')
    await client.query(`
      -- tab_categoria (criada no 06, pode não ter grant anterior)
      GRANT SELECT, INSERT, UPDATE, DELETE ON tab_categoria TO hiitcor;
      GRANT USAGE, SELECT ON SEQUENCE tab_categoria_id_seq TO hiitcor;

      -- tab_tipo_categoria_valor (criada no 12_add_categoria_recebimentos)
      GRANT SELECT, INSERT, UPDATE, DELETE ON tab_tipo_categoria_valor TO hiitcor;
      GRANT USAGE, SELECT ON SEQUENCE tab_tipo_categoria_valor_id_seq TO hiitcor;

      -- tab_recebimento_consulta (criada no 12_add_categoria_recebimentos)
      GRANT SELECT, INSERT, UPDATE, DELETE ON tab_recebimento_consulta TO hiitcor;
      GRANT USAGE, SELECT ON SEQUENCE tab_recebimento_consulta_id_seq TO hiitcor;

      -- tab_agendamento_tipo_categoria (criada no 12_add_tipo_categoria_valor)
      GRANT SELECT, INSERT, UPDATE, DELETE ON tab_agendamento_tipo_categoria TO hiitcor;
      GRANT USAGE, SELECT ON SEQUENCE tab_agendamento_tipo_categoria_id_seq TO hiitcor;

      -- vw_recebimentos_consulta (view criada no 13)
      GRANT SELECT ON vw_recebimentos_consulta TO hiitcor;
    `)
    console.log('OK')

    // ── Listar tabelas/views criadas ────────────────────────────────────
    const { rows } = await client.query(`
      SELECT table_name, table_type
        FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN (
               'tab_categoria',
               'tab_tipo_categoria_valor',
               'tab_recebimento_consulta',
               'tab_agendamento_tipo_categoria',
               'vw_recebimentos_consulta'
             )
       ORDER BY table_name
    `)
    console.log('\nObjetos verificados:')
    rows.forEach(r => console.log(`  ${r.table_type.padEnd(10)} ${r.table_name}`))

    // Verificar colunas novas nas tabelas alteradas
    const { rows: cols } = await client.query(`
      SELECT table_name, column_name, data_type
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND (
               (table_name = 'tab_agendamento_tipo' AND column_name = 'valor')
               OR (table_name = 'tab_condicao_pagamento' AND column_name IN ('tipo_pagamento','conta_banco_pix_id'))
               OR (table_name = 'tab_recebimento_consulta' AND column_name = 'movimento_banco_id')
             )
       ORDER BY table_name, column_name
    `)
    if (cols.length > 0) {
      console.log('\nColunas adicionadas:')
      cols.forEach(c => console.log(`  ${c.table_name}.${c.column_name} (${c.data_type})`))
    }

    console.log('\n✅ Migrações 11-12-13 aplicadas com sucesso.')
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
