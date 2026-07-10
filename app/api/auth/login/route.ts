import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { dbControl, getDb } from '@/lib/db'
import { signToken } from '@/lib/auth/jwt'
import type { Session, SelectToken } from '@/types/session'

const schema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
  slug:  z.string().min(1),
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

  const { email, senha, slug } = body.data

  try {
    // 1. Busca instância ativa no saas_control
    const { rows: inst } = await dbControl.query<{ database_name: string; status: string }>(
      `SELECT database_name, status FROM tab_instancia WHERE slug = $1 LIMIT 1`,
      [slug],
    )

    if (!inst.length) {
      return NextResponse.json({ erro: 'Cliente não encontrado' }, { status: 404 })
    }
    if (inst[0].status !== 'ativo' && inst[0].status !== 'trial') {
      return NextResponse.json({ erro: 'Instância suspensa ou cancelada' }, { status: 403 })
    }

    const { database_name } = inst[0]
    const db = getDb(database_name)

    // 2. Autentica usuário no banco do cliente
    const { rows: users } = await db.query<{
      id: number; nome: string; email: string; senha_hash: string; perfil: string; ativo: boolean; profissional_id: number | null
    }>(
      `SELECT id, nome, email, senha_hash, perfil, ativo, profissional_id
       FROM tab_usuario WHERE email = $1 AND ativo = true LIMIT 1`,
      [email],
    )

    if (!users.length) {
      return NextResponse.json({ erro: 'E-mail ou senha incorretos' }, { status: 401 })
    }

    const usuario = users[0]
    const senhaOk = await bcrypt.compare(senha, usuario.senha_hash)
    if (!senhaOk) {
      return NextResponse.json({ erro: 'E-mail ou senha incorretos' }, { status: 401 })
    }

    // 3. Lista empresas acessíveis
    const { rows: empresas } = await db.query<{
      id: number; razao_social: string; nome_fantasia: string | null; perfil: string; modulos: string[] | null
    }>(
      `SELECT e.id, e.razao_social, e.nome_fantasia, ue.perfil, ue.modulos
       FROM tab_empresa e
       INNER JOIN tab_usuario_empresa ue ON ue.empresa_id = e.id
       WHERE ue.usuario_id = $1 AND ue.ativo = true AND e.ativo = true
       ORDER BY e.razao_social`,
      [usuario.id],
    )

    // 4. Atualiza último acesso
    await db.query(`UPDATE tab_usuario SET ultimo_acesso = NOW() WHERE id = $1`, [usuario.id])

    // 4a. Empresa única — gera session direto
    if (empresas.length === 1) {
      const emp     = empresas[0]
      const session: Session = {
        usuario_id:       usuario.id,
        database_name:    database_name,
        empresa_id_ativa: emp.id,
        perfil:           emp.perfil as Session['perfil'],
        modulos:          emp.modulos ?? [],
        nome:             usuario.nome,
        email:            usuario.email,
        profissional_id:  usuario.profissional_id,
      }
      const token = await signToken(session)
      const res   = NextResponse.json({ status: 'ok', redir: '/dashboard' })
      res.cookies.set('session', token, { ...COOKIE_OPTS, maxAge: 60 * 60 * 8 })
      return res
    }

    // 4b. Múltiplas empresas — token temporário + lista
    const selectPayload: SelectToken = {
      database_name: database_name,
      usuario_id:    usuario.id,
      nome:          usuario.nome,
      email:         usuario.email,
      perfil:        usuario.perfil as Session['perfil'],
      modulos:       null,
      profissional_id: usuario.profissional_id,
    }
    const selectToken = await signToken(selectPayload, '10m')
    const res = NextResponse.json({ status: 'select_empresa', empresas })
    res.cookies.set('select_token', selectToken, { ...COOKIE_OPTS, maxAge: 60 * 10 })
    return res
  } catch (err) {
    console.error('[login] erro interno:', err)
    return NextResponse.json({ erro: 'Erro interno ao autenticar' }, { status: 500 })
  }
}
