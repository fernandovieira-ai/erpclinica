import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { dbControl, getDb } from '@/lib/db'
import { signToken } from '@/lib/auth/jwt'
import { emailRecuperacaoSenha } from '@/lib/email/send'
import { rateLimited, getClientIp } from '@/lib/rate-limit'

const schema = z.object({
  slug:  z.string().min(1),
  email: z.string().email(),
})

function pwdVersion(senhaHash: string): string {
  return crypto.createHash('sha256').update(senhaHash).digest('hex').slice(0, 16)
}

export async function POST(req: NextRequest) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 })
  }

  const body = schema.safeParse(raw)
  if (!body.success) {
    return NextResponse.json({ erro: 'E-mail ou identificador inválido' }, { status: 400 })
  }

  const { slug, email } = body.data

  // Cota do Resend é baixa (ver padroes.md secao 19) — sem limite aqui, um
  // request em loop esgota o envio de e-mail do dia pra todo mundo
  const ip = getClientIp(req)
  if (
    rateLimited(`recuperar-senha:ip:${ip}`, 5, 15 * 60_000) ||
    rateLimited(`recuperar-senha:conta:${slug}:${email.toLowerCase()}`, 3, 60 * 60_000)
  ) {
    return NextResponse.json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, { status: 429 })
  }

  try {
    const { rows: inst } = await dbControl.query<{ database_name: string; status: string }>(
      `SELECT database_name, status FROM tab_instancia WHERE slug = $1 LIMIT 1`,
      [slug],
    )

    // Resposta genérica sempre que não dá pra seguir — evita confirmar/negar
    // existência de cliente ou de e-mail pra quem está tentando enumerar contas
    if (!inst.length || (inst[0].status !== 'ativo' && inst[0].status !== 'trial')) {
      return NextResponse.json({ ok: true })
    }

    const { database_name } = inst[0]
    const db = getDb(database_name)

    const { rows: users } = await db.query<{ id: number; nome: string; email: string; senha_hash: string }>(
      `SELECT id, nome, email, senha_hash FROM tab_usuario WHERE email = $1 AND ativo = true LIMIT 1`,
      [email],
    )

    if (users.length) {
      const usuario = users[0]
      const token = await signToken(
        { type: 'password_reset', usuario_id: usuario.id, database_name, pwd_v: pwdVersion(usuario.senha_hash) },
        '1h',
      )

      const resultado = await emailRecuperacaoSenha({
        email: usuario.email,
        nome:  usuario.nome,
        token,
      })

      if ('error' in resultado && resultado.error) {
        console.error('[recuperar-senha] erro Resend:', resultado.error)
        return NextResponse.json({ erro: 'Falha ao enviar e-mail. Tente novamente.' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[recuperar-senha] erro interno:', err)
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 })
  }
}
