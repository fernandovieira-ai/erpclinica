'use client'

import { forwardRef, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Plus, X } from 'lucide-react'
import { tipoCobrancaSchema, tipoCobrancaUpdateSchema, type TipoCobrancaInput, type TipoCobrancaUpdateInput } from '@/lib/validators/forma-pagamento.schema'
import type { TipoCobranca } from '@/types/cadastros.types'

interface Props { forma?: TipoCobranca }

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

// ── Componente principal ──────────────────────────────────────────────────────

export default function FormaPagamentoFormPage({ forma }: Props) {
  const router = useRouter()
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [excluding, setExcluding] = useState(false)

  // Quando editando, usa schema sem cod_tipo_cobranca; quando novo, usa schema completo
  const isEdit = !!forma

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<TipoCobrancaInput>({
    resolver: zodResolver(isEdit ? (tipoCobrancaUpdateSchema as typeof tipoCobrancaSchema) : tipoCobrancaSchema),
    defaultValues: { ind_status: 'A' },
  })

  useEffect(() => {
    if (!forma) return
    reset({
      cod_tipo_cobranca: forma.cod_tipo_cobranca,
      des_tipo_cobranca: forma.des_tipo_cobranca,
      ind_status:        forma.ind_status,
    })
  }, [forma, reset])

  async function onSubmit(data: TipoCobrancaInput) {
    setSaving(true)
    try {
      const url    = forma ? `/api/cadastro/formas-pagamento/${forma.cod_tipo_cobranca}` : '/api/cadastro/formas-pagamento'
      const method = forma ? 'PATCH' : 'POST'
      // No PATCH, não envia cod_tipo_cobranca (é a PK imutável)
      const body = forma
        ? { des_tipo_cobranca: data.des_tipo_cobranca, ind_status: data.ind_status } as TipoCobrancaUpdateInput
        : data
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(forma ? 'Tipo de cobrança atualizado!' : 'Tipo de cobrança cadastrado!')
      if (!forma) router.push(`/cadastro/formas-pagamento/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function desativar() {
    if (!forma || !confirm(`Desativar "${forma.des_tipo_cobranca}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/cadastro/formas-pagamento/${forma.cod_tipo_cobranca}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ind_status: 'I' }),
      })
      toast.success('Tipo de cobrança desativado')
      router.push('/cadastro/formas-pagamento')
    } finally { setDeleting(false) }
  }

  async function excluir() {
    if (!forma || !confirm(`Excluir permanentemente "${forma.des_tipo_cobranca}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluding(true)
    try {
      const res = await fetch(`/api/cadastro/formas-pagamento/${forma.cod_tipo_cobranca}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir — verifique se não há vínculos'); return }
      toast.success('Tipo de cobrança excluído')
      router.push('/cadastro/formas-pagamento')
    } finally { setExcluding(false) }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--borda-media)', position: 'sticky', top: 0, zIndex: 20 }}>
        <button type="button" onClick={() => router.push('/cadastro/formas-pagamento')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <ArrowLeft size={13} /> Voltar
        </button>
        <div style={{ width: 1, height: 18, backgroundColor: 'var(--borda-media)', margin: '0 4px' }} />
        <button type="button" onClick={() => router.push('/cadastro/formas-pagamento/novo')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <Plus size={13} /> Novo
        </button>
        <button type="submit" disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px', background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
          <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {forma && (
          <button type="button" onClick={desativar} disabled={deleting}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)' }}>
            <Trash2 size={13} /> Desativar
          </button>
        )}
        {forma && (
          <button type="button" onClick={excluir} disabled={excluding}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--cor-erro)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: excluding ? 'not-allowed' : 'pointer', opacity: excluding ? 0.7 : 1 }}>
            <X size={13} /> {excluding ? 'Excluindo...' : 'Excluir'}
          </button>
        )}
        {forma && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--texto-terciario)' }}>Cód. {forma.cod_tipo_cobranca} — {forma.ind_status === 'A' ? 'Ativo' : 'Inativo'}</span>}
      </div>

      {/* ── Aba ── */}
      <div style={{ display: 'flex', backgroundColor: 'var(--bg-page)', borderBottom: '1px solid var(--borda-media)', paddingLeft: 12 }}>
        <button type="button" style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, color: 'var(--cor-primaria)', background: 'var(--bg-card)', border: 'none', borderBottom: '2px solid var(--cor-primaria)', borderRight: '1px solid var(--borda-suave)', cursor: 'default' }}>
          Principal
        </button>
      </div>

      {/* ── Corpo ── */}
      <div style={{ padding: '14px 20px', display: 'flex', gap: 16, overflowY: 'auto', flex: 1 }}>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Código */}
          <Row label="Código:">
            {isEdit ? (
              <input readOnly value={forma?.cod_tipo_cobranca ?? ''}
                style={{ width: 80, padding: '3px 6px', backgroundColor: 'var(--bg-page)', color: 'var(--texto-terciario)', border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)' }} />
            ) : (
              <>
                <input type="number" min={1} {...register('cod_tipo_cobranca', { valueAsNumber: true })}
                  style={{ width: 80, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: errors.cod_tipo_cobranca ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)', outline: 'none', textAlign: 'center' }} />
                {errors.cod_tipo_cobranca && <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{errors.cod_tipo_cobranca.message}</span>}
              </>
            )}
          </Row>

          {/* Descrição */}
          <Row label="Descrição:">
            <Input {...register('des_tipo_cobranca')} style={{ border: errors.des_tipo_cobranca ? '1px solid var(--cor-erro)' : undefined }} />
            {errors.des_tipo_cobranca && <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.des_tipo_cobranca.message}</span>}
          </Row>

          <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

          {/* Status */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Label style={{ width: 130, textAlign: 'right', paddingRight: 2 }}>Status:</Label>
            <select value={watch('ind_status') ?? 'A'} onChange={e => setValue('ind_status', e.target.value as 'A' | 'I')}
              style={{ width: 120, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12 }}>
              <option value="A">A — Ativo</option>
              <option value="I">I — Inativo</option>
            </select>
          </div>

        </div>

      </div>
    </form>
  )
}

