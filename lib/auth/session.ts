import { NextRequest } from 'next/server'
import { verifyToken, isSession, isAdminSession } from './jwt'
import type { Session, AdminSession } from '@/types/session'

const MODULOS_PADRAO: Record<string, string[]> = {
  admin:      ['cadastros', 'financeiro', 'fiscal', 'contabil', 'relatorios', 'config', 'ia'],
  financeiro: ['financeiro', 'fiscal', 'relatorios', 'ia'],
  operador:   ['financeiro'],
}

// DEV: bypass de autenticação — desativado temporariamente
const DEV_NO_AUTH = true

// DEV: sessão fixa para desenvolvimento — remover antes de produção
const DEV_SESSION: Session = {
  usuario_id:       1,
  database_name:    'hiitcor',
  empresa_id_ativa: 1,
  perfil:           'admin',
  modulos:          ['cadastros', 'financeiro', 'fiscal', 'contabil', 'relatorios', 'config', 'ia'],
  nome:             'Dev',
  email:            'dev@dev.local',
}

export async function getSession(req: NextRequest): Promise<Session | null> {
  if (DEV_NO_AUTH) return DEV_SESSION
  const token = req.cookies.get('session')?.value
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload || !isSession(payload)) return null
  return payload
}

export async function getAdminSession(req: NextRequest): Promise<AdminSession | null> {
  const token = req.cookies.get('admin_session')?.value
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload || !isAdminSession(payload)) return null
  return payload
}

export function checkModulo(session: Session, modulo: string): boolean {
  if (session.perfil === 'admin') return true
  const lista = session.modulos?.length
    ? session.modulos
    : (MODULOS_PADRAO[session.perfil] ?? [])
  return lista.includes(modulo)
}
