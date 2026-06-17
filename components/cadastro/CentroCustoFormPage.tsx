'use client'

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Plus, X, Search } from 'lucide-react'
import { centroCustoSchema, type CentroCustoInput } from '@/lib/validators/centro-custo.schema'
import type { CentroCusto, CentroCustoListItem } from '@/types/cadastros.types'

interface Props { centro?: CentroCusto }

// ── Primitivos de UI ──────────────────────────────────────────────────────────

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, onBlur, onFocus, onChange, type, ...props }, ref) {
    const isText = type !== 'number' && type !== 'date'
    return (
      <input
        ref={ref}
        type={type}
        {...props}
        style={{
          width: '100%', padding: '3px 6px',
          backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
          border: '1px solid var(--borda-media)', borderRadius: 3,
          fontSize: 12, fontFamily: 'var(--fonte-sans)',
          outline: 'none',
          textTransform: isText ? 'uppercase' : undefined,
          ...style,
        }}
        onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)'; onFocus?.(e) }}
        onBlur={e  => { e.target.style.borderColor = 'var(--borda-media)';  onBlur?.(e)  }}
        onChange={e => {
          if (isText) e.target.value = e.target.value.toUpperCase()
          onChange?.(e)
        }}
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
        border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12,
        ...style,
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
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', ...style }}>
      {children}
    </label>
  )
}

// ── Modal picker de C.C. Sintético (pai) ─────────────────────────────────────

function CentroCustoPickerModal({ onSelect, onClose, excludeId }: {
  onSelect: (cc: CentroCustoListItem) => void
  onClose:  () => void
  excludeId?: number
}) {
  const [busca,   setBusca]   = useState('')
  const [lista,   setLista]   = useState<CentroCustoListItem[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pesquisar = useCallback(async (termo: string) => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ ativo: 'true', tipo: 'S', limit: '100' })
      if (termo.trim()) sp.set('busca', termo.trim())
      const res = await fetch(`/api/cadastro/centros-custo?${sp}`)
      if (res.ok) {
        const data = await res.json()
        // Filtra sintéticos e exclui o próprio registro (evitar auto-referência)
        setLista((data.dados as CentroCustoListItem[]).filter(
          c => c.tipo === 'S' && c.id !== excludeId,
        ))
      }
    } finally { setLoading(false) }
  }, [excludeId])

  useEffect(() => { pesquisar(''); inputRef.current?.focus() }, [pesquisar])
  useEffect(() => {
    const t = setTimeout(() => pesquisar(busca), 300)
    return () => clearTimeout(t)
  }, [busca, pesquisar])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
    }}>
      <div style={{
        position: 'relative', width: 520, maxHeight: '75vh',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--borda-media)', borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--borda-media)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)' }}>
            Selecionar C.C. Sintético
          </span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-secundario)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--borda-suave)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)', pointerEvents: 'none' }} />
            <input
              ref={inputRef}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Pesquisar por código ou descrição..."
              style={{ width: '100%', padding: '5px 8px 5px 28px', boxSizing: 'border-box',
                backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--borda-media)' }}
            />
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>Carregando...</div>}
          {!loading && lista.length === 0 && <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>Nenhum centro de custo sintético encontrado</div>}
          {!loading && lista.map(cc => (
            <button
              key={cc.id}
              type="button"
              onClick={() => onSelect(cc)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 16px',
                background: 'none', border: 'none', borderBottom: '1px solid var(--borda-suave)',
                cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-input)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
            >
              <span style={{ width: 80, flexShrink: 0, fontFamily: 'var(--fonte-mono)', fontSize: 12, fontWeight: 600, color: 'var(--cor-primaria)' }}>
                {cc.codigo}
              </span>
              <span style={{ fontSize: 12, color: 'var(--texto-principal)' }}>{cc.descricao}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--borda-suave)', fontSize: 11, color: 'var(--texto-terciario)' }}>
          {lista.length} centro{lista.length !== 1 ? 's' : ''} sintético{lista.length !== 1 ? 's' : ''} encontrado{lista.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

// ── Abas ──────────────────────────────────────────────────────────────────────
const ABAS = ['Principal'] as const
type Aba = typeof ABAS[number]

// ── Componente principal ──────────────────────────────────────────────────────

export default function CentroCustoFormPage({ centro }: Props) {
  const router  = useRouter()
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [excluding, setExcluding] = useState(false)
  const [aba,       setAba]       = useState<Aba>('Principal')
  const [modalPai,  setModalPai]  = useState(false)
  const [paiCodigo, setPaiCodigo] = useState(centro?.pai_id ? '' : '')
  const [paiDesc,   setPaiDesc]   = useState(centro?.pai_desc ?? '')

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CentroCustoInput>({
    resolver: zodResolver(centroCustoSchema),
    defaultValues: { tipo: 'A', ativo: true },
  })

  const tipoWatched = watch('tipo')

  useEffect(() => {
    if (!centro) return
    setPaiDesc(centro.pai_desc ?? '')
    reset({
      codigo:    centro.codigo,
      descricao: centro.descricao,
      pai_id:    centro.pai_id ?? undefined,
      tipo:      centro.tipo,
      ativo:     centro.ativo,
    })
    // Carrega o código do pai se houver
    if (centro.pai_id) {
      fetch(`/api/cadastro/centros-custo/${centro.pai_id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setPaiCodigo(d.codigo ?? ''))
    }
  }, [centro, reset])

  function selecionarPai(cc: CentroCustoListItem) {
    setValue('pai_id', cc.id, { shouldValidate: true })
    setPaiCodigo(cc.codigo)
    setPaiDesc(cc.descricao)
    setModalPai(false)
  }

  function limparPai() {
    setValue('pai_id', undefined)
    setPaiCodigo('')
    setPaiDesc('')
  }

  async function onSubmit(data: CentroCustoInput) {
    setSaving(true)
    try {
      const url    = centro ? `/api/cadastro/centros-custo/${centro.id}` : '/api/cadastro/centros-custo'
      const method = centro ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(centro ? 'Centro de custo atualizado!' : 'Centro de custo cadastrado!')
      if (!centro) router.push(`/cadastro/centros-custo/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function desativar() {
    if (!centro || !confirm(`Desativar "${centro.descricao}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/cadastro/centros-custo/${centro.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: false }),
      })
      toast.success('Centro de custo desativado')
      router.push('/cadastro/centros-custo')
    } finally { setDeleting(false) }
  }

  async function excluir() {
    if (!centro || !confirm(`Excluir permanentemente "${centro.descricao}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluding(true)
    try {
      const res = await fetch(`/api/cadastro/centros-custo/${centro.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir — verifique se não há vínculos'); return }
      toast.success('Centro de custo excluído')
      router.push('/cadastro/centros-custo')
    } finally { setExcluding(false) }
  }

  return (
    <>
      {modalPai && (
        <CentroCustoPickerModal
          onSelect={selecionarPai}
          onClose={() => setModalPai(false)}
          excludeId={centro?.id}
        />
      )}

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── Barra de ferramentas ─────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px',
          backgroundColor: 'var(--bg-card)',
          borderBottom: '1px solid var(--borda-media)',
          position: 'sticky', top: 0, zIndex: 20,
        }}>
          <button type="button" onClick={() => router.push('/cadastro/centros-custo')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
              fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            <ArrowLeft size={13} /> Voltar
          </button>

          <div style={{ width: 1, height: 18, backgroundColor: 'var(--borda-media)', margin: '0 4px' }} />

          <button type="button" onClick={() => router.push('/cadastro/centros-custo/novo')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
              fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            <Plus size={13} /> Novo
          </button>

          <button type="submit" disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px',
              background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3,
              fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
              opacity: saving ? 0.7 : 1 }}>
            <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>

          {centro && (
            <button type="button" onClick={desativar} disabled={deleting}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3,
                fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)' }}>
              <Trash2 size={13} /> Desativar
            </button>
          )}

          {centro && (
            <button type="button" onClick={excluir} disabled={excluding}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                background: 'var(--cor-erro)', color: '#fff', border: 'none', borderRadius: 3,
                fontSize: 12, cursor: excluding ? 'not-allowed' : 'pointer',
                opacity: excluding ? 0.7 : 1 }}>
              <X size={13} /> {excluding ? 'Excluindo...' : 'Excluir'}
            </button>
          )}

          {centro && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--texto-terciario)' }}>
              #{centro.id} — {centro.ativo ? 'Ativo' : 'Inativo'}
            </span>
          )}
        </div>

        {/* ── Abas ────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 0,
          backgroundColor: 'var(--bg-page)',
          borderBottom: '1px solid var(--borda-media)',
          paddingLeft: 12, overflowX: 'auto',
        }}>
          {ABAS.map(t => {
            const ativa = aba === t
            return (
              <button key={t} type="button" onClick={() => setAba(t)}
                style={{
                  padding: '7px 14px', fontSize: 12,
                  fontWeight: ativa ? 600 : 400,
                  color: ativa ? 'var(--cor-primaria)' : 'var(--texto-secundario)',
                  background: ativa ? 'var(--bg-card)' : 'none',
                  border: 'none',
                  borderBottom: ativa ? '2px solid var(--cor-primaria)' : '2px solid transparent',
                  borderRight: '1px solid var(--borda-suave)',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                {t}
              </button>
            )
          })}
        </div>

        {/* ── Corpo ────────────────────────────────────────────── */}
        <div style={{ padding: '14px 20px', display: 'flex', gap: 16, overflowY: 'auto', flex: 1 }}>

          {/* Coluna esquerda — campos principais */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>

            {/* Linha 1: Código | Tipo (Analítico/Sintético toggle) */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>Código:</Label>
              <input
                readOnly
                value={centro?.id ?? ''}
                style={{ width: 60, padding: '3px 6px', backgroundColor: 'var(--bg-page)',
                  color: 'var(--texto-terciario)', border: '1px solid var(--borda-suave)',
                  borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)' }}
              />
              <Label style={{ marginLeft: 8 }}>Número:</Label>
              <Input
                {...register('codigo')}
                style={{ width: 140, fontFamily: 'var(--fonte-mono)',
                  border: errors.codigo ? '1px solid var(--cor-erro)' : undefined }}
                placeholder="1.01.001"
              />
              {errors.codigo && (
                <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.codigo.message}</span>
              )}
              {/* Toggle Analítico/Sintético */}
              <button
                type="button"
                onClick={() => setValue('tipo', tipoWatched === 'S' ? 'A' : 'S')}
                style={{
                  marginLeft: 8, padding: '3px 12px',
                  border: '1px solid var(--borda-media)', borderRadius: 3,
                  fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: tipoWatched === 'S' ? 'var(--cor-primaria)' : 'var(--bg-input)',
                  color: tipoWatched === 'S' ? '#fff' : 'var(--texto-secundario)',
                  fontWeight: tipoWatched === 'S' ? 600 : 400,
                }}>
                {tipoWatched === 'S' ? 'Sintético' : 'Analítico'}
              </button>
            </div>

            {/* Linha 2: Descrição */}
            <Row label="Descrição:">
              <Input
                {...register('descricao')}
                style={{ border: errors.descricao ? '1px solid var(--cor-erro)' : undefined }}
              />
              {errors.descricao && (
                <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.descricao.message}</span>
              )}
            </Row>

            {/* Linha 3: C.C. Sintético (pai) */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>C.C. Sintético:</Label>
              {/* Código do pai (read-only) */}
              <input
                readOnly
                value={paiCodigo}
                placeholder="—"
                style={{ width: 90, padding: '3px 6px',
                  backgroundColor: 'var(--bg-page)', color: 'var(--texto-principal)',
                  border: '1px solid var(--borda-suave)', borderRadius: 3,
                  fontSize: 12, fontFamily: 'var(--fonte-mono)' }}
              />
              {/* Descrição do pai (read-only) */}
              <input
                readOnly
                value={paiDesc}
                placeholder="Clique na lupa para selecionar"
                style={{ flex: 1, padding: '3px 6px',
                  backgroundColor: 'var(--bg-page)', color: 'var(--texto-secundario)',
                  border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12 }}
              />
              {/* Botão lupa */}
              <button
                type="button"
                onClick={() => setModalPai(true)}
                title="Pesquisar C.C. Sintético"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, flexShrink: 0,
                  background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
                  cursor: 'pointer', color: 'var(--texto-secundario)' }}>
                <Search size={12} />
              </button>
              {/* Botão limpar */}
              {(paiCodigo || paiDesc) && (
                <button
                  type="button"
                  onClick={limparPai}
                  title="Limpar C.C. Sintético"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, flexShrink: 0,
                    background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
                    cursor: 'pointer', color: 'var(--texto-terciario)' }}>
                  <X size={12} />
                </button>
              )}
            </div>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

            {/* Ativo */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>Ativo:</Label>
              <select
                value={watch('ativo') ? 'true' : 'false'}
                onChange={e => setValue('ativo', e.target.value === 'true')}
                style={{ width: 80, padding: '3px 6px',
                  backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                  border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12 }}>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>

          </div>

          {/* Coluna direita — Tipo */}
          <div style={{ width: 180, flexShrink: 0 }}>
            <fieldset style={{ border: '1px solid var(--borda-media)', borderRadius: 4, padding: '8px 12px' }}>
              <legend style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)',
                padding: '0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Tipo
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                {[
                  { v: 'A' as const, l: 'Analítico', desc: 'Aceita lançamentos' },
                  { v: 'S' as const, l: 'Sintético', desc: 'Agrupador' },
                ].map(({ v, l, desc }) => (
                  <label key={v} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      checked={tipoWatched === v}
                      onChange={() => setValue('tipo', v)}
                      style={{ marginTop: 2, cursor: 'pointer' }}
                    />
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--texto-principal)', fontWeight: tipoWatched === v ? 600 : 400 }}>{l}</div>
                      <div style={{ fontSize: 10, color: 'var(--texto-terciario)' }}>{desc}</div>
                    </div>
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
