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
      ssl:                     process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
      max:                     5,
      idleTimeoutMillis:       30_000,
      connectionTimeoutMillis: 5_000,
      keepAlive:               true,
      keepAliveInitialDelayMillis: 10_000,
    }))
    pools.get(database)!.on('error', (err) => {
      console.error(`[db:${database}]`, err.message)
    })
  }
  return pools.get(database)!
}

// Conexão fixa para o banco de controle SaaS — usado apenas em /admin e no login.
// Usuário dedicado (PG_CONTROL_USER) porque o pg_hba.conf do servidor libera
// cada usuário só nos bancos que ele efetivamente precisa acessar.
export const dbControl = new Pool({
  host:                    process.env.PG_HOST,
  port:                    Number(process.env.PG_PORT) || 5432,
  user:                    process.env.PG_CONTROL_USER,
  password:                process.env.PG_CONTROL_PASSWORD,
  database:                'saas_control',
  ssl:                     process.env.PG_SSL === 'false' ? false : { rejectUnauthorized: false },
  max:                     3,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis: 5_000,
  keepAlive:               true,
  keepAliveInitialDelayMillis: 10_000,
})

dbControl.on('error', (err) => {
  console.error('[db:saas_control]', err.message)
})
