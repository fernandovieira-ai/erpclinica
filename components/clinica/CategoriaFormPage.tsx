'use client'

import { forwardRef, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Plus } from 'lucide-react'
import { categoriaSchema, type CategoriaInput } from '@/lib/validators/agendamento.schema'
import type { CategoriaListItem } from '@/types/clinica.types'

interface Props { categoria?: CategoriaListItem }

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, onBlur, onFocus, onChange, ...props }, ref) {
    return (
      <input ref={ref} {...props}
        style={{ width: '100%', padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none', textTransform: 'uppercase', ...style }}
        onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)'; onFocus?.(e) }}
        onBlur={e  => { e.target.style.borderColor = 'var(--borda-media)';  onBlur?.(e)  }}
        onChange={e => { e.target.value = e.target.value.toUpperCase(); onChange?.(e) }}
      />
    )
  }
)

export default function CategoriaFormPage({ categoria }: Props) {
  const isEdit = !!categoria
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoriaInput>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: { descricao: '', ativo: true },
  })

  useEffect(() => {
    if (categoria) {
      reset({ descricao: categoria.descricao, ativo: categoria.ativo })
    }
  }, [categoria, reset])

  async function onSubmit(data: CategoriaInput) {
    setSaving(true)
    try {
      const url    = isEdit ? `/api/clinica/categorias/${categoria!.id}` : '/api/clinica/categorias'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.erro ?? 'Erro ao salvar')
        return
      }

      toast.success(isEdit ? 'Categoria atualizada!' : 'Categoria criada!')
      router.push('/clinica/categorias')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleAtivo() {
    if (!categoria) return
    const res = await fetch(`/api/clinica/categorias/${categoria.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !categoria.ativo }),
    })
    if (res.ok) {
      toast.success(categoria.ativo ? 'Categoria desativada' : 'Categoria ativada')
      router.push('/clinica/categorias')
    } else {
      toast.error('Erro ao alterar status')
    }
  }

  async function handleExcluir() {
    if (!categoria) return
    if (!confirm('Excluir esta categoria? Esta ação não pode ser desfeita.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/clinica/categorias/${categoria.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Categoria excluída!')
        router.push('/clinica/categorias')
      } else {
        const err = await res.json()
        toast.error(err.erro ?? 'Erro ao excluir')
      }
    } finally {
      setDeleting(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--texto-terciario)',
    textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4,
  }
  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 560 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => router.push('/clinica/categorias')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 12, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 4, color: 'var(--texto-secundario)', cursor: 'pointer' }}
        >
          <ArrowLeft size={13} /> Voltar
        </button>

        <button
          type="button"
          onClick={() => router.push('/clinica/categorias/novo')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 12, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 4, color: 'var(--texto-secundario)', cursor: 'pointer' }}
        >
          <Plus size={13} /> Novo
        </button>

        <div style={{ flex: 1 }} />

        {isEdit && (
          <>
            <button
              type="button"
              onClick={handleToggleAtivo}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 12, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 4, color: 'var(--texto-secundario)', cursor: 'pointer' }}
            >
              {categoria!.ativo ? 'Desativar' : 'Ativar'}
            </button>

            <button
              type="button"
              onClick={handleExcluir}
              disabled={deleting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 12, background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 4, color: 'var(--cor-erro)', cursor: 'pointer' }}
            >
              <Trash2 size={13} /> Excluir
            </button>
          </>
        )}

        <button
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 16px', fontSize: 12, fontWeight: 600, background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 4, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.8 : 1 }}
        >
          <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--borda-suave)', borderRadius: 6, padding: '20px 20px 24px' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--texto-principal)', marginBottom: 20 }}>
          {isEdit ? 'Editar Categoria' : 'Nova Categoria'}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Descrição *</label>
            <Input
              {...register('descricao')}
              placeholder="Ex: PARTICULAR, UNIMED, BRADESCO SAÚDE..."
              autoFocus
            />
            {errors.descricao && (
              <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{errors.descricao.message}</span>
            )}
          </div>

          {isEdit && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Status</label>
              <select
                {...register('ativo', { setValueAs: v => v === 'true' || v === true })}
                style={{ padding: '3px 6px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, outline: 'none' }}
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
