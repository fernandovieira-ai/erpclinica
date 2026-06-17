import { Pool } from 'pg'

// Pool por database — criado sob demanda, reutilizado nas requisições seguintes
const pools = new Map<string, Pool>()

export function getDb(database: string): Pool {
  if (!pools.has(database)) {
    pools.set(database, new Pool({
      host:                    process.env.PG_HOST,
      port:                    Number(process.env.PG_PORT) || 5432,
      user:                    process.env.PG_USER,
      password:                process.env.PG_PASSWORD,
      database,
      max:                     5,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis: 5_000,
    }))
    pools.get(database)!.on('error', (err) => {
      console.error(`[db:${database}]`, err.message)
    })
  }
  return pools.get(database)!
}

// Conexão fixa para o banco de controle SaaS — usado apenas em /admin e no login
export const dbControl = new Pool({
  host:                    process.env.PG_HOST,
  port:                    Number(process.env.PG_PORT) || 5432,
  user:                    process.env.PG_USER,
  password:                process.env.PG_PASSWORD,
  database:                'saas_control',
  max:                     3,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis: 5_000,
})

dbControl.on('error', (err) => {
  console.error('[db:saas_control]', err.message)
})
