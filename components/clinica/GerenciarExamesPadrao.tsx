'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X, Plus, Pencil, Trash2, Check, Loader2, FlaskConical } from 'lucide-react'
import type { ExamePadrao } from '@/types/clinica.types'

export interface Props {
  onFechar: () => void
  // Chamado sempre que o catálogo muda (criar/renomear/remover), pra quem abriu
  // atualizar a lista de chips sem precisar re-buscar do zero a cada tecla.
  onAlterado: () => void
}

const COR = '#B45309'

const INPUT_STYLE: React.CSSProperties = {
  padding: '6px 9px', fontSize: 12.5,
  border: '1px solid var(--borda-media)', borderRadius: 5,
  backgroundColor: 'var(--bg-card)', color: 'var(--texto-principal)',
  outline: 'none', width: '100%',
}

export default function GerenciarExamesPadrao({ onFechar, onAlterado }: Props) {
  const [itens,       setItens]       = useState<ExamePadrao[]>([])
  const [carregando,  setCarregando]  = useState(true)
  const [novoNome,    setNovoNome]    = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [editandoId,  setEditandoId]  = useState<number | null>(null)
  const [nomeEdicao,  setNomeEdicao]  = useState('')
  const [ocupadoId,   setOcupadoId]   = useState<number | null>(null)

  async function carregar() {
    setCarregando(true)
    try {
      const res = await fetch('/api/clinica/exames-padrao')
      const d = await res.json()
      setItens(d.dados ?? [])
    } catch {
      toast.error('Erro ao carregar exames padrão')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && editandoId === null) onFechar() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onFechar, editandoId])

  async function adicionar() {
    if (!novoNome.trim()) return
    setSalvandoNovo(true)
    try {
      const res = await fetch('/api/clinica/exames-padrao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: novoNome }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.erro || 'Erro ao adicionar exame'); return }
      setItens(prev => [...prev, d.dados])
      setNovoNome('')
      onAlterado()
    } catch {
      toast.error('Erro ao adicionar exame')
    } finally {
      setSalvandoNovo(false)
    }
  }

  function iniciarEdicao(item: ExamePadrao) {
    setEditandoId(item.id)
    setNomeEdicao(item.nome)
  }

  async function salvarEdicao(id: number) {
    if (!nomeEdicao.trim()) { setEditandoId(null); return }
    setOcupadoId(id)
    try {
      const res = await fetch(`/api/clinica/exames-padrao/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nomeEdicao }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.erro || 'Erro ao renomear exame'); return }
      setItens(prev => prev.map(it => it.id === id ? d.dados : it))
      setEditandoId(null)
      onAlterado()
    } catch {
      toast.error('Erro ao renomear exame')
    } finally {
      setOcupadoId(null)
    }
  }

  async function remover(item: ExamePadrao) {
    if (!confirm(`Remover "${item.nome}" do catálogo?`)) return
    setOcupadoId(item.id)
    try {
      const res = await fetch(`/api/clinica/exames-padrao/${item.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao remover exame'); return }
      setItens(prev => prev.filter(it => it.id !== item.id))
      onAlterado()
    } catch {
      toast.error('Erro ao remover exame')
    } finally {
      setOcupadoId(null)
    }
  }

  if (typeof window === 'undefined') return null

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 10050,
        backgroundColor: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
    >
      <div style={{
        width: '100%', maxWidth: 480, height: 'min(85vh, 620px)',
        backgroundColor: 'var(--bg-card)', borderRadius: 14,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 20px',
          background: `linear-gradient(135deg, ${COR} 0%, #7C3A0A 100%)`,
          color: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FlaskConical size={18} />
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.01em' }}>
              Exames Padrão
            </span>
          </div>
          <button
            onClick={onFechar}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', opacity: 0.8, padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 18px' }}>
          <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginBottom: 12 }}>
            Essa lista aparece como atalhos na Solicitação de Exame — clique num item lá pra adicioná-lo direto ao pedido.
          </div>

          {carregando ? (
            <div style={{ fontSize: 12, color: 'var(--texto-terciario)', textAlign: 'center', padding: 20 }}>
              <Loader2 size={16} style={{ marginRight: 6 }} /> Carregando...
            </div>
          ) : itens.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--texto-terciario)', textAlign: 'center', padding: 20 }}>
              Nenhum exame cadastrado ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {itens.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                  backgroundColor: 'var(--bg-input)', borderRadius: 5,
                }}>
                  {editandoId === item.id ? (
                    <>
                      <input
                        autoFocus
                        value={nomeEdicao}
                        onChange={e => setNomeEdicao(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') salvarEdicao(item.id)
                          if (e.key === 'Escape') setEditandoId(null)
                        }}
                        style={{ ...INPUT_STYLE, flex: 1, padding: '4px 7px' }}
                      />
                      <button
                        type="button"
                        onClick={() => salvarEdicao(item.id)}
                        disabled={ocupadoId === item.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cor-sucesso)', display: 'flex', padding: 4 }}
                        title="Salvar"
                      >
                        {ocupadoId === item.id ? <Loader2 size={14} /> : <Check size={14} />}
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 12.5, color: 'var(--texto-principal)' }}>{item.nome}</span>
                      <button
                        type="button"
                        onClick={() => iniciarEdicao(item)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', display: 'flex', padding: 4 }}
                        title="Renomear"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(item)}
                        disabled={ocupadoId === item.id}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cor-erro)', display: 'flex', padding: 4 }}
                        title="Remover"
                      >
                        {ocupadoId === item.id ? <Loader2 size={13} /> : <Trash2 size={13} />}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', gap: 8, padding: '12px 18px',
          borderTop: '1px solid var(--borda-suave)', backgroundColor: 'var(--bg-card)', flexShrink: 0,
        }}>
          <input
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
            placeholder="Nome do novo exame..."
            style={INPUT_STYLE}
          />
          <button
            type="button"
            onClick={adicionar}
            disabled={salvandoNovo || !novoNome.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
              padding: '7px 14px', fontSize: 12.5, fontWeight: 700,
              backgroundColor: COR, color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              opacity: (salvandoNovo || !novoNome.trim()) ? 0.55 : 1,
            }}
          >
            {salvandoNovo ? <Loader2 size={14} /> : <Plus size={14} />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
