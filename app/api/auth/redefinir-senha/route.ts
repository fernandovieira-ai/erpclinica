import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/db'
import { verifyToken, isPasswordResetToken } from '@/lib/auth/jwt'
import { rateLimited, getClientIp } from '@/lib/rate-limit'

const schema = z.object({
  token: z.string().min(1),
  senha: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
})

function pwdVersion(senhaHash: string): string {
  return crypto.createHash('sha256').update(senhaHash).digest('hex').slice(0, 16)
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (rateLimited(`redefinir-senha:ip:${ip}`, 10, 15 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 })
  }

  const body = schema.safeParse(raw)
  if (!body.success) {
    return NextResponse.json({ erro: body.error.issues[0]?.message ?? 'Dados inválidos' }, { status: 400 })
  }

  const { token, senha } = body.data

  const payload = await verifyToken(token)
  if (!payload || !isPasswordResetToken(payload)) {
    return NextResponse.json({ erro: 'Link inválido ou expirado. Solicite um novo.' }, { status: 400 })
  }

  const { usuario_id, database_name, pwd_v } = payload

  try {
    const db = getDb(database_name)

    const { rows } = await db.query<{ id: number; senha_hash: string }>(
      `SELECT id, senha_hash FROM tab_usuario WHERE id = $1 AND ativo = true LIMIT 1`,
      [usuario_id],
    )
    if (!rows.length) {
      return NextResponse.json({ erro: 'Usuário não encontrado' }, { status: 404 })
    }

    // Token de uso único: se a senha já mudou desde que o link foi emitido
    // (por este mesmo link ou por qualquer outro meio), a fingerprint não bate mais
    if (pwdVersion(rows[0].senha_hash) !== pwd_v) {
      return NextResponse.json({ erro: 'Link inválido ou expirado. Solicite um novo.' }, { status: 400 })
    }

    const senhaHash = await bcrypt.hash(senha, 10)
    await db.query(`UPDATE tab_usuario SET senha_hash = $1 WHERE id = $2`, [senhaHash, usuario_id])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[redefinir-senha] erro interno:', err)
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 })
  }
}
