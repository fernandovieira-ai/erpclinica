const path = require('path')
const { Pool } = require('pg')

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const DB_NAME     = process.argv[2] || 'hiitcor'
const EMPRESA_ID  = 1
const CONTA_BANCO = 1
const ADQUIRENTE  = 'CIELO'

// Calibrado a partir do relatorio_vendas_recebidas_detalhadas_28-10-2026_09_30_22.csv
// (cliente hiiltcor). Onde a planilha so tinha 1-2 transacoes (Elo, Amex), o numero
// e marcado como [ESTIMATIVA BAIXA CONFIANCA] no comentario -- revisar quando houver
// mais vendas reais dessa bandeira/modalidade.
//
// NUM_PARCELAS = 10 em todo credito (mesmo Amex, sem parcelado observado na planilha)
// para o seletor de parcelas aparecer na hora da venda -- usuario pediu
// explicitamente pra nao travar isso em 1.
const PLANO = [
  {
    descricao: 'MASTERCARD DEBITO', tipo_pagamento: 'debito', bandeira: 'MASTERCARD',
    num_parcelas: 1, intervalo_dias: 0,
    taxas: [{ de: 1, ate: 99, mdr: 0.99, antecip: 0, prazo: 1 }], // n=7, planilha
  },
  {
    descricao: 'ELO DEBITO', tipo_pagamento: 'debito', bandeira: 'ELO',
    num_parcelas: 1, intervalo_dias: 0,
    taxas: [{ de: 1, ate: 99, mdr: 1.80, antecip: 0, prazo: 1 }], // n=5, planilha
  },
  {
    descricao: 'MASTERCARD CREDITO', tipo_pagamento: 'credito', bandeira: 'MASTERCARD',
    num_parcelas: 10, intervalo_dias: 30,
    taxas: [
      { de: 1, ate: 1,  mdr: 3.24, antecip: 0,    prazo: 1 }, // n=2, planilha
      { de: 2, ate: 10, mdr: 3.81, antecip: 1.67, prazo: 1 }, // n=7, planilha
    ],
  },
  {
    descricao: 'ELO CREDITO', tipo_pagamento: 'credito', bandeira: 'ELO',
    num_parcelas: 10, intervalo_dias: 30,
    taxas: [
      { de: 1, ate: 1,  mdr: 3.95, antecip: 0,    prazo: 1 }, // n=1 [ESTIMATIVA BAIXA CONFIANCA]
      { de: 2, ate: 10, mdr: 5.48, antecip: 1.67, prazo: 1 }, // n=1 (so 5x observado) [ESTIMATIVA BAIXA CONFIANCA]
    ],
  },
  {
    descricao: 'AMEX CREDITO', tipo_pagamento: 'credito', bandeira: 'AMEX',
    num_parcelas: 10, intervalo_dias: 30,
    taxas: [
      { de: 1, ate: 1,  mdr: 4.70, antecip: 0,    prazo: 1 }, // n=1, planilha
      { de: 2, ate: 10, mdr: 4.70, antecip: 1.67, prazo: 1 }, // [ESTIMATIVA -- zero parcelado Amex na planilha, usa base a vista + antecipacao universal]
    ],
  },
]

async function main() {
  const pool = new Pool({
    host: process.env.PG_HOST, port: Number(process.env.PG_PORT),
    user: process.env.PG_USER, password: process.env.PG_PASSWORD,
    database: DB_NAME, ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const item of PLANO) {
      const existente = await client.query(
        `SELECT id FROM tab_condicao_pagamento WHERE empresa_id = $1 AND descricao = $2`,
        [EMPRESA_ID, item.descricao],
      )
      if (existente.rows.length) {
        console.log(`[SKIP] "${item.descricao}" ja existe (id=${existente.rows[0].id}) -- nao duplica.`)
        continue
      }

      const tipo          = item.tipo_pagamento === 'credito' ? 'P' : 'V'
      const numParcelas    = item.tipo_pagamento === 'credito' ? item.num_parcelas : 1
      const intervaloDias  = item.tipo_pagamento === 'credito' ? item.intervalo_dias : 0

      const ins = await client.query(
        `INSERT INTO tab_condicao_pagamento
           (empresa_id, descricao, tipo, num_parcelas, intervalo_dias, entrada_pct, tipo_pagamento,
            conta_banco_pix_id, conta_banco_cartao_id, adquirente, bandeira, ativo)
         VALUES ($1, $2, $3, $4, $5, 0, $6, NULL, $7, $8, $9, true)
         RETURNING id`,
        [EMPRESA_ID, item.descricao, tipo, numParcelas, intervaloDias, item.tipo_pagamento, CONTA_BANCO, ADQUIRENTE, item.bandeira],
      )
      const condId = ins.rows[0].id
      console.log(`[OK] "${item.descricao}" criada, id=${condId} (num_parcelas=${numParcelas}).`)

      for (const t of item.taxas) {
        await client.query(
          `INSERT INTO tab_taxa_cartao
             (condicao_pagamento_id, percentual_mdr, percentual_antecipacao_am, prazo_recebimento_dias, parcelas_de, parcelas_ate, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [condId, t.mdr, t.antecip, t.prazo, t.de, t.ate, 'script cadastrar_taxas_cartao_hiiltcor_completo'],
        )
        console.log(`       faixa ${t.de}-${t.ate}x: MDR=${t.mdr}% antecip=${t.antecip}%a.m. prazo=${t.prazo}d`)
      }
    }

    // cosmetico: VISA DEBITO tinha antecipacao=0.99% cadastrada por engano
    // (debito nunca tem mais de 1 parcela, esse campo nao faz efeito, mas
    // deixa a leitura do cadastro confusa)
    const fixDebito = await client.query(
      `UPDATE tab_taxa_cartao t SET percentual_antecipacao_am = 0
       FROM tab_condicao_pagamento cp
       WHERE t.condicao_pagamento_id = cp.id AND cp.descricao = 'VISA DEBITO' AND t.percentual_antecipacao_am <> 0`,
    )
    if (fixDebito.rowCount) console.log(`[OK] VISA DEBITO: antecipacao zerada (campo nao usado em debito).`)

    await client.query('COMMIT')

    const { rows } = await client.query(`
      SELECT cp.id, cp.descricao, cp.adquirente, cp.bandeira, cp.tipo_pagamento, cp.num_parcelas,
             t.percentual_mdr, t.percentual_antecipacao_am, t.prazo_recebimento_dias, t.parcelas_de, t.parcelas_ate
      FROM tab_condicao_pagamento cp
      LEFT JOIN tab_taxa_cartao t ON t.condicao_pagamento_id = cp.id
      WHERE cp.tipo_pagamento IN ('debito','credito')
      ORDER BY cp.bandeira, cp.tipo_pagamento, t.parcelas_de
    `)
    console.log('\n--- Estado final ---')
    console.table(rows)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error('[ERRO]', err.message); process.exit(1) })
