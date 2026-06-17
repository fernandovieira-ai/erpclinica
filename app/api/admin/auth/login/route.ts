import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { dbControl } from '@/lib/db'
import { signToken } from '@/lib/auth/jwt'
import type { AdminSession } from '@/types/session'

const schema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
})

const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path:     '/',
}

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json())
  if (!body.success) {
    return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 })
  }

  const { email, senha } = body.data

  // Busca admin pelo e-mail
  const { rows } = await dbControl.query<{
    id: number; nome: string; email: string; senha_hash: string
  }>(
    `SELECT id, nome, email, senha_hash
     FROM tab_saas_admin
     WHERE email = $1 AND ativo = true
     LIMIT 1`,
    [email],
  )

  if (!rows.length || !(await bcrypt.compare(senha, rows[0].senha_hash))) {
    return NextResponse.json({ erro: 'E-mail ou senha incorretos' }, { status: 401 })
  }

  const admin: AdminSession = {
    admin_id: rows[0].id,
    email:    rows[0].email,
    nome:     rows[0].nome,
  }

  const token = await signToken(admin)
  const res   = NextResponse.json({ status: 'ok', redir: '/admin' })
  res.cookies.set('admin_session', token, { ...COOKIE_OPTS, maxAge: 60 * 60 * 8 })
  return res
}
