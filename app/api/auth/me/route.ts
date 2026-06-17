import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  return NextResponse.json({
    usuario_id:       session.usuario_id,
    nome:             session.nome,
    email:            session.email,
    perfil:           session.perfil,
    empresa_id_ativa: session.empresa_id_ativa,
    database_name:    session.database_name,
    modulos:          session.modulos,
  })
}
