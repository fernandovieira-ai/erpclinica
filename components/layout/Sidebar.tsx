'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard, TrendingUp, TrendingDown, DollarSign, FileText,
  Users, Settings, LogOut, ChevronDown, ChevronRight,
  Receipt, Landmark, CreditCard, ArrowLeftRight,
  Building2, UserCircle, Banknote, FolderTree,
  BookOpen, Tag, Stethoscope,
  CalendarDays, UserCog, HeartPulse, ClipboardList,
  BarChart3, Activity,
  FileOutput, FileInput, FileUp, FileDown,
  ListTree, MinusCircle, PlusCircle, CalendarClock,
  Timer,
} from 'lucide-react'
import { useState } from 'react'
import type { Session } from '@/types/session'

interface Props { session: Session }

interface NavItem {
  label:    string
  icon?:    React.ReactNode
  href?:    string
  children?: { label: string; href: string; icon?: React.ReactNode }[]
}

const NAV: NavItem[] = [
  { label: 'Dashboard',  icon: <LayoutDashboard size={16} />, href: '/dashboard' },
  {
    label: 'Clínica', icon: <Stethoscope size={16} />,
    children: [
      { label: 'Agendamento',          href: '/clinica/agendamento',                   icon: <CalendarDays size={14} /> },
      { label: 'Sala de Espera',       href: '/clinica/sala-espera',                    icon: <Timer size={14} /> },
      { label: 'Recebimentos',         href: '/clinica/recebimentos',                   icon: <CreditCard size={14} /> },
      { label: 'Profissionais',         href: '/cadastro/pessoas?papel=profissional',   icon: <UserCog size={14} /> },
      { label: 'Pacientes',             href: '/cadastro/pessoas?papel=paciente',       icon: <HeartPulse size={14} /> },
      { label: 'Tipos de Atendimento',  href: '/clinica/tipos-atendimento',             icon: <ClipboardList size={14} /> },
      { label: 'Categorias',            href: '/clinica/categorias',                    icon: <Tag size={14} /> },
    ],
  },
  {
    label: 'Gerencial', icon: <TrendingUp size={16} />,
    children: [
      { label: 'DRE',            href: '/gerencial/dre',         icon: <BarChart3 size={14} /> },
      { label: 'Fluxo de Caixa', href: '/gerencial/fluxo-caixa', icon: <Activity size={14} /> },
    ],
  },
  {
    label: 'Financeiro', icon: <DollarSign size={16} />,
    children: [
      { label: 'Títulos a Pagar',  href: '/financeiro/titulos-pagar',    icon: <FileOutput size={14} /> },
      { label: 'Contas a Receber', href: '/financeiro/contas-receber',   icon: <FileInput size={14} /> },
      { label: 'Despesas',         href: '/financeiro/despesas',         icon: <TrendingDown size={14} /> },
      { label: 'Receitas',         href: '/financeiro/receitas',         icon: <TrendingUp size={14} /> },
      { label: 'Movimento Caixa',  href: '/financeiro/movimento-caixa',  icon: <Banknote size={14} /> },
      { label: 'Movimento Banco',  href: '/financeiro/movimento-banco',  icon: <Building2 size={14} /> },
      { label: 'Conciliação',      href: '/financeiro/conciliacao',      icon: <ArrowLeftRight size={14} /> },
    ],
  },
  {
    label: 'Fiscal', icon: <Receipt size={16} />,
    children: [
      { label: 'NF-e Saída',   href: '/fiscal/nfe',        icon: <FileUp size={14} /> },
      { label: 'NF-e Entrada', href: '/fiscal/nfe-entrada', icon: <FileDown size={14} /> },
      { label: 'Livro Fiscal', href: '/fiscal/livro',       icon: <BookOpen size={14} /> },
    ],
  },
  {
    label: 'Cadastros', icon: <FileText size={16} />,
    children: [
      { label: 'Pessoas',           href: '/cadastro/pessoas',               icon: <UserCircle size={14} /> },
      { label: 'Contas Bancárias',  href: '/cadastro/contas-banco',          icon: <Landmark size={14} /> },
      { label: 'Centros de Custo',  href: '/cadastro/centros-custo',         icon: <FolderTree size={14} /> },
      { label: 'Plano de Contas',   href: '/cadastro/plano-contas',          icon: <ListTree size={14} /> },
      { label: 'Tipos de Despesa',  href: '/cadastro/tipos-despesa',         icon: <MinusCircle size={14} /> },
      { label: 'Tipos de Receita',  href: '/cadastro/tipos-receita',         icon: <PlusCircle size={14} /> },
      { label: 'Cond. Pagamento',   href: '/cadastro/condicoes-pagamento',   icon: <CalendarClock size={14} /> },
      { label: 'Tipos de Cobrança', href: '/cadastro/formas-pagamento',      icon: <CreditCard size={14} /> },
    ],
  },
  {
    label: 'Configurações', icon: <Settings size={16} />,
    children: [
      { label: 'Empresas', href: '/configuracoes/empresas', icon: <Building2 size={14} /> },
    ],
  },
  { label: 'Usuários',      icon: <Users size={16} />,   href: '/usuarios' },
]

export default function Sidebar({ session }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router   = useRouter()
  const [open, setOpen] = useState<string[]>(() =>
    NAV
      .filter(item => item.children?.some(c => {
        const [path] = c.href.split('?')
        return pathname === path || pathname.startsWith(path + '/')
      }))
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

  const isActive = (href: string) => {
    const [hrefPath, hrefQuery] = href.split('?')
    const matches = pathname === hrefPath || pathname.startsWith(hrefPath + '/')

    if (!matches) return false

    // Se tem query string, verifica se corresponde
    if (hrefQuery) {
      const params = new URLSearchParams(hrefQuery)
      for (const [key, value] of params) {
        if (searchParams.get(key) !== value) return false
      }
    }

    return true
  }

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
                  {child.icon && (
                    <span style={{ opacity: 0.7, display: 'flex', alignItems: 'center' }}>
                      {child.icon}
                    </span>
                  )}
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
