// Verificação JWT mínima para Edge Runtime (middleware)
// Usa apenas Web Crypto API — sem dependências externas

function base64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=')
  return atob(padded)
}

export async function verifyTokenEdge(token: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const secret = process.env.JWT_SECRET!
    const key    = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    const data      = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const sigBytes  = Uint8Array.from(base64urlDecode(parts[2]), c => c.charCodeAt(0))
    const valid     = await crypto.subtle.verify('HMAC', key, sigBytes, data)
    if (!valid) return null

    const payload = JSON.parse(base64urlDecode(parts[1])) as Record<string, unknown>

    // Verifica expiração
    if (payload.exp && typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) {
      return null
    }

    return payload
  } catch {
    return null
  }
}
