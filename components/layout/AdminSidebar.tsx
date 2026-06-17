'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutGrid, Server, LogOut, Shield } from 'lucide-react'
import type { AdminSession } from '@/types/session'

interface Props { admin: AdminSession }

export default function AdminSidebar({ admin }: Props) {
  const pathname = usePathname()
  const router   = useRouter()

  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="sidebar" style={{ backgroundColor: '#0F1117', borderRightColor: 'rgba(255,255,255,0.06)' }}>
      {/* Logo admin */}
      <div className="sidebar-logo" style={{ color: '#60A5FA', backgroundColor: '#0F1117' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={16} />
          DigitalRF Admin
        </div>
      </div>

      <nav className="sidebar-section" style={{ flex: 1, paddingTop: 8 }}>
        <Link
          href="/admin"
          className="sidebar-item"
          style={{
            color: isActive('/admin') ? '#60A5FA' : '#9CA3AF',
            backgroundColor: isActive('/admin') ? 'rgba(96,165,250,0.1)' : 'transparent',
          }}
        >
          <LayoutGrid size={16} />
          Instâncias
        </Link>
      </nav>

      {/* Rodapé */}
      <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)', padding: '12px 8px' }}>
        <div style={{ padding: '8px 12px', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F9FAFB' }}>{admin.nome}</div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{admin.email}</div>
        </div>
        <button
          className="sidebar-item"
          onClick={logout}
          style={{ color: '#9CA3AF' }}
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  )
}
