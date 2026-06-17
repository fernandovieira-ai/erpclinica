import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken, isSession } from '@/lib/auth/jwt'

export default async function RootPage() {
  redirect('/dashboard')
}
