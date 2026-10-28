const path = require('path')
const { Pool } = require('pg')

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const DB_NAME = process.argv[2] || 'hiitcor'

// Calibrado a partir do relatorio_vendas_recebidas_detalhadas_28-10-2026_09_30_22.csv
// (cliente hiiltcor) -- ver analise na conversa: MDR base ~3.25% e antecipacao
// ~1.67% a.m. usando so o cluster mais recente de transacoes (13/10 a 27/10/2026),
// que parece refletir a tabela de taxa vigente hoje (transacoes de 01/10 tinham
// MDR ~3.41%, provavelmente tabela antiga ja substituida -- o sistema nao guarda
// historico de vigencia, so a taxa atual).
const CONDICAO_ID   = 8 // "VISA CREDITO"
const MDR_BASE       = 3.25
const ANTECIPACAO_AM = 1.67
const PRAZO_DIAS     = 1 // D+1, observado em todas as transacoes (a vista e parceladas)

async function main() {
  const pool = new Pool({
    host:     process.env.PG_HOST,
    port:     Number(process.env.PG_PORT),
    user:     process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: DB_NAME,
    ssl:      process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const cond = await client.query(
      `SELECT id, descricao, adquirente, bandeira, num_parcelas FROM tab_condicao_pagamento WHERE id = $1`,
      [CONDICAO_ID],
    )
    if (!cond.rows.length) throw new Error(`Condicao de pagamento ${CONDICAO_ID} nao encontrada`)
    console.log('[antes]', cond.rows[0])

    await client.query(
      `UPDATE tab_condicao_pagamento SET adquirente = 'CIELO' WHERE id = $1`,
      [CONDICAO_ID],
    )

    const del = await client.query(
      `DELETE FROM tab_taxa_cartao WHERE condicao_pagamento_id = $1`,
      [CONDICAO_ID],
    )
    console.log(`[OK] Removidas ${del.rowCount} faixa(s) antiga(s) (placeholder 1x/2x).`)

    const ins = await client.query(
      `INSERT INTO tab_taxa_cartao
         (condicao_pagamento_id, percentual_mdr, percentual_antecipacao_am, prazo_recebimento_dias,
          parcelas_de, parcelas_ate, created_by)
       VALUES ($1, $2, $3, $4, 1, 10, $5)
       RETURNING id`,
      [CONDICAO_ID, MDR_BASE, ANTECIPACAO_AM, PRAZO_DIAS, 'script cadastrar_taxa_visa_credito_hiiltcor'],
    )
    console.log(`[OK] Faixa unica 1-10x cadastrada, id=${ins.rows[0].id} (MDR=${MDR_BASE}%, antecipacao=${ANTECIPACAO_AM}% a.m., prazo=${PRAZO_DIAS}d).`)

    await client.query('COMMIT')

    const depois = await client.query(
      `SELECT t.id, cp.descricao, cp.adquirente, cp.bandeira, t.percentual_mdr, t.percentual_antecipacao_am,
              t.prazo_recebimento_dias, t.parcelas_de, t.parcelas_ate
       FROM tab_taxa_cartao t JOIN tab_condicao_pagamento cp ON cp.id = t.condicao_pagamento_id
       WHERE t.condicao_pagamento_id = $1`,
      [CONDICAO_ID],
    )
    console.log('[depois]')
    console.table(depois.rows)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error('[ERRO]', err.message); process.exit(1) })
