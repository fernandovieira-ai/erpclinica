import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken, isSession } from './jwt'
import type { Session } from '@/types/session'

// DEV: sessão fixa para desenvolvimento — remover antes de produção
const DEV_SESSION: Session = {
  usuario_id:       1,
  database_name:    'hiitcor',
  empresa_id_ativa: 1,
  perfil:           'admin',
  modulos:          ['cadastros', 'financeiro', 'fiscal', 'contabil', 'relatorios', 'config', 'ia'],
  nome:             'Dev',
  email:            'dev@dev.local',
  profissional_id:  null,
}

// Uso em Server Components — redireciona para /login se não autenticado
export async function requireSession(): Promise<Session> {
  if (process.env.DEV_NO_AUTH === 'true') return DEV_SESSION
  const token = cookies().get('session')?.value
  if (!token) redirect('/login')
  const payload = await verifyToken(token)
  if (!payload || !isSession(payload)) redirect('/login')
  return payload as Session
}
