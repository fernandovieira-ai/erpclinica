// Correção pontual de celular (pedido-api-vita.pdf item 3): no cadastro migrado do
// Doctor's, boa parte dos pacientes tem o número de celular gravado em `telefone`
// (campo `celular` vazio). Copia telefone -> celular quando:
//   - celular está vazio/nulo
//   - telefone, só com dígitos, tem o formato de celular (DDD + 9 dígitos, começando
//     com 9) ou DDD + 8 dígitos (celular antigo, sem o 9 — ganha o 9 na cópia)
// Não mexe em telefone (só copia, não move) nem em celular já preenchido.
//
// Uso:
//   node scripts/corrigir_celular_pacientes.js <database_name>              → dry-run (não grava nada)
//   node scripts/corrigir_celular_pacientes.js <database_name> --commit     → grava no banco

const path = require('path')
const { Pool } = require('pg')

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const DB_NAME = process.argv[2]
const COMMIT  = process.argv.includes('--commit')

if (!DB_NAME) {
  console.error('Uso: node scripts/corrigir_celular_pacientes.js <database_name> [--commit]')
  process.exit(1)
}

function pareceCelular(digitos) {
  if (digitos.length === 11) return digitos[2] === '9'
  if (digitos.length === 10) return true // DDD + 8 dígitos, celular antigo sem o 9
  return false
}

function paraCelular(digitos) {
  return digitos.length === 10 ? digitos.slice(0, 2) + '9' + digitos.slice(2) : digitos
}

async function main() {
  const pool = new Pool({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: DB_NAME,
    ssl: process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  })

  const client = await pool.connect()
  try {
    const { rows } = await client.query(
      `SELECT id, nome, telefone, celular FROM tab_pessoa
       WHERE ind_paciente = true AND ativo = true
         AND (celular IS NULL OR TRIM(celular) = '')
         AND telefone IS NOT NULL AND TRIM(telefone) <> ''`,
    )

    const candidatos = rows
      .map((r) => ({ ...r, digitos: String(r.telefone).replace(/\D/g, '') }))
      .filter((r) => pareceCelular(r.digitos))

    console.log(`Pacientes sem celular: ${rows.length}`)
    console.log(`Com telefone no formato de celular (candidatos à cópia): ${candidatos.length}`)
    console.log(JSON.stringify(candidatos.slice(0, 10).map((c) => ({
      id: c.id, nome: c.nome, telefone: c.telefone, celular_novo: paraCelular(c.digitos),
    })), null, 2))

    if (!COMMIT) {
      console.log('\n[DRY-RUN] Nenhuma gravação feita no banco. Rode com --commit para gravar.')
      return
    }

    await client.query('BEGIN')
    for (const c of candidatos) {
      await client.query(
        `UPDATE tab_pessoa SET celular = $1, updated_at = NOW() WHERE id = $2`,
        [paraCelular(c.digitos), c.id],
      )
    }
    await client.query('COMMIT')
    console.log(`\n${candidatos.length} paciente(s) corrigido(s).`)
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* nada a desfazer */ }
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
