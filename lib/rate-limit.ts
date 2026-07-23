// Limitador em memória — o serviço roda numa única réplica no Railway
// (ver padroes.md secao 18), então um Map local é suficiente, sem Redis.
const buckets = new Map<string, number[]>()

// Verdadeiro se `key` já estourou `limit` tentativas na janela `windowMs`.
// Efeito colateral: registra a tentativa atual (mesmo quando limitada).
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const tentativas = (buckets.get(key) ?? []).filter(t => now - t < windowMs)

  if (tentativas.length >= limit) {
    buckets.set(key, tentativas)
    return true
  }

  tentativas.push(now)
  buckets.set(key, tentativas)
  return false
}

export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
}
