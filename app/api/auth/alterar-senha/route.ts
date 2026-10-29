import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { alterarSenhaSchema } from '@/lib/validators/alterar-senha.schema'
import { registrarAuditoria } from '@/lib/auditoria'
import { rateLimited } from '@/lib/rate-limit'

// POST /api/auth/alterar-senha — autoatendimento: o próprio usuário logado troca a sua senha
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  if (rateLimited(`alterar-senha:usuario:${session.usuario_id}`, 10, 15 * 60_000)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 })
  }

  const body = alterarSenhaSchema.safeParse(raw)
  if (!body.success) {
    return NextResponse.json({ erro: body.error.issues[0]?.message ?? 'Dados inválidos' }, { status: 400 })
  }

  const { senha_atual, senha_nova } = body.data
  const db = getDb(session.database_name)

  const { rows } = await db.query<{ senha_hash: string }>(
    `SELECT senha_hash FROM tab_usuario WHERE id = $1 AND ativo = true LIMIT 1`,
    [session.usuario_id],
  )
  if (!rows.length) return NextResponse.json({ erro: 'Usuário não encontrado' }, { status: 404 })

  const senhaOk = await bcrypt.compare(senha_atual, rows[0].senha_hash)
  if (!senhaOk) return NextResponse.json({ erro: 'Senha atual incorreta' }, { status: 400 })

  const senhaIgual = await bcrypt.compare(senha_nova, rows[0].senha_hash)
  if (senhaIgual) return NextResponse.json({ erro: 'A nova senha deve ser diferente da senha atual' }, { status: 400 })

  const senhaHash = await bcrypt.hash(senha_nova, 10)
  await db.query(
    `UPDATE tab_usuario SET senha_hash = $1, trocar_senha = false, updated_at = NOW() WHERE id = $2`,
    [senhaHash, session.usuario_id],
  )

  await registrarAuditoria(db, session, {
    tabela:      'tab_usuario',
    registroId:  session.usuario_id,
    acao:        'UPDATE',
    dadosDepois: { acao: 'Usuário alterou a própria senha' },
  })

  return NextResponse.json({ ok: true })
}
