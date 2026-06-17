'use client'

import { forwardRef, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Plus, X } from 'lucide-react'
import { condicaoPagamentoSchema, type CondicaoPagamentoInput } from '@/lib/validators/condicao-pagamento.schema'
import type { CondicaoPagamento } from '@/types/cadastros.types'

interface Props { condicao?: CondicaoPagamento }

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
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '2px 6px', minHeight: 24 }}>
      <label style={{ textAlign: 'right', fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', paddingRight: 2 }}>{label}</label>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{children}</div>
    </div>
  )
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', ...style }}>{children}</label>
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CondicaoPagamentoFormPage({ condicao }: Props) {
  const router = useRouter()
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [excluding, setExcluding] = useState(false)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CondicaoPagamentoInput>({
    resolver: zodResolver(condicaoPagamentoSchema),
    defaultValues: { tipo: 'V', num_parcelas: 1, intervalo_dias: 30, entrada_pct: 0, ativo: true },
  })

  const tipo = watch('tipo')

  useEffect(() => {
    if (!condicao) return
    reset({
      descricao:      condicao.descricao,
      tipo:           condicao.tipo,
      num_parcelas:   condicao.num_parcelas,
      intervalo_dias: condicao.intervalo_dias,
      entrada_pct:    Number(condicao.entrada_pct),
      ativo:          condicao.ativo,
    })
  }, [condicao, reset])

  useEffect(() => {
    if (tipo === 'V') {
      setValue('num_parcelas', 1)
      setValue('intervalo_dias', 0)
      setValue('entrada_pct', 0)
    } else if (tipo === 'P') {
      setValue('num_parcelas', condicao?.num_parcelas ?? 1)
      setValue('intervalo_dias', condicao?.intervalo_dias ?? 30)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  async function onSubmit(data: CondicaoPagamentoInput) {
    setSaving(true)
    try {
      const url    = condicao ? `/api/cadastro/condicoes-pagamento/${condicao.id}` : '/api/cadastro/condicoes-pagamento'
      const method = condicao ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(condicao ? 'Condição de pagamento atualizada!' : 'Condição de pagamento cadastrada!')
      if (!condicao) router.push(`/cadastro/condicoes-pagamento/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function desativar() {
    if (!condicao || !confirm(`Desativar "${condicao.descricao}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/cadastro/condicoes-pagamento/${condicao.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: false }),
      })
      toast.success('Condição de pagamento desativada')
      router.push('/cadastro/condicoes-pagamento')
    } finally { setDeleting(false) }
  }

  async function excluir() {
    if (!condicao || !confirm(`Excluir permanentemente "${condicao.descricao}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluding(true)
    try {
      const res = await fetch(`/api/cadastro/condicoes-pagamento/${condicao.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir — verifique se não há vínculos'); return }
      toast.success('Condição de pagamento excluída')
      router.push('/cadastro/condicoes-pagamento')
    } finally { setExcluding(false) }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--borda-media)', position: 'sticky', top: 0, zIndex: 20 }}>
        <button type="button" onClick={() => router.push('/cadastro/condicoes-pagamento')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <ArrowLeft size={13} /> Voltar
        </button>
        <div style={{ width: 1, height: 18, backgroundColor: 'var(--borda-media)', margin: '0 4px' }} />
        <button type="button" onClick={() => router.push('/cadastro/condicoes-pagamento/novo')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <Plus size={13} /> Novo
        </button>
        <button type="submit" disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px', background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
          <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {condicao && (
          <button type="button" onClick={desativar} disabled={deleting}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)' }}>
            <Trash2 size={13} /> Desativar
          </button>
        )}
        {condicao && (
          <button type="button" onClick={excluir} disabled={excluding}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'var(--cor-erro)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: excluding ? 'not-allowed' : 'pointer', opacity: excluding ? 0.7 : 1 }}>
            <X size={13} /> {excluding ? 'Excluindo...' : 'Excluir'}
          </button>
        )}
        {condicao && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--texto-terciario)' }}>#{condicao.id} — {condicao.ativo ? 'Ativo' : 'Inativo'}</span>}
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* ID */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Label style={{ width: 140, textAlign: 'right', paddingRight: 2 }}>ID:</Label>
            <input readOnly value={condicao?.id ?? ''}
              style={{ width: 80, padding: '3px 6px', backgroundColor: 'var(--bg-page)', color: 'var(--texto-terciario)', border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)' }} />
          </div>

          {/* Descrição */}
          <Row label="Descrição:">
            <Input {...register('descricao')} style={{ border: errors.descricao ? '1px solid var(--cor-erro)' : undefined }} />
            {errors.descricao && <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.descricao.message}</span>}
          </Row>

          {/* Tipo */}
          <Row label="Tipo:">
            <Select {...register('tipo')} style={{ width: 180 }}>
              <option value="V">À Vista</option>
              <option value="P">A Prazo</option>
            </Select>
          </Row>

          <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

          {/* Campos de parcelamento — visíveis apenas quando tipo = P */}
          {tipo === 'P' && (
            <>
              <Row label="Nº de Parcelas:">
                <input type="number" min={1}
                  {...register('num_parcelas', { valueAsNumber: true })}
                  style={{ width: 100, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: errors.num_parcelas ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }}
                  onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)' }}
                  onBlur={e  => { e.target.style.borderColor = errors.num_parcelas ? 'var(--cor-erro)' : 'var(--borda-media)' }}
                />
                {errors.num_parcelas && <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{errors.num_parcelas.message}</span>}
              </Row>

              <Row label="Intervalo (dias):">
                <input type="number" min={0}
                  {...register('intervalo_dias', { valueAsNumber: true })}
                  style={{ width: 100, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: errors.intervalo_dias ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }}
                  onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)' }}
                  onBlur={e  => { e.target.style.borderColor = errors.intervalo_dias ? 'var(--cor-erro)' : 'var(--borda-media)' }}
                />
                {errors.intervalo_dias && <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{errors.intervalo_dias.message}</span>}
              </Row>

              <Row label="Entrada (%):">
                <input type="number" min={0} max={100} step={0.01}
                  {...register('entrada_pct', { valueAsNumber: true })}
                  style={{ width: 100, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: errors.entrada_pct ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }}
                  onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)' }}
                  onBlur={e  => { e.target.style.borderColor = errors.entrada_pct ? 'var(--cor-erro)' : 'var(--borda-media)' }}
                />
                <span style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>%</span>
                {errors.entrada_pct && <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{errors.entrada_pct.message}</span>}
              </Row>
            </>
          )}

          {tipo === 'V' && (
            <div style={{ padding: '8px 12px', borderRadius: 4, background: 'var(--cor-sucesso)10', border: '1px solid var(--cor-sucesso)30', fontSize: 12, color: 'var(--texto-secundario)' }}>
              Pagamento à vista: 1 parcela sem intervalo.
            </div>
          )}

          <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

          {/* Ativo */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Label style={{ width: 140, textAlign: 'right', paddingRight: 2 }}>Ativo:</Label>
            <select value={watch('ativo') ? 'true' : 'false'} onChange={e => setValue('ativo', e.target.value === 'true')}
              style={{ width: 80, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12 }}>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>

        </div>

        {/* Coluna direita — resumo */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <fieldset style={{ border: '1px solid var(--borda-media)', borderRadius: 4, padding: '8px 14px 12px' }}>
            <legend style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)', padding: '0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resumo</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--texto-terciario)' }}>Tipo:</span>
                <span style={{ fontWeight: 600, color: tipo === 'V' ? 'var(--cor-sucesso)' : 'var(--cor-primaria)' }}>
                  {tipo === 'V' ? 'À Vista' : 'A Prazo'}
                </span>
              </div>
              {tipo === 'P' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--texto-terciario)' }}>Parcelas:</span>
                    <span style={{ fontWeight: 600 }}>{watch('num_parcelas')}x</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--texto-terciario)' }}>Intervalo:</span>
                    <span style={{ fontWeight: 600 }}>{watch('intervalo_dias')} dias</span>
                  </div>
                  {Number(watch('entrada_pct')) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--texto-terciario)' }}>Entrada:</span>
                      <span style={{ fontWeight: 600 }}>{Number(watch('entrada_pct')).toFixed(2)}%</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </fieldset>
        </div>

      </div>
    </form>
  )
}
