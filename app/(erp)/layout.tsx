import { requireSession } from '@/lib/auth/server-session'
import Sidebar from '@/components/layout/Sidebar'

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar session={session} />
      <div className="content-area" style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  )
}
