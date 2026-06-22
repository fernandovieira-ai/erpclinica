import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken, isAdminSession } from '@/lib/auth/jwt'
import type { AdminSession } from '@/types/session'
import AdminSidebar from '@/components/layout/AdminSidebar'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token   = cookies().get('admin_session')?.value
  if (!token) redirect('/admin/login')

  const payload = await verifyToken(token)
  if (!payload || !isAdminSession(payload)) redirect('/admin/login')

  return (
    <div style={{ display: 'flex', backgroundColor: '#0F1117', minHeight: '100vh' }}>
      <AdminSidebar admin={payload as AdminSession} />
      <div className="content-area" tabIndex={-1} style={{ flex: 1, backgroundColor: '#0F1117', outline: 'none' }}>
        {children}
      </div>
    </div>
  )
}
