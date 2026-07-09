'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Plus, Search, ChevronLeft, ChevronRight, Pencil, PowerOff,
  ShieldCheck, DollarSign, UserCog, Building2, ShieldAlert, Clock, Stethoscope,
} from 'lucide-react'
import type { Usuario, UsuarioListItem } from '@/types/cadastros.types'
import UsuarioModal from '@/components/cadastro/UsuarioModal'

const PERFIL_INFO: Record<string, { label: string; icon: typeof ShieldCheck; cor: string }> = {
  admin:      { label: 'Administrador', icon: ShieldCheck, cor: '#7C3AED' },
  financeiro: { label: 'Financeiro',    icon: DollarSign,  cor: '#0F6E56' },
  operador:   { label: 'Operador',      icon: UserCog,     cor: '#378ADD' },
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

function formatarUltimoAcesso(v: string | null): string {
  if (!v) return 'Nunca acessou'
  const d = new Date(v)
  const agora = new Date()
  const diffMs = agora.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1)  return 'Agora mesmo'
  if (diffMin < 60) return `Há ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Há ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 30) return `Há ${diffD}d`
  return d.toLocaleDateString('pt-BR')
}

export default function UsuariosPage() {
  const [dados,       setDados]       = useState<UsuarioListItem[]>([])
  const [total,       setTotal]       = useState(0)
  const [pages,       setPages]       = useState(1)
  const [loading,     setLoading]     = useState(false)
  const [busca,       setBusca]       = useState('')
  const [perfil,      setPerfil]      = useState('all')
  const [ativo,       setAtivo]       = useState('true')
  const [page,        setPage]        = useState(1)

  const [meuId,        setMeuId]        = useState<number | null>(null)
  const [meuPerfil,    setMeuPerfil]    = useState<string | null>(null)

  const [modalAberto,  setModalAberto]  = useState(false)
  const [usuarioEdit,  setUsuarioEdit]  = useState<Usuario | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      setMeuId(d.usuario_id ?? null)
      setMeuPerfil(d.perfil ?? null)
    }).catch(() => {})
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp  = new URLSearchParams({ busca, perfil, ativo, page: String(page), limit: '50' })
      const res = await fetch(`/api/cadastro/usuarios?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar usuários'); return }
      const data = await res.json()
      setDados(data.dados); setTotal(data.total); setPages(data.pages)
    } finally { setLoading(false) }
  }, [busca, perfil, ativo, page])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setPage(1) }, [busca, perfil, ativo])

  async function abrirNovo() {
    setUsuarioEdit(null)
    setModalAberto(true)
  }

  async function abrirEdicao(id: number) {
    const res = await fetch(`/api/cadastro/usuarios/${id}`)
    if (!res.ok) { toast.error('Erro ao carregar usuário'); return }
    const usuario: Usuario = await res.json()
    setUsuarioEdit(usuario)
    setModalAberto(true)
  }

  async function toggleAtivo(u: UsuarioListItem) {
    if (u.id === meuId && u.ativo) { toast.error('Você não pode desativar seu próprio usuário'); return }
    if (!confirm(`${u.ativo ? 'Desativar' : 'Reativar'} o usuário "${u.nome}"?`)) return
    const res = await fetch(`/api/cadastro/usuarios/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !u.ativo }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) { toast.success(`Usuário ${u.ativo ? 'desativado' : 'reativado'}!`); carregar() }
    else toast.error(json.erro ?? 'Erro ao alterar status')
  }

  function fecharModal() {
    setModalAberto(false)
    setUsuarioEdit(null)
  }

  function aoSalvar() {
    fecharModal()
    carregar()
  }

  const inicio = (page - 1) * 50 + 1
  const fim    = Math.min(page * 50, total)

  if (meuPerfil && meuPerfil !== 'admin') {
    return (
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <ShieldAlert size={40} color="var(--texto-terciario)" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--texto-principal)', marginBottom: 4 }}>Acesso restrito</div>
          <div style={{ fontSize: 13, color: 'var(--texto-secundario)' }}>
            Somente administradores podem gerenciar usuários do sistema.
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuários</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>Gerencie quem tem acesso ao sistema e seus níveis de permissão</div>
        </div>
        <button className="btn-primary" onClick={abrirNovo}>
          <Plus size={15} /> Novo Usuário
        </button>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input className="input-field" placeholder="Buscar por nome ou e-mail..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <select className="input-field" value={perfil} onChange={e => setPerfil(e.target.value)} style={{ width: 170 }}>
            <option value="all">Todos os perfis</option>
            <option value="admin">Administrador</option>
            <option value="financeiro">Financeiro</option>
            <option value="operador">Operador</option>
          </select>
          <select className="input-field" value={ativo} onChange={e => setAtivo(e.target.value)} style={{ width: 120 }}>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
            <option value="all">Todos</option>
          </select>
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th style={{ width: 170 }}>Perfil</th>
                  <th style={{ width: 220 }}>Empresas</th>
                  <th style={{ width: 130 }}>Último acesso</th>
                  <th style={{ width: 90 }}>Status</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--texto-terciario)' }}>Carregando...</td></tr>}
                {!loading && dados.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>Nenhum usuário encontrado</td></tr>}
                {!loading && dados.map(u => {
                  const info = PERFIL_INFO[u.perfil] ?? PERFIL_INFO.operador
                  const Icon = info.icon
                  return (
                    <tr key={u.id} onClick={() => abrirEdicao(u.id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                            background: 'linear-gradient(135deg, var(--cor-primaria), var(--cor-primaria-hover))',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700,
                          }}>
                            {iniciais(u.nome)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--texto-principal)' }}>
                              {u.nome.toUpperCase()} {u.id === meuId && <span style={{ fontSize: 10, color: 'var(--texto-terciario)', fontWeight: 400 }}>(você)</span>}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>{u.email}</div>
                            {u.profissional_nome && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5, color: 'var(--cor-primaria)', marginTop: 1 }}>
                                <Stethoscope size={10} /> {u.profissional_nome}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '3px 8px', borderRadius: 20, background: `${info.cor}18`, color: info.cor, fontWeight: 600 }}>
                          <Icon size={11} /> {info.label}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {u.empresas.length === 0 && <span style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>—</span>}
                          {u.empresas.slice(0, 2).map(e => (
                            <span key={e.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-hover)', color: 'var(--texto-secundario)' }}>
                              <Building2 size={9} /> {e.razao_social}
                            </span>
                          ))}
                          {u.empresas.length > 2 && (
                            <span style={{ fontSize: 10.5, padding: '2px 6px', color: 'var(--texto-terciario)' }}>+{u.empresas.length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} color="var(--texto-terciario)" /> {formatarUltimoAcesso(u.ultimo_acesso)}
                        </div>
                      </td>
                      <td><span className={`badge-status ${u.ativo ? 'badge-pago' : 'badge-cancelado'}`}>{u.ativo ? 'Ativo' : 'Inativo'}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button onClick={() => abrirEdicao(u.id)} className="btn-ghost" title="Editar" style={{ padding: '5px 8px' }}><Pencil size={13} /></button>
                          <button onClick={() => toggleAtivo(u)} className="btn-ghost" title={u.ativo ? 'Desativar' : 'Reativar'}
                            style={{ padding: '5px 8px', color: u.ativo ? 'var(--cor-erro)' : 'var(--cor-sucesso)' }}>
                            <PowerOff size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {total > 0 && (
            <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--borda-suave)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--texto-terciario)' }}>
              <span>{inicio}–{fim} de {total} usuários</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost" style={{ padding: '4px 8px' }}><ChevronLeft size={14} /></button>
                <span style={{ padding: '4px 10px' }}>{page} / {pages}</span>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-ghost" style={{ padding: '4px 8px' }}><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      <UsuarioModal open={modalAberto} usuario={usuarioEdit} usuarioIdAtual={meuId} onClose={fecharModal} onSaved={aoSalvar} />
    </>
  )
}
