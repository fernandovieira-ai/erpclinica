'use client'

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Plus, X, Search, ClipboardList } from 'lucide-react'
import { planoContasSchema, type PlanoContasInput } from '@/lib/validators/plano-contas.schema'
import type { PlanoContas, PlanoContasListItem } from '@/types/cadastros.types'

interface Props { conta?: PlanoContas }

const CLASSIFICACOES = [
  { v: '01', l: '01 — Ativo' },
  { v: '02', l: '02 — Passivo' },
  { v: '03', l: '03 — Patrimônio Líquido' },
  { v: '04', l: '04 — Resultado' },
  { v: '05', l: '05 — Compensação' },
  { v: '09', l: '09 — Outros' },
] as const

// ── Primitivos ────────────────────────────────────────────────────────────────

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, onBlur, onFocus, onChange, type, ...props }, ref) {
    const isText = type !== 'number' && type !== 'date'
    return (
      <input ref={ref} type={type} {...props}
        style={{
          width: '100%', padding: '3px 6px',
          backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
          border: '1px solid var(--borda-media)', borderRadius: 3,
          fontSize: 12, outline: 'none',
          textTransform: isText ? 'uppercase' : undefined,
          ...style,
        }}
        onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)'; onFocus?.(e) }}
        onBlur={e  => { e.target.style.borderColor = 'var(--borda-media)';  onBlur?.(e)  }}
        onChange={e => { if (isText) e.target.value = e.target.value.toUpperCase(); onChange?.(e) }}
      />
    )
  },
)

const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ style, ...props }, ref) {
    return (
      <select ref={ref} {...props} style={{
        width: '100%', padding: '3px 6px',
        backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
        border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, ...style,
      }} />
    )
  },
)

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', gap: '2px 6px', minHeight: 24 }}>
      <label style={{ textAlign: 'right', fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', paddingRight: 2 }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{children}</div>
    </div>
  )
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', ...style }}>{children}</label>
}

// ── Modal picker de conta pai ─────────────────────────────────────────────────

function ContaPickerModal({ onSelect, onClose, excludeId }: {
  onSelect: (c: PlanoContasListItem) => void
  onClose:  () => void
  excludeId?: number
}) {
  const [busca,   setBusca]   = useState('')
  const [lista,   setLista]   = useState<PlanoContasListItem[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pesquisar = useCallback(async (termo: string) => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ ativo: 'true', tipo: 'S', limit: '200' })
      if (termo.trim()) sp.set('busca', termo.trim())
      const res = await fetch(`/api/cadastro/plano-contas?${sp}`)
      if (res.ok) {
        const data = await res.json()
        setLista((data.dados as PlanoContasListItem[]).filter(c => c.id !== excludeId))
      }
    } finally { setLoading(false) }
  }, [excludeId])

  useEffect(() => { pesquisar(''); inputRef.current?.focus() }, [pesquisar])
  useEffect(() => {
    const t = setTimeout(() => pesquisar(busca), 300)
    return () => clearTimeout(t)
  }, [busca, pesquisar])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' }}>
      <div style={{ position: 'relative', width: 560, maxHeight: '75vh', backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda-media)', borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--borda-media)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)' }}>Selecionar Conta Pai (Sintética)</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-secundario)', display: 'flex' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--borda-suave)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)', pointerEvents: 'none' }} />
            <input ref={inputRef} value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Pesquisar por código ou descrição..."
              style={{ width: '100%', padding: '5px 8px 5px 28px', boxSizing: 'border-box', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--borda-media)' }}
            />
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>Carregando...</div>}
          {!loading && lista.length === 0 && <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>Nenhuma conta sintética encontrada</div>}
          {!loading && lista.map(c => (
            <button key={c.id} type="button" onClick={() => onSelect(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--borda-suave)', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-input)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
            >
              <span style={{ width: 100, flexShrink: 0, fontFamily: 'var(--fonte-mono)', fontSize: 12, fontWeight: 600, color: 'var(--cor-primaria)' }}>{c.codigo}</span>
              <span style={{ fontSize: 12, color: 'var(--texto-principal)' }}>{c.descricao}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--borda-suave)', fontSize: 11, color: 'var(--texto-terciario)' }}>
          {lista.length} conta{lista.length !== 1 ? 's' : ''} sintética{lista.length !== 1 ? 's' : ''} encontrada{lista.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function PlanoContasFormPage({ conta }: Props) {
  const router  = useRouter()
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [excluding, setExcluding] = useState(false)
  const [modalPai,  setModalPai]  = useState(false)
  const [paiCodigo, setPaiCodigo] = useState('')
  const [paiDesc,   setPaiDesc]   = useState(conta?.pai_desc ?? '')

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<PlanoContasInput>({
    resolver: zodResolver(planoContasSchema),
    defaultValues: { tipo: 'A', natureza: 'D', classificacao: '09', ativo: true },
  })

  const tipoWatched = watch('tipo')

  useEffect(() => {
    if (!conta) return
    setPaiDesc(conta.pai_desc ?? '')
    reset({
      codigo:        conta.codigo,
      descricao:     conta.descricao,
      pai_id:        conta.pai_id ?? undefined,
      tipo:          conta.tipo,
      natureza:      conta.natureza,
      classificacao: conta.classificacao,
      grupo:         conta.grupo ?? '',
      ativo:         conta.ativo,
    })
    if (conta.pai_id) {
      fetch(`/api/cadastro/plano-contas/${conta.pai_id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setPaiCodigo(d.codigo ?? ''))
    }
  }, [conta, reset])

  function selecionarPai(c: PlanoContasListItem) {
    setValue('pai_id', c.id, { shouldValidate: true })
    setPaiCodigo(c.codigo)
    setPaiDesc(c.descricao)
    setModalPai(false)
  }

  function limparPai() {
    setValue('pai_id', undefined)
    setPaiCodigo('')
    setPaiDesc('')
  }

  async function onSubmit(data: PlanoContasInput) {
    setSaving(true)
    try {
      const url    = conta ? `/api/cadastro/plano-contas/${conta.id}` : '/api/cadastro/plano-contas'
      const method = conta ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(conta ? 'Conta atualizada!' : 'Conta cadastrada!')
      if (!conta) router.push(`/cadastro/plano-contas/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function desativar() {
    if (!conta || !confirm(`Desativar "${conta.descricao}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/cadastro/plano-contas/${conta.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: false }),
      })
      toast.success('Conta desativada')
      router.push('/cadastro/plano-contas')
    } finally { setDeleting(false) }
  }

  async function excluir() {
    if (!conta || !confirm(`Excluir permanentemente "${conta.descricao}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluding(true)
    try {
      const res = await fetch(`/api/cadastro/plano-contas/${conta.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir — verifique se não há vínculos'); return }
      toast.success('Conta excluída')
      router.push('/cadastro/plano-contas')
    } finally { setExcluding(false) }
  }

  return (
    <>
      {modalPai && <ContaPickerModal onSelect={selecionarPai} onClose={() => setModalPai(false)} excludeId={conta?.id} />}

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--borda-media)', position: 'sticky', top: 0, zIndex: 20 }}>
          <button type="button" onClick={() => router.push('/cadastro/plano-contas')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            <ArrowLeft size={13} /> Voltar
          </button>
          <div style={{ width: 1, height: 18, backgroundColor: 'var(--borda-media)', margin: '0 4px' }} />
          <button type="button" onClick={() => router.push('/cadastro/plano-contas/novo')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            <Plus size={13} /> Nova Conta
          </button>
          <button type="submit" disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px', background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {conta && (
            <button type="button" onClick={desativar} disabled={deleting}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)' }}>
              <Trash2 size={13} /> Desativar
            </button>
          )}
          {conta && (
            <button type="button" onClick={excluir} disabled={excluding}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--cor-erro)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: excluding ? 'not-allowed' : 'pointer', opacity: excluding ? 0.7 : 1 }}>
              <X size={13} /> {excluding ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
          {conta && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--texto-terciario)' }}>#{conta.id} — {conta.ativo ? 'Ativa' : 'Inativa'}</span>}
        </div>

        {/* ── Aba (única) ── */}
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

            {/* Código + toggle tipo */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>Código:</Label>
              <input readOnly value={conta?.id ?? ''}
                style={{ width: 60, padding: '3px 6px', backgroundColor: 'var(--bg-page)', color: 'var(--texto-terciario)', border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)' }} />
              <Label style={{ marginLeft: 8 }}>Número:</Label>
              <Input {...register('codigo')}
                style={{ width: 160, fontFamily: 'var(--fonte-mono)', border: errors.codigo ? '1px solid var(--cor-erro)' : undefined }}
                placeholder="1.1.01.001" />
              {errors.codigo && <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.codigo.message}</span>}
              <button type="button" onClick={() => setValue('tipo', tipoWatched === 'S' ? 'A' : 'S')}
                style={{ marginLeft: 8, padding: '3px 12px', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: tipoWatched === 'S' ? 'var(--cor-primaria)' : 'var(--bg-input)',
                  color: tipoWatched === 'S' ? '#fff' : 'var(--texto-secundario)',
                  fontWeight: tipoWatched === 'S' ? 600 : 400 }}>
                {tipoWatched === 'S' ? 'Sintética' : 'Analítica'}
              </button>
            </div>

            {/* Descrição */}
            <Row label="Descrição:">
              <Input {...register('descricao')} style={{ border: errors.descricao ? '1px solid var(--cor-erro)' : undefined }} />
              {errors.descricao && <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.descricao.message}</span>}
            </Row>

            {/* Conta Pai */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>Conta Pai:</Label>
              <input readOnly value={paiCodigo} placeholder="—"
                style={{ width: 100, padding: '3px 6px', backgroundColor: 'var(--bg-page)', color: 'var(--texto-principal)', border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)' }} />
              <input readOnly value={paiDesc} placeholder="Clique na lupa para selecionar"
                style={{ flex: 1, padding: '3px 6px', backgroundColor: 'var(--bg-page)', color: 'var(--texto-secundario)', border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12 }} />
              <button type="button" onClick={() => setModalPai(true)} title="Pesquisar conta pai"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, flexShrink: 0, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
                <Search size={12} />
              </button>
              {(paiCodigo || paiDesc) && (
                <button type="button" onClick={limparPai} title="Limpar conta pai"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, flexShrink: 0, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, cursor: 'pointer', color: 'var(--texto-terciario)' }}>
                  <X size={12} />
                </button>
              )}
            </div>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

            {/* Grupo */}
            <Row label="Grupo:">
              <Input {...register('grupo')} style={{ width: 200 }} placeholder="Ex: ATIVO CIRCULANTE" />
            </Row>

            {/* Classificação SPED */}
            <Row label="Classif. SPED:">
              <Select {...register('classificacao')} style={{ width: 260 }}>
                {CLASSIFICACOES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
              </Select>
            </Row>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

            {/* Ativo */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>Ativo:</Label>
              <select value={watch('ativo') ? 'true' : 'false'} onChange={e => setValue('ativo', e.target.value === 'true')}
                style={{ width: 80, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12 }}>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>

            </div>
          </fieldset>
          </div>

          {/* Coluna direita — Tipo + Natureza */}
          <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

            <fieldset className="form-fieldset">
              <legend>Tipo</legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                {[
                  { v: 'A' as const, l: 'Analítica', desc: 'Aceita lançamentos' },
                  { v: 'S' as const, l: 'Sintética', desc: 'Agrupador' },
                ].map(({ v, l, desc }) => (
                  <label key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer' }}>
                    <input type="radio" checked={tipoWatched === v} onChange={() => setValue('tipo', v)} style={{ marginTop: 2, cursor: 'pointer' }} />
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--texto-principal)', fontWeight: tipoWatched === v ? 600 : 400 }}>{l}</div>
                      <div style={{ fontSize: 10, color: 'var(--texto-terciario)' }}>{desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="form-fieldset">
              <legend>Natureza</legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                {[
                  { v: 'D' as const, l: 'Devedora' },
                  { v: 'C' as const, l: 'Credora' },
                ].map(({ v, l }) => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}>
                    <input type="radio" checked={watch('natureza') === v} onChange={() => setValue('natureza', v)} style={{ cursor: 'pointer' }} />
                    <span style={{ color: 'var(--texto-principal)', fontWeight: watch('natureza') === v ? 600 : 400 }}>{l}</span>
                  </label>
                ))}
              </div>
            </fieldset>

          </div>
        </div>
      </form>
    </>
  )
}
