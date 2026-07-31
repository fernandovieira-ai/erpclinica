import { Pool } from 'pg'

// Pool por database — criado sob demanda, reutilizado nas requisições seguintes
const pools = new Map<string, { pool: Pool; lastUsedAt: number }>()

// PG_HOST é externo ao Railway (sem rede privada), então quedas transitórias de
// conexão acontecem. Sem eviction os pools de clientes inativos ficariam abertos
// pra sempre, aproximando o total de conexões do max_connections do Postgres.
const POOL_IDLE_EVICT_MS = 30 * 60 * 1000
const RETRYABLE_ERROR = /connection terminated|econnreset|etimedout|socket hang up/i

function isRetryableConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return RETRYABLE_ERROR.test(msg)
}

// Reexecuta uma vez só SELECTs que falharam por queda transitória de rede —
// evita que uma instabilidade momentânea vire erro 500 pro usuário.
function withConnectionRetry(pool: Pool): void {
  const originalQuery = pool.query.bind(pool)
  ;(pool as any).query = async (...args: any[]) => {
    try {
      return await (originalQuery as any)(...args)
    } catch (err) {
      const text = typeof args[0] === 'string' ? args[0] : args[0]?.text ?? ''
      const isSelect = /^\s*(select|with)\b/i.test(text)
      if (isSelect && isRetryableConnectionError(err)) {
        console.warn(`[db] retry após queda de conexão transitória: ${text.slice(0, 80)}`)
        return await (originalQuery as any)(...args)
      }
      throw err
    }
  }
}

function evictIdlePools(): void {
  const now = Date.now()
  for (const [database, entry] of pools) {
    if (now - entry.lastUsedAt > POOL_IDLE_EVICT_MS) {
      entry.pool.end().catch((err) => console.error(`[db:${database}] erro ao fechar pool ociosa`, err))
      pools.delete(database)
    }
  }
}

setInterval(evictIdlePools, 10 * 60 * 1000).unref()

export function getDb(database: string): Pool {
  let entry = pools.get(database)
  if (!entry) {
    const pool = new Pool({
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
    })
    pool.on('error', (err) => {
      console.error(`[db:${database}]`, err.message)
    })
    withConnectionRetry(pool)
    entry = { pool, lastUsedAt: Date.now() }
    pools.set(database, entry)
  }
  entry.lastUsedAt = Date.now()
  return entry.pool
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

withConnectionRetry(dbControl)
