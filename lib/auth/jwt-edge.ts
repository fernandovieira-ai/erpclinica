// Verificação JWT mínima para Edge Runtime (middleware)
// Usa apenas Web Crypto API — sem dependências externas

function base64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// Devolve os bytes crus do base64url — NUNCA tratar o retorno de atob() como
// string de texto: atob() produz uma "binary string" (1 char = 1 byte), e
// passar isso direto pro JSON.parse quebra qualquer caractere acentuado
// (UTF-8 multibyte) em caracteres soltos. Decodificar sempre via TextDecoder
// a partir destes bytes. BUG HISTÓRICO (corrigido aqui): verifyTokenEdge
// fazia JSON.parse(atob(...)) direto — cada requisição no middleware (que
// renova a sessão a cada request) re-assinava o payload já corrompido,
// DOBRANDO o tamanho de qualquer campo com acento (ex.: "nome") a cada
// requisição. Em poucas navegações isso estourava colunas VARCHAR(100)
// como created_by (ver fix(auth): trunca nome da sessao).
function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=')
  const binary = atob(padded)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Reemite um JWT já validado com um novo prazo de expiração — usado pelo
// middleware pra renovar a sessão a cada requisição (sliding expiration),
// sem precisar da dependência `jose` (evitada aqui de propósito).
export async function signTokenEdge(payload: Record<string, unknown>, expiresInSeconds: number): Promise<string> {
  const secret = process.env.JWT_SECRET!
  const key    = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const now    = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const body   = { ...payload, iat: now, exp: now + expiresInSeconds }

  const headerB64  = base64url(new TextEncoder().encode(JSON.stringify(header)).buffer as ArrayBuffer)
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(body)).buffer as ArrayBuffer)
  const signingInput = `${headerB64}.${payloadB64}`

  const sig     = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  const sigB64  = base64url(sig)

  return `${signingInput}.${sigB64}`
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
    const sigBytes  = base64urlDecode(parts[2])
    const valid     = await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, data)
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1]))) as Record<string, unknown>

    // Verifica expiração
    if (payload.exp && typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) {
      return null
    }

    return payload
  } catch {
    return null
  }
}
