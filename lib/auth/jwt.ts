import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import type { Session, AdminSession, SelectToken } from '@/types/session'

export type Payload = Session | AdminSession | SelectToken

const secret  = new TextEncoder().encode(process.env.JWT_SECRET!)
const expires = process.env.JWT_EXPIRES_IN ?? '8h'

export async function signToken(payload: Payload, expiresIn?: string): Promise<string> {
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn ?? expires)
    .sign(secret)
}

export async function verifyToken(token: string): Promise<Payload | null> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as Payload
  } catch {
    return null
  }
}

export function isAdminSession(p: Payload): p is AdminSession {
  return 'admin_id' in p
}

export function isSelectToken(p: Payload): p is SelectToken {
  return 'usuario_id' in p && !('empresa_id_ativa' in p)
}

export function isSession(p: Payload): p is Session {
  return 'empresa_id_ativa' in p
}
