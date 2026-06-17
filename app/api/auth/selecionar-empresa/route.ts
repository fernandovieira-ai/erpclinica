import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyToken, isSelectToken, signToken } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'
import type { Session } from '@/types/session'

const schema = z.object({ empresa_id: z.number().int().positive() })

const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path:     '/',
}

export async function POST(req: NextRequest) {
  const rawToken = req.cookies.get('select_token')?.value
  if (!rawToken) {
    return NextResponse.json({ erro: 'Sessão expirada' }, { status: 401 })
  }

  const payload = await verifyToken(rawToken)
  if (!payload || !isSelectToken(payload)) {
    return NextResponse.json({ erro: 'Token inválido' }, { status: 401 })
  }

  const body = schema.safeParse(await req.json())
  if (!body.success) {
    return NextResponse.json({ erro: 'empresa_id inválido' }, { status: 400 })
  }

  const { empresa_id } = body.data
  const db = getDb(payload.database_name)

  const { rows } = await db.query<{ perfil: string; modulos: string[] | null }>(
    `SELECT ue.perfil, ue.modulos
     FROM tab_usuario_empresa ue
     WHERE ue.usuario_id = $1 AND ue.empresa_id = $2 AND ue.ativo = true LIMIT 1`,
    [payload.usuario_id, empresa_id],
  )

  if (!rows.length) {
    return NextResponse.json({ erro: 'Acesso negado a esta empresa' }, { status: 403 })
  }

  const { perfil, modulos } = rows[0]
  const session: Session = {
    usuario_id:       payload.usuario_id,
    database_name:    payload.database_name,
    empresa_id_ativa: empresa_id,
    perfil:           perfil as Session['perfil'],
    modulos:          modulos ?? [],
    nome:             payload.nome,
    email:            payload.email,
  }

  const token = await signToken(session)
  const res   = NextResponse.json({ status: 'ok', redir: '/dashboard' })
  res.cookies.set('session', token, { ...COOKIE_OPTS, maxAge: 60 * 60 * 8 })
  res.cookies.delete('select_token')
  return res
}
