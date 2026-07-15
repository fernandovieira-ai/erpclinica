'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import type { TaxaCartaoListItem } from '@/types/cartao.types'

interface Props { condicaoPagamentoId?: number }

const today = () => new Date().toISOString().slice(0, 10)

type FormState = {
  percentual_mdr:            string
  percentual_antecipacao_am: string
  prazo_recebimento_dias:    string
  data_vigencia_inicio:      string
  data_vigencia_fim:         string
}

const FORM_VAZIO: FormState = {
  percentual_mdr: '', percentual_antecipacao_am: '0', prazo_recebimento_dias: '30',
  data_vigencia_inicio: today(), data_vigencia_fim: '',
}

function vigente(t: TaxaCartaoListItem) {
  const hoje = today()
  return t.data_vigencia_inicio <= hoje && (!t.data_vigencia_fim || t.data_vigencia_fim >= hoje)
}

export default function TaxaCartaoInline({ condicaoPagamentoId }: Props) {
  const [taxas,     setTaxas]     = useState<TaxaCartaoListItem[]>([])
  const [loading,   setLoading]   = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState<FormState>(FORM_VAZIO)
  const [saving,    setSaving]    = useState(false)
  const [erro,      setErro]      = useState('')

  const carregar = useCallback(() => {
    if (!condicaoPagamentoId) return
    setLoading(true)
    fetch(`/api/financeiro/cartao/taxas?condicao_pagamento_id=${condicaoPagamentoId}&limit=50`)
      .then(r => r.json())
      .then(d => setTaxas(d.dados ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [condicaoPagamentoId])

  useEffect(() => { carregar() }, [carregar])

  function abrirNova() {
    setEditingId(null)
    setForm(FORM_VAZIO)
    setErro('')
    setShowForm(true)
  }

  function abrirEdicao(t: TaxaCartaoListItem) {
    setEditingId(t.id)
    setForm({
      percentual_mdr:            String(Number(t.percentual_mdr)),
      percentual_antecipacao_am: String(Number(t.percentual_antecipacao_am)),
      prazo_recebimento_dias:    String(t.prazo_recebimento_dias),
      data_vigencia_inicio:      t.data_vigencia_inicio,
      data_vigencia_fim:         t.data_vigencia_fim ?? '',
    })
    setErro('')
    setShowForm(true)
  }

  function cancelar() {
    setShowForm(false)
    setEditingId(null)
    setErro('')
  }

  async function salvar() {
    if (!condicaoPagamentoId) return
    const mdr = Number(form.percentual_mdr)
    if (!form.percentual_mdr || Number.isNaN(mdr) || mdr < 0 || mdr > 100) { setErro('MDR inválido'); return }
    if (!form.data_vigencia_inicio) { setErro('Data de início da vigência é obrigatória'); return }

    const payload = {
      condicao_pagamento_id:     condicaoPagamentoId,
      percentual_mdr:            mdr,
      percentual_antecipacao_am: Number(form.percentual_antecipacao_am) || 0,
      prazo_recebimento_dias:    parseInt(form.prazo_recebimento_dias, 10) || 0,
      data_vigencia_inicio:      form.data_vigencia_inicio,
      data_vigencia_fim:         form.data_vigencia_fim || null,
    }

    setSaving(true)
    setErro('')
    try {
      const url    = editingId ? `/api/financeiro/cartao/taxas/${editingId}` : '/api/financeiro/cartao/taxas'
      const method = editingId ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json   = await res.json()
      if (!res.ok) { setErro(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(editingId ? 'Taxa atualizada!' : 'Taxa cadastrada!')
      setShowForm(false)
      setEditingId(null)
      carregar()
    } finally { setSaving(false) }
  }

  async function excluir(t: TaxaCartaoListItem) {
    if (!confirm(`Excluir a taxa de ${Number(t.percentual_mdr).toFixed(2)}% (vigência ${t.data_vigencia_inicio})?`)) return
    const res = await fetch(`/api/financeiro/cartao/taxas/${t.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Erro ao excluir'); return }
    toast.success('Taxa excluída!')
    carregar()
  }

  const fieldStyle = { width: '100%', padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' } as React.CSSProperties

  return (
    <fieldset style={{ border: '1px solid var(--borda-media)', borderRadius: 4, padding: '8px 14px 12px' }}>
      <legend style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)', padding: '0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Taxas de Cartão (MDR)
      </legend>

      {!condicaoPagamentoId && (
        <div style={{ fontSize: 12, color: 'var(--texto-terciario)', paddingTop: 6, lineHeight: 1.5 }}>
          Salve a condição de pagamento primeiro para poder cadastrar as taxas (MDR).
        </div>
      )}

      {condicaoPagamentoId && (
        <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>

          {loading && <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>Carregando...</div>}

          {!loading && taxas.length === 0 && !showForm && (
            <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>Nenhuma taxa cadastrada.</div>
          )}

          {!loading && taxas.map(t => (
            <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px', border: '1px solid var(--borda-suave)', borderRadius: 4, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>MDR {Number(t.percentual_mdr).toFixed(2)}%</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button type="button" onClick={() => abrirEdicao(t)} title="Editar"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-secundario)', display: 'flex', padding: 2 }}>
                    <Pencil size={12} />
                  </button>
                  <button type="button" onClick={() => excluir(t)} title="Excluir"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cor-erro)', display: 'flex', padding: 2 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div style={{ color: 'var(--texto-terciario)', fontSize: 11 }}>
                Antecipação {Number(t.percentual_antecipacao_am).toFixed(2)}% a.m. · Prazo {t.prazo_recebimento_dias}d
              </div>
              <div style={{ color: 'var(--texto-terciario)', fontSize: 11 }}>
                Vigência: {t.data_vigencia_inicio} {t.data_vigencia_fim ? `a ${t.data_vigencia_fim}` : '(indeterminado)'}
                {' '}
                <span style={{ fontWeight: 600, color: vigente(t) ? 'var(--cor-sucesso)' : 'var(--texto-terciario)' }}>
                  {vigente(t) ? '· vigente' : '· fora de vigência'}
                </span>
              </div>
            </div>
          ))}

          {!showForm && (
            <button type="button" onClick={abrirNova}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '5px 10px', background: 'none', border: '1px dashed var(--borda-media)', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: 'var(--cor-primaria)' }}>
              <Plus size={13} /> Nova Taxa
            </button>
          )}

          {showForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px', border: '1px solid var(--cor-primaria)', borderRadius: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{editingId ? 'Editar Taxa' : 'Nova Taxa'}</span>
                <button type="button" onClick={cancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', display: 'flex' }}>
                  <X size={14} />
                </button>
              </div>

              <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>MDR (%)*
                <input type="number" min={0} max={100} step={0.0001} value={form.percentual_mdr}
                  onChange={e => setForm(f => ({ ...f, percentual_mdr: e.target.value }))}
                  style={{ ...fieldStyle, marginTop: 2 }} />
              </label>

              <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Antecipação (% a.m.)
                <input type="number" min={0} max={100} step={0.0001} value={form.percentual_antecipacao_am}
                  onChange={e => setForm(f => ({ ...f, percentual_antecipacao_am: e.target.value }))}
                  style={{ ...fieldStyle, marginTop: 2 }} />
              </label>

              <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Prazo de Recebimento (dias)*
                <input type="number" min={0} value={form.prazo_recebimento_dias}
                  onChange={e => setForm(f => ({ ...f, prazo_recebimento_dias: e.target.value }))}
                  style={{ ...fieldStyle, marginTop: 2 }} />
              </label>

              <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Vigência — Início*
                <input type="date" value={form.data_vigencia_inicio}
                  onChange={e => setForm(f => ({ ...f, data_vigencia_inicio: e.target.value }))}
                  style={{ ...fieldStyle, marginTop: 2 }} />
              </label>

              <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Vigência — Fim
                <input type="date" value={form.data_vigencia_fim}
                  onChange={e => setForm(f => ({ ...f, data_vigencia_fim: e.target.value }))}
                  style={{ ...fieldStyle, marginTop: 2 }} />
              </label>

              {erro && <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{erro}</span>}

              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button type="button" onClick={salvar} disabled={saving}
                  style={{ flex: 1, padding: '5px 10px', background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Salvando...' : 'Salvar Taxa'}
                </button>
                <button type="button" onClick={cancelar}
                  style={{ padding: '5px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </fieldset>
  )
}
