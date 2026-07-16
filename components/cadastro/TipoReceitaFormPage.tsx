'use client'

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Plus, X, Search, ClipboardList } from 'lucide-react'
import { tipoReceitaSchema, type TipoReceitaInput } from '@/lib/validators/tipo-receita.schema'
import type { TipoReceita, TipoReceitaListItem, PlanoContasListItem } from '@/types/cadastros.types'

interface Props { tipo?: TipoReceita }

// ── Primitivos ────────────────────────────────────────────────────────────────

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, onBlur, onFocus, onChange, type, ...props }, ref) {
    const isText = type !== 'number' && type !== 'date'
    return (
      <input ref={ref} type={type} {...props}
        style={{ width: '100%', padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none', textTransform: isText ? 'uppercase' : undefined, ...style }}
        onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)'; onFocus?.(e) }}
        onBlur={e  => { e.target.style.borderColor = 'var(--borda-media)';  onBlur?.(e)  }}
        onChange={e => { if (isText) e.target.value = e.target.value.toUpperCase(); onChange?.(e) }}
      />
    )
  },
)

const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ style, ...props }, ref) {
    return <select ref={ref} {...props} style={{ width: '100%', padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, ...style }} />
  },
)

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'center', gap: '2px 6px', minHeight: 24 }}>
      <label style={{ textAlign: 'right', fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', paddingRight: 2 }}>{label}</label>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{children}</div>
    </div>
  )
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', ...style }}>{children}</label>
}

// ── Modal picker genérico ─────────────────────────────────────────────────────

function PickerModal<T extends { id: number }>({ title, url, renderItem, onSelect, onClose, excludeId }: {
  title:      string
  url:        string
  renderItem: (item: T) => React.ReactNode
  onSelect:   (item: T) => void
  onClose:    () => void
  excludeId?: number
}) {
  const [busca,   setBusca]   = useState('')
  const [lista,   setLista]   = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pesquisar = useCallback(async (termo: string) => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ ativo: 'true', limit: '200' })
      if (termo.trim()) sp.set('busca', termo.trim())
      const res = await fetch(`${url}?${sp}`)
      if (res.ok) {
        const data = await res.json()
        const items = Array.isArray(data) ? data : (data.dados ?? [])
        setLista(items.filter((i: T) => i.id !== excludeId))
      }
    } finally { setLoading(false) }
  }, [url, excludeId])

  useEffect(() => { pesquisar(''); inputRef.current?.focus() }, [pesquisar])
  useEffect(() => {
    const t = setTimeout(() => pesquisar(busca), 300)
    return () => clearTimeout(t)
  }, [busca, pesquisar])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div style={{ position: 'relative', width: 560, maxHeight: '75vh', backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda-media)', borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--borda-media)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)' }}>{title}</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-secundario)', display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--borda-suave)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)', pointerEvents: 'none' }} />
            <input ref={inputRef} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar por código ou descrição..."
              style={{ width: '100%', padding: '5px 8px 5px 28px', boxSizing: 'border-box', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--borda-media)' }}
            />
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>Carregando...</div>}
          {!loading && lista.length === 0 && <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>Nenhum registro encontrado</div>}
          {!loading && lista.map(item => (
            <button key={item.id} type="button" onClick={() => onSelect(item)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--borda-suave)', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-input)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
            >
              {renderItem(item)}
            </button>
          ))}
        </div>
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--borda-suave)', fontSize: 11, color: 'var(--texto-terciario)' }}>
          {lista.length} registro{lista.length !== 1 ? 's' : ''} encontrado{lista.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function TipoReceitaFormPage({ tipo }: Props) {
  const router  = useRouter()
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [excluding, setExcluding] = useState(false)
  const [modalPai,  setModalPai]  = useState(false)
  const [modalConta, setModalConta] = useState(false)

  const [paiCodigo,   setPaiCodigo]   = useState('')
  const [paiDesc,     setPaiDesc]     = useState(tipo?.pai_desc ?? '')
  const [contaCodigo, setContaCodigo] = useState(tipo?.conta_codigo ?? '')
  const [contaDesc,   setContaDesc]   = useState(tipo?.conta_desc ?? '')

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<TipoReceitaInput>({
    resolver: zodResolver(tipoReceitaSchema),
    defaultValues: { natureza: 'O', ind_pis_cofins: false, ativo: true },
  })

  useEffect(() => {
    if (!tipo) return
    setPaiDesc(tipo.pai_desc ?? '')
    setContaCodigo(tipo.conta_codigo ?? '')
    setContaDesc(tipo.conta_desc ?? '')
    reset({
      codigo:         tipo.codigo,
      descricao:      tipo.descricao,
      natureza:       tipo.natureza,
      conta_id:       tipo.conta_id ?? undefined,
      ind_pis_cofins: tipo.ind_pis_cofins,
      pai_id:         tipo.pai_id ?? undefined,
      ativo:          tipo.ativo,
    })
    if (tipo.pai_id) {
      fetch(`/api/cadastro/tipos-receita/${tipo.pai_id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setPaiCodigo(d.codigo ?? ''))
    }
  }, [tipo, reset])

  async function onSubmit(data: TipoReceitaInput) {
    setSaving(true)
    try {
      const url    = tipo ? `/api/cadastro/tipos-receita/${tipo.id}` : '/api/cadastro/tipos-receita'
      const method = tipo ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(tipo ? 'Tipo de receita atualizado!' : 'Tipo de receita cadastrado!')
      if (!tipo) router.push(`/cadastro/tipos-receita/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function desativar() {
    if (!tipo || !confirm(`Desativar "${tipo.descricao}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/cadastro/tipos-receita/${tipo.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: false }),
      })
      toast.success('Tipo de receita desativado')
      router.push('/cadastro/tipos-receita')
    } finally { setDeleting(false) }
  }

  async function excluir() {
    if (!tipo || !confirm(`Excluir permanentemente "${tipo.descricao}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluding(true)
    try {
      const res = await fetch(`/api/cadastro/tipos-receita/${tipo.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir — verifique se não há vínculos'); return }
      toast.success('Tipo de receita excluído')
      router.push('/cadastro/tipos-receita')
    } finally { setExcluding(false) }
  }

  const btnLupa  = (onClick: () => void) => (
    <button type="button" onClick={onClick} title="Pesquisar"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, flexShrink: 0, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
      <Search size={12} />
    </button>
  )

  const btnLimpar = (onClear: () => void) => (
    <button type="button" onClick={onClear} title="Limpar"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, flexShrink: 0, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, cursor: 'pointer', color: 'var(--texto-terciario)' }}>
      <X size={12} />
    </button>
  )

  return (
    <>
      {modalPai && (
        <PickerModal<TipoReceitaListItem>
          title="Selecionar Tipo Pai"
          url="/api/cadastro/tipos-receita"
          excludeId={tipo?.id}
          renderItem={item => (
            <>
              <span style={{ width: 80, flexShrink: 0, fontFamily: 'var(--fonte-mono)', fontSize: 12, fontWeight: 600, color: 'var(--cor-primaria)' }}>{item.codigo}</span>
              <span style={{ fontSize: 12, color: 'var(--texto-principal)' }}>{item.descricao}</span>
            </>
          )}
          onSelect={item => { setValue('pai_id', item.id); setPaiCodigo(item.codigo); setPaiDesc(item.descricao); setModalPai(false) }}
          onClose={() => setModalPai(false)}
        />
      )}

      {modalConta && (
        <PickerModal<PlanoContasListItem>
          title="Selecionar Conta do Plano de Contas"
          url="/api/cadastro/plano-contas"
          renderItem={item => (
            <>
              <span style={{ width: 110, flexShrink: 0, fontFamily: 'var(--fonte-mono)', fontSize: 12, fontWeight: 600, color: 'var(--cor-primaria)' }}>{item.codigo}</span>
              <span style={{ fontSize: 12, color: 'var(--texto-principal)' }}>{item.descricao}</span>
            </>
          )}
          onSelect={item => { setValue('conta_id', item.id); setContaCodigo(item.codigo); setContaDesc(item.descricao); setModalConta(false) }}
          onClose={() => setModalConta(false)}
        />
      )}

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--borda-media)', position: 'sticky', top: 0, zIndex: 20 }}>
          <button type="button" onClick={() => router.push('/cadastro/tipos-receita')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            <ArrowLeft size={13} /> Voltar
          </button>
          <div style={{ width: 1, height: 18, backgroundColor: 'var(--borda-media)', margin: '0 4px' }} />
          <button type="button" onClick={() => router.push('/cadastro/tipos-receita/novo')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            <Plus size={13} /> Novo
          </button>
          <button type="submit" disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px', background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {tipo && (
            <button type="button" onClick={desativar} disabled={deleting}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)' }}>
              <Trash2 size={13} /> Desativar
            </button>
          )}
          {tipo && (
            <button type="button" onClick={excluir} disabled={excluding}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--cor-erro)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: excluding ? 'not-allowed' : 'pointer', opacity: excluding ? 0.7 : 1 }}>
              <X size={13} /> {excluding ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
          {tipo && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--texto-terciario)' }}>#{tipo.id} — {tipo.ativo ? 'Ativo' : 'Inativo'}</span>}
        </div>

        {/* ── Aba ── */}
        <div style={{ display: 'flex', backgroundColor: 'var(--bg-page)', borderBottom: '1px solid var(--borda-media)', paddingLeft: 12 }}>
          <button type="button" style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, color: 'var(--cor-primaria)', background: 'var(--bg-card)', border: 'none', borderBottom: '2px solid var(--cor-primaria)', borderRight: '1px solid var(--borda-suave)', cursor: 'default' }}>
            Principal
          </button>
        </div>

        {/* ── Corpo ── */}
        <div style={{ padding: '14px 20px', display: 'flex', gap: 16, overflowY: 'auto', flex: 1 }}>

          {/* Coluna esquerda */}
          <div style={{ flex: 1, minWidth: 0 }}>
          <fieldset className="form-fieldset">
            <legend>
              <ClipboardList size={12} /> Dados Gerais
            </legend>
            <div className="form-fieldset-body">

            {/* Código + ID */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Label style={{ width: 130, textAlign: 'right', paddingRight: 2 }}>Código:</Label>
              <input readOnly value={tipo?.id ?? ''}
                style={{ width: 60, padding: '3px 6px', backgroundColor: 'var(--bg-page)', color: 'var(--texto-terciario)', border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)' }} />
              <Label style={{ marginLeft: 8 }}>Número:</Label>
              <Input {...register('codigo')}
                style={{ width: 140, fontFamily: 'var(--fonte-mono)', border: errors.codigo ? '1px solid var(--cor-erro)' : undefined }}
                placeholder="1.01" />
              {errors.codigo && <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.codigo.message}</span>}
            </div>

            {/* Descrição */}
            <Row label="Descrição:">
              <Input {...register('descricao')} style={{ border: errors.descricao ? '1px solid var(--cor-erro)' : undefined }} />
              {errors.descricao && <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.descricao.message}</span>}
            </Row>

            {/* Tipo Pai */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Label style={{ width: 130, textAlign: 'right', paddingRight: 2 }}>Tipo Pai:</Label>
              <input readOnly value={paiCodigo} placeholder="—"
                style={{ width: 80, padding: '3px 6px', backgroundColor: 'var(--bg-page)', color: 'var(--texto-principal)', border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)' }} />
              <input readOnly value={paiDesc} placeholder="Clique na lupa para selecionar"
                style={{ flex: 1, padding: '3px 6px', backgroundColor: 'var(--bg-page)', color: 'var(--texto-secundario)', border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12 }} />
              {btnLupa(() => setModalPai(true))}
              {(paiCodigo || paiDesc) && btnLimpar(() => { setValue('pai_id', undefined); setPaiCodigo(''); setPaiDesc('') })}
            </div>

            {/* Conta Plano de Contas */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Label style={{ width: 130, textAlign: 'right', paddingRight: 2 }}>Conta Contábil:</Label>
              <input readOnly value={contaCodigo} placeholder="—"
                style={{ width: 110, padding: '3px 6px', backgroundColor: 'var(--bg-page)', color: 'var(--texto-principal)', border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)' }} />
              <input readOnly value={contaDesc} placeholder="Clique na lupa para selecionar"
                style={{ flex: 1, padding: '3px 6px', backgroundColor: 'var(--bg-page)', color: 'var(--texto-secundario)', border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12 }} />
              {btnLupa(() => setModalConta(true))}
              {(contaCodigo || contaDesc) && btnLimpar(() => { setValue('conta_id', undefined); setContaCodigo(''); setContaDesc('') })}
            </div>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

            {/* Natureza */}
            <Row label="Natureza:">
              <Select {...register('natureza')} style={{ width: 260 }}>
                <option value="O">Operacional</option>
                <option value="F">Financeira</option>
                <option value="E">Eventual / Não-Operacional</option>
              </Select>
            </Row>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

            {/* Ativo */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Label style={{ width: 130, textAlign: 'right', paddingRight: 2 }}>Ativo:</Label>
              <select value={watch('ativo') ? 'true' : 'false'} onChange={e => setValue('ativo', e.target.value === 'true')}
                style={{ width: 80, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12 }}>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>

            </div>
          </fieldset>
          </div>

          {/* Coluna direita — indicador */}
          <div style={{ width: 200, flexShrink: 0 }}>
            <fieldset className="form-fieldset">
              <legend>Indicadores</legend>
              <div style={{ paddingTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--texto-principal)', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={watch('ind_pis_cofins')}
                    onChange={e => setValue('ind_pis_cofins', e.target.checked)}
                    style={{ cursor: 'pointer', width: 13, height: 13 }}
                  />
                  Incide PIS/COFINS
                </label>
              </div>
            </fieldset>
          </div>

        </div>
      </form>
    </>
  )
}
