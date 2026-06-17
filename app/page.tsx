import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken, isSession } from '@/lib/auth/jwt'

export default async function RootPage() {
  redirect('/dashboard') // DEV: remover e descomentar o bloco abaixo antes de produção
  const token   = cookies().get('session')?.value
  const payload = token ? await verifyToken(token) : null
  if (payload && isSession(payload)) redirect('/dashboard')
  redirect('/login')
}
