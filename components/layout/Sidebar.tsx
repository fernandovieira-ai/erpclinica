'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, TrendingUp, DollarSign, FileText,
  Users, Settings, LogOut, ChevronDown, ChevronRight,
  Receipt, Landmark, CreditCard, ArrowLeftRight,
  Building2, UserCircle, Banknote, FolderTree,
  BookOpen, Tag, ArrowDownUp, Stethoscope,
} from 'lucide-react'
import { useState } from 'react'
import type { Session } from '@/types/session'

interface Props { session: Session }

interface NavItem {
  label:    string
  icon?:    React.ReactNode
  href?:    string
  children?: { label: string; href: string }[]
}

const NAV: NavItem[] = [
  { label: 'Dashboard',  icon: <LayoutDashboard size={16} />, href: '/dashboard' },
  {
    label: 'Clínica', icon: <Stethoscope size={16} />,
    children: [
      { label: 'Agendamento',         href: '/clinica/agendamento' },
      { label: 'Profissionais',        href: '/cadastro/pessoas?papel=profissional' },
      { label: 'Pacientes',            href: '/cadastro/pessoas?papel=paciente' },
      { label: 'Tipos de Atendimento', href: '/clinica/tipos-atendimento' },
      { label: 'Categorias',           href: '/clinica/categorias' },
    ],
  },
  {
    label: 'Gerencial', icon: <TrendingUp size={16} />,
    children: [
      { label: 'DRE',            href: '/gerencial/dre' },
      { label: 'Fluxo de Caixa', href: '/gerencial/fluxo-caixa' },
    ],
  },
  {
    label: 'Financeiro', icon: <DollarSign size={16} />,
    children: [
      { label: 'Títulos a Pagar',  href: '/financeiro/titulos-pagar' },
      { label: 'Contas a Receber', href: '/financeiro/contas-receber' },
      { label: 'Despesas',         href: '/financeiro/despesas' },
      { label: 'Receitas',         href: '/financeiro/receitas' },
      { label: 'Movimento Caixa',  href: '/financeiro/movimento-caixa' },
      { label: 'Movimento Banco',  href: '/financeiro/movimento-banco' },
      { label: 'Conciliação',      href: '/financeiro/conciliacao' },
    ],
  },
  {
    label: 'Fiscal', icon: <Receipt size={16} />,
    children: [
      { label: 'NF-e Saída',   href: '/fiscal/nfe' },
      { label: 'NF-e Entrada', href: '/fiscal/nfe-entrada' },
      { label: 'Livro Fiscal', href: '/fiscal/livro' },
    ],
  },
  {
    label: 'Cadastros', icon: <FileText size={16} />,
    children: [
      { label: 'Pessoas',             href: '/cadastro/pessoas' },
      { label: 'Contas Bancárias',    href: '/cadastro/contas-banco' },
      { label: 'Centros de Custo',    href: '/cadastro/centros-custo' },
      { label: 'Plano de Contas',     href: '/cadastro/plano-contas' },
      { label: 'Tipos de Despesa',    href: '/cadastro/tipos-despesa' },
      { label: 'Tipos de Receita',    href: '/cadastro/tipos-receita' },
      { label: 'Cond. Pagamento',     href: '/cadastro/condicoes-pagamento' },
      { label: 'Tipos de Cobrança', href: '/cadastro/formas-pagamento' },
    ],
  },
  {
    label: 'Configurações', icon: <Settings size={16} />,
    children: [
      { label: 'Empresas', href: '/configuracoes/empresas' },
    ],
  },
  { label: 'Usuários',      icon: <Users size={16} />,   href: '/usuarios' },
]

export default function Sidebar({ session }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const [open, setOpen] = useState<string[]>(() =>
    NAV
      .filter(item => item.children?.some(c => pathname === c.href || pathname.startsWith(c.href + '/')))
      .map(item => item.label),
  )

  function toggleGroup(label: string) {
    setOpen(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label],
    )
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        DigitalRF Financeiro
      </div>

      {/* Nav */}
      <nav className="sidebar-section" style={{ flex: 1, paddingTop: 8 }}>
        {NAV.map(item => {
          if (item.href) {
            return (
              <Link key={item.href} href={item.href} className={`sidebar-item ${isActive(item.href) ? 'active' : ''}`}>
                {item.icon}
                {item.label}
              </Link>
            )
          }

          const expanded = open.includes(item.label)

          return (
            <div key={item.label}>
              <button
                className={`sidebar-item ${item.children?.some(c => isActive(c.href)) ? 'active' : ''}`}
                onClick={() => toggleGroup(item.label)}
              >
                {item.icon}
                <span style={{ flex: 1 }}>{item.label}</span>
                {expanded
                  ? <ChevronDown size={14} style={{ opacity: 0.5 }} />
                  : <ChevronRight size={14} style={{ opacity: 0.4 }} />
                }
              </button>

              {expanded && item.children?.map(child => (
                <Link
                  key={child.href}
                  href={child.href}
                  className={`sidebar-sub ${isActive(child.href) ? 'active' : ''}`}
                >
                  {child.label}
                </Link>
              ))}
            </div>
          )
        })}
      </nav>

      {/* Rodapé — usuário + logout */}
      <div style={{ borderTop: '0.5px solid var(--sidebar-border)', padding: '12px 8px' }}>
        <div style={{ padding: '8px 12px', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sidebar-fg)' }}>
            {session.nome}
          </div>
          <div style={{ fontSize: 11, color: 'var(--sidebar-muted)', marginTop: 2 }}>
            {session.perfil}
          </div>
        </div>
        <button className="sidebar-item" onClick={logout}>
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  )
}
