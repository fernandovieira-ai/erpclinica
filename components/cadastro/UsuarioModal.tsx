'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  X, Eye, EyeOff, RefreshCw, ShieldCheck, DollarSign, UserCog,
  Building2, Save, Trash2, KeyRound, Search, Stethoscope,
} from 'lucide-react'
import { usuarioUpdateSchema, type UsuarioUpdateInput } from '@/lib/validators/usuario.schema'
import type { Usuario } from '@/types/cadastros.types'

interface EmpresaOpcao { id: number; razao_social: string }
interface ProfissionalOpcao { id: number; nome: string }

interface Props {
  open:            boolean
  usuario?:        Usuario | null
  usuarioIdAtual?: number | null
  onClose:         () => void
  onSaved:         () => void
}

const PERFIS: { valor: 'admin' | 'financeiro' | 'operador'; label: string; desc: string; icon: typeof ShieldCheck; cor: string }[] = [
  { valor: 'admin',       label: 'Administrador', desc: 'Acesso total ao sistema e configurações',          icon: ShieldCheck, cor: '#7C3AED' },
  { valor: 'financeiro',  label: 'Financeiro',    desc: 'Contas, títulos, movimentos e relatórios',          icon: DollarSign,  cor: '#0F6E56' },
  { valor: 'operador',    label: 'Operador',      desc: 'Rotina operacional: agenda e atendimentos',         icon: UserCog,     cor: '#378ADD' },
]

function gerarSenhaAleatoria(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%'
  let s = ''
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

function ProfissionalPicker({
  selecionado, onSelect, onLimpar,
}: {
  selecionado: ProfissionalOpcao | null
  onSelect:    (p: ProfissionalOpcao) => void
  onLimpar:    () => void
}) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<ProfissionalOpcao[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)

  async function buscar(termo: string) {
    setQuery(termo)
    if (termo.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/cadastro/pessoas?papel=profissional&busca=${encodeURIComponent(termo)}&limit=10`)
      const d   = await res.json()
      setResults((d.dados ?? []).map((p: { id: number; nome: string }) => ({ id: p.id, nome: p.nome })))
      setOpen(true)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  if (selecionado) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid var(--cor-primaria)', borderRadius: 8, backgroundColor: 'var(--bg-input)' }}>
        <Stethoscope size={14} color="var(--cor-primaria)" />
        <span style={{ fontSize: 13, color: 'var(--texto-principal)', flex: 1 }}>{selecionado.nome}</span>
        <button type="button" onClick={onLimpar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', display: 'flex' }}>
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />}
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
        <input
          className="input-field"
          style={{ paddingLeft: 32 }}
          placeholder="Buscar profissional por nome..."
          value={query}
          onChange={e => buscar(e.target.value)}
        />
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4,
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda-media)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: 180, overflowY: 'auto',
        }}>
          {loading && <div style={{ padding: 10, fontSize: 12, color: 'var(--texto-terciario)' }}>Buscando...</div>}
          {!loading && results.length === 0 && (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--texto-terciario)' }}>Nenhum profissional encontrado</div>
          )}
          {!loading && results.map(p => (
            <button key={p.id} type="button"
              onClick={() => { onSelect(p); setQuery(''); setResults([]); setOpen(false) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-principal)', borderBottom: '1px solid var(--borda-suave)' }}>
              {p.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function UsuarioModal({ open, usuario, usuarioIdAtual, onClose, onSaved }: Props) {
  const editando = !!usuario
  const [saving,        setSaving]        = useState(false)
  const [excluindo,     setExcluindo]     = useState(false)
  const [mostrarSenha,  setMostrarSenha]  = useState(false)
  const [alterarSenha,  setAlterarSenha]  = useState(!editando)
  const [empresas,      setEmpresas]      = useState<EmpresaOpcao[]>([])
  const [profissional,  setProfissional]  = useState<ProfissionalOpcao | null>(null)

  const {
    register, handleSubmit, reset, watch, setValue, formState: { errors },
  } = useForm<UsuarioUpdateInput>({
    resolver: zodResolver(usuarioUpdateSchema),
    defaultValues: {
      nome: '', email: '', senha: '', perfil: 'operador',
      trocar_senha: true, ativo: true, empresas_ids: [], profissional_id: null,
    },
  })

  useEffect(() => {
    if (!open) return
    fetch('/api/cadastro/empresas?ativo=true&limit=100')
      .then(r => r.json())
      .then(d => setEmpresas(d.dados ?? []))
      .catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open) return
    setMostrarSenha(false)
    setAlterarSenha(!editando)
    if (usuario) {
      reset({
        nome:            usuario.nome,
        email:           usuario.email,
        senha:           '',
        perfil:          usuario.perfil,
        trocar_senha:    usuario.trocar_senha,
        ativo:           usuario.ativo,
        empresas_ids:    usuario.empresas.map(e => e.id),
        profissional_id: usuario.profissional_id,
      })
      setProfissional(usuario.profissional_id && usuario.profissional_nome
        ? { id: usuario.profissional_id, nome: usuario.profissional_nome }
        : null)
    } else {
      reset({ nome: '', email: '', senha: '', perfil: 'operador', trocar_senha: true, ativo: true, empresas_ids: [], profissional_id: null })
      setProfissional(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, usuario])

  // Pré-seleciona a empresa quando só existe uma opção (caso mais comum)
  useEffect(() => {
    if (!open || editando) return
    if (empresas.length === 1 && watch('empresas_ids').length === 0) {
      setValue('empresas_ids', [empresas[0].id])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresas, open])

  if (!open) return null

  const nomeWatch      = watch('nome') || ''
  const empresasIds    = watch('empresas_ids') || []
  const perfilAtivo    = watch('perfil')
  const ehProprioUsuario = editando && usuarioIdAtual === usuario?.id

  function toggleEmpresa(id: number) {
    const atual = watch('empresas_ids') || []
    setValue('empresas_ids', atual.includes(id) ? atual.filter(v => v !== id) : [...atual, id], { shouldValidate: true })
  }

  function gerarSenha() {
    const nova = gerarSenhaAleatoria()
    setValue('senha', nova, { shouldValidate: true })
    setMostrarSenha(true)
    navigator.clipboard?.writeText(nova).then(() => toast.success('Senha gerada e copiada para a área de transferência')).catch(() => toast.success('Senha gerada'))
  }

  async function onSubmit(data: UsuarioUpdateInput) {
    if (!editando && !data.senha) { toast.error('Informe uma senha de acesso'); return }
    setSaving(true)
    try {
      const payload = { ...data, senha: alterarSenha ? data.senha : undefined }
      const url    = usuario ? `/api/cadastro/usuarios/${usuario.id}` : '/api/cadastro/usuarios'
      const method = usuario ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(usuario ? 'Usuário atualizado!' : 'Usuário cadastrado!')
      onSaved()
    } finally { setSaving(false) }
  }

  async function excluir() {
    if (!usuario || !confirm(`Excluir permanentemente o usuário "${usuario.nome}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluindo(true)
    try {
      const res = await fetch(`/api/cadastro/usuarios/${usuario.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.erro ?? 'Erro ao excluir'); return }
      toast.success('Usuário excluído')
      onSaved()
    } finally { setExcluindo(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      backgroundColor: 'rgba(15,15,14,0.55)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: '100%', maxWidth: 600, maxHeight: '92vh', overflow: 'hidden',
        backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-2xl)',
        boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '20px 24px',
          borderBottom: '0.5px solid var(--borda-suave)', flexShrink: 0,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--cor-primaria), var(--cor-primaria-hover))',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700,
          }}>
            {iniciais(nomeWatch || usuario?.nome || '?')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--texto-principal)' }}>
              {editando ? 'Editar Usuário' : 'Novo Usuário'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>
              {editando ? 'Atualize os dados de acesso ao sistema' : 'Conceda acesso ao sistema para um novo colaborador'}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--texto-terciario)',
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', flex: 1 }}>

            {/* Dados básicos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label className="field-label">Nome completo</label>
                <input className={`input-field ${errors.nome ? 'input-error' : ''}`}
                  style={{ textTransform: 'uppercase' }}
                  placeholder="Ex: MARIA SILVA"
                  {...register('nome')} />
                {errors.nome && <div className="field-error">{errors.nome.message}</div>}
              </div>
              <div>
                <label className="field-label">E-mail de acesso</label>
                <input className={`input-field ${errors.email ? 'input-error' : ''}`}
                  type="email" placeholder="usuario@clinica.com.br"
                  {...register('email')} />
                {errors.email && <div className="field-error">{errors.email.message}</div>}
              </div>
            </div>

            {/* Senha */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label className="field-label" style={{ margin: 0 }}>
                  {editando ? 'Redefinir senha' : 'Senha de acesso'}
                </label>
                {editando && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--cor-primaria)', cursor: 'pointer', fontWeight: 500 }}>
                    <input type="checkbox" checked={alterarSenha} onChange={e => setAlterarSenha(e.target.checked)} />
                    Definir nova senha
                  </label>
                )}
              </div>
              {alterarSenha && (<>
                <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <KeyRound size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
                    <input
                      className={`input-field ${errors.senha ? 'input-error' : ''}`}
                      type={mostrarSenha ? 'text' : 'password'}
                      placeholder="Mínimo de 6 caracteres"
                      style={{ paddingLeft: 32, paddingRight: 36 }}
                      {...register('senha')}
                    />
                    <button type="button" onClick={() => setMostrarSenha(v => !v)} style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', display: 'flex',
                    }}>
                      {mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button type="button" onClick={gerarSenha} className="btn-ghost" style={{ padding: '0 12px', fontSize: 12 }}>
                    <RefreshCw size={13} /> Gerar
                  </button>
                </div>
                {errors.senha && <div className="field-error">{errors.senha.message}</div>}
              </>)}
            </div>

            {/* Perfil de acesso */}
            <div>
              <label className="field-label">Perfil de acesso</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {PERFIS.map(p => {
                  const Icon = p.icon
                  const ativo = perfilAtivo === p.valor
                  return (
                    <button key={p.valor} type="button"
                      onClick={() => setValue('perfil', p.valor, { shouldValidate: true })}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                        border: ativo ? `1.5px solid ${p.cor}` : '0.5px solid var(--borda-media)',
                        backgroundColor: ativo ? `${p.cor}14` : 'var(--bg-input)',
                        transition: 'all 0.12s',
                      }}>
                      <Icon size={16} color={ativo ? p.cor : 'var(--texto-terciario)'} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: ativo ? p.cor : 'var(--texto-principal)' }}>{p.label}</span>
                      <span style={{ fontSize: 10.5, lineHeight: 1.35, color: 'var(--texto-terciario)' }}>{p.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Profissional vinculado */}
            <div>
              <label className="field-label">Profissional vinculado (opcional)</label>
              <ProfissionalPicker
                selecionado={profissional}
                onSelect={p => { setProfissional(p); setValue('profissional_id', p.id, { shouldValidate: true }) }}
                onLimpar={() => { setProfissional(null); setValue('profissional_id', null, { shouldValidate: true }) }}
              />
              <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 4 }}>
                Se este usuário for um profissional, a agenda e a sala de espera já abrem filtradas nele automaticamente.
              </div>
            </div>

            {/* Empresas com acesso */}
            {empresas.length > 1 && (
              <div>
                <label className="field-label">Empresas com acesso</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '0.5px solid var(--borda-suave)', borderRadius: 10, padding: 10, maxHeight: 140, overflowY: 'auto' }}>
                  {empresas.map(e => (
                    <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '3px 4px' }}>
                      <input type="checkbox" checked={empresasIds.includes(e.id)} onChange={() => toggleEmpresa(e.id)} />
                      <Building2 size={13} color="var(--texto-terciario)" />
                      {e.razao_social}
                    </label>
                  ))}
                </div>
                {errors.empresas_ids && <div className="field-error">{errors.empresas_ids.message}</div>}
              </div>
            )}

            {/* Opções */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTop: '0.5px solid var(--borda-suave)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--texto-secundario)', cursor: 'pointer' }}>
                <input type="checkbox" {...register('trocar_senha')} />
                Forçar troca de senha no próximo acesso
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--texto-secundario)', cursor: ehProprioUsuario ? 'not-allowed' : 'pointer' }}>
                Usuário ativo
                <span
                  onClick={() => { if (!ehProprioUsuario) setValue('ativo', !watch('ativo'), { shouldValidate: true }) }}
                  style={{
                    width: 36, height: 20, borderRadius: 10, position: 'relative', cursor: ehProprioUsuario ? 'not-allowed' : 'pointer',
                    backgroundColor: watch('ativo') ? 'var(--cor-sucesso)' : 'var(--borda-forte)', transition: 'background 0.15s',
                    opacity: ehProprioUsuario ? 0.6 : 1,
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, left: watch('ativo') ? 18 : 2, width: 16, height: 16, borderRadius: '50%',
                    backgroundColor: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                  }} />
                </span>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '16px 24px',
            borderTop: '0.5px solid var(--borda-suave)', flexShrink: 0,
          }}>
            {editando && !ehProprioUsuario && (
              <button type="button" onClick={excluir} disabled={excluindo} className="btn-danger" style={{ opacity: excluindo ? 0.7 : 1 }}>
                <Trash2 size={14} /> {excluindo ? 'Excluindo...' : 'Excluir'}
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={onClose} className="btn-ghost">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary" style={{ opacity: saving ? 0.7 : 1 }}>
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
