'use client'

import { forwardRef, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Plus, X, ClipboardList, Banknote } from 'lucide-react'
import { agendamentoTipoSchema, type AgendamentoTipoInput } from '@/lib/validators/agendamento.schema'
import type { TipoAtendimentoListItem, TipoCategoriaValorItem } from '@/types/clinica.types'

type Aba = 'principal' | 'categorias'

interface Props { tipo?: TipoAtendimentoListItem }

const CORES_SUGERIDAS = [
  '#0EA5E9', '#10B981', '#F59E0B', '#EF4444',
  '#6366F1', '#EC4899', '#14B8A6', '#8B5CF6',
  '#F97316', '#06B6D4', '#84CC16', '#6B7280',
]

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, onBlur, onFocus, onChange, type, ...props }, ref) {
    const isText = type !== 'number' && type !== 'color'
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
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '2px 6px', minHeight: 24 }}>
      <label style={{ textAlign: 'right', fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', paddingRight: 2 }}>{label}</label>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{children}</div>
    </div>
  )
}

export default function TipoAtendimentoFormPage({ tipo }: Props) {
  const router    = useRouter()
  const [saving,    setSaving]    = useState(false)
  const [deleting,  setDeleting]  = useState(false)
  const [excluding, setExcluding] = useState(false)
  const [aba,       setAba]       = useState<Aba>('principal')
  const [categorias,        setCategorias]        = useState<TipoCategoriaValorItem[]>([])
  const [valoresEdit,       setValoresEdit]       = useState<Record<number, string>>({})
  const [valoresPrazoEdit,  setValoresPrazoEdit]  = useState<Record<number, string>>({})
  const [savingCat,         setSavingCat]         = useState(false)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<AgendamentoTipoInput>({
    resolver: zodResolver(agendamentoTipoSchema),
    defaultValues: { duracao_min: 30, cor: '#0EA5E9', ativo: true },
  })

  const corAtual = watch('cor')

  useEffect(() => {
    if (!tipo) return
    reset({
      descricao:   tipo.descricao,
      duracao_min: tipo.duracao_min,
      cor:         tipo.cor,
      valor:       tipo.valor != null ? parseFloat(String(tipo.valor)) : undefined,
      ativo:       tipo.ativo,
    })
  }, [tipo, reset])

  // Carrega categorias ao entrar na aba
  useEffect(() => {
    if (!tipo || aba !== 'categorias') return
    fetch(`/api/clinica/tipos-agendamento/${tipo.id}/categorias`)
      .then(r => r.json())
      .then((data: TipoCategoriaValorItem[]) => {
        setCategorias(data)
        const vals: Record<number, string> = {}
        const valsPrazo: Record<number, string> = {}
        data.forEach(c => {
          vals[c.categoria_id]      = c.valor       != null ? String(c.valor)       : ''
          valsPrazo[c.categoria_id] = c.valor_prazo != null ? String(c.valor_prazo) : ''
        })
        setValoresEdit(vals)
        setValoresPrazoEdit(valsPrazo)
      })
  }, [tipo, aba])

  async function salvarCategorias() {
    if (!tipo) return
    setSavingCat(true)
    try {
      const valores = categorias.map(c => ({
        categoria_id: c.categoria_id,
        valor:       parseFloat(valoresEdit[c.categoria_id]      || '0') || 0,
        valor_prazo: parseFloat(valoresPrazoEdit[c.categoria_id] || '0') || 0,
      }))
      const res = await fetch(`/api/clinica/tipos-agendamento/${tipo.id}/categorias`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valores }),
      })
      if (!res.ok) { toast.error('Erro ao salvar valores'); return }
      toast.success('Valores por categoria salvos!')
    } finally { setSavingCat(false) }
  }

  async function onSubmit(data: AgendamentoTipoInput) {
    setSaving(true)
    try {
      const url    = tipo ? `/api/clinica/tipos-agendamento/${tipo.id}` : '/api/clinica/tipos-agendamento'
      const method = tipo ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(tipo ? 'Tipo de atendimento atualizado!' : 'Tipo de atendimento cadastrado!')
      if (!tipo) router.push(`/clinica/tipos-atendimento/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function desativar() {
    if (!tipo || !confirm(`Desativar "${tipo.descricao}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/clinica/tipos-agendamento/${tipo.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: false }),
      })
      toast.success('Tipo de atendimento desativado')
      router.push('/clinica/tipos-atendimento')
    } finally { setDeleting(false) }
  }

  async function excluir() {
    if (!tipo || !confirm(`Excluir permanentemente "${tipo.descricao}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluding(true)
    try {
      const res = await fetch(`/api/clinica/tipos-agendamento/${tipo.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir — verifique se não há agendamentos vinculados'); return }
      toast.success('Tipo de atendimento excluído')
      router.push('/clinica/tipos-atendimento')
    } finally { setExcluding(false) }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--borda-media)', position: 'sticky', top: 0, zIndex: 20 }}>
        <button type="button" onClick={() => router.push('/clinica/tipos-atendimento')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <ArrowLeft size={13} /> Voltar
        </button>
        <div style={{ width: 1, height: 18, backgroundColor: 'var(--borda-media)', margin: '0 4px' }} />
        <button type="button" onClick={() => router.push('/clinica/tipos-atendimento/novo')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <Plus size={13} /> Novo
        </button>
        {aba === 'principal' ? (
          <button type="submit" disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px', background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        ) : (
          <button type="button" onClick={salvarCategorias} disabled={savingCat}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px', background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, cursor: savingCat ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: savingCat ? 0.7 : 1 }}>
            <Save size={13} /> {savingCat ? 'Salvando...' : 'Salvar Valores'}
          </button>
        )}
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

      {/* ── Abas ── */}
      <div style={{ display: 'flex', backgroundColor: 'var(--bg-page)', borderBottom: '1px solid var(--borda-media)', paddingLeft: 12 }}>
        {(['principal', ...(tipo ? ['categorias'] : [])] as Aba[]).map(a => {
          const ativa = aba === a
          const label = a === 'principal' ? 'Principal' : 'Valores p/ Categoria'
          return (
            <button key={a} type="button" onClick={() => setAba(a)}
              style={{ padding: '7px 14px', fontSize: 12, fontWeight: ativa ? 600 : 400, color: ativa ? 'var(--cor-primaria)' : 'var(--texto-secundario)', background: ativa ? 'var(--bg-card)' : 'transparent', border: 'none', borderBottom: ativa ? '2px solid var(--cor-primaria)' : '2px solid transparent', borderRight: '1px solid var(--borda-suave)', cursor: ativa ? 'default' : 'pointer' }}>
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Corpo ── */}
      <div style={{ overflowY: 'auto', flex: 1 }}>

        {/* ── Aba Principal ── */}
        {aba === 'principal' && (
          <div style={{ padding: '20px 24px', display: 'flex', gap: 24 }}>

            {/* Coluna principal */}
        <div style={{ flex: 1, maxWidth: 560 }}>
        <fieldset className="form-fieldset">
          <legend>
            <ClipboardList size={12} /> Dados Gerais
          </legend>
          <div className="form-fieldset-body">

          {/* Descrição */}
          <Row label="Descrição:">
            <Input {...register('descricao')}
              style={{ border: errors.descricao ? '1px solid var(--cor-erro)' : undefined }}
              placeholder="Ex: CONSULTA, RETORNO, EXAME..."
            />
            {errors.descricao && <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.descricao.message}</span>}
          </Row>

          {/* Duração */}
          <Row label="Duração (minutos):">
            <input
              type="number"
              min={1}
              max={480}
              {...register('duracao_min', { valueAsNumber: true })}
              style={{ width: 80, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: errors.duracao_min ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, textAlign: 'right' }}
            />
            <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>min</span>
            {errors.duracao_min && <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{errors.duracao_min.message}</span>}
          </Row>

          {/* Valor */}
          <Row label="Valor (R$):">
            <span style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>R$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              {...register('valor', { setValueAs: v => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v) })}
              placeholder="0,00"
              style={{ width: 110, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: errors.valor ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, textAlign: 'right' }}
            />
            {errors.valor && <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{errors.valor.message}</span>}
          </Row>

          <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

          {/* Cor */}
          <Row label="Cor de identificação:">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={corAtual}
                onChange={e => setValue('cor', e.target.value)}
                style={{ width: 36, height: 26, padding: 2, border: '1px solid var(--borda-media)', borderRadius: 3, cursor: 'pointer', backgroundColor: 'var(--bg-input)' }}
              />
              <input
                type="text"
                value={corAtual}
                onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setValue('cor', e.target.value) }}
                style={{ width: 80, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)' }}
              />
            </div>
          </Row>

          {/* Paleta de cores */}
          <Row label="">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CORES_SUGERIDAS.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => setValue('cor', c)}
                  title={c}
                  style={{
                    width: 22, height: 22, borderRadius: 4, cursor: 'pointer',
                    backgroundColor: c,
                    border: corAtual === c ? '2px solid var(--texto-principal)' : '1px solid transparent',
                    outline: corAtual === c ? '1px solid var(--bg-card)' : 'none',
                  }}
                />
              ))}
            </div>
          </Row>

          <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

          {/* Ativo */}
          <Row label="Ativo:">
            <select
              value={watch('ativo') ? 'true' : 'false'}
              onChange={e => setValue('ativo', e.target.value === 'true')}
              style={{ width: 80, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12 }}
            >
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </Row>

          </div>
        </fieldset>
        </div>

        {/* Preview */}
        <div style={{ width: 180, flexShrink: 0 }}>
          <fieldset className="form-fieldset">
            <legend>Prévia</legend>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                padding: '6px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                backgroundColor: `${corAtual}20`,
                color: corAtual,
                borderLeft: `3px solid ${corAtual}`,
              }}>
                {watch('descricao') || 'DESCRIÇÃO'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
                Duração: <strong>{watch('duracao_min') || 30} min</strong>
              </div>
              {watch('valor') != null && (
                <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
                  Valor: <strong>R$ {parseFloat(String(watch('valor'))).toFixed(2).replace('.', ',')}</strong>
                </div>
              )}
            </div>
          </fieldset>
        </div>

          </div>
        )}

        {/* ── Aba Categorias ── */}
        {aba === 'categorias' && (
          <div style={{ padding: '20px 24px', maxWidth: 600 }}>
          <fieldset className="form-fieldset">
            <legend>
              <Banknote size={12} /> Valores por Categoria
            </legend>
            <div className="form-fieldset-body">

            {categorias.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>
                Nenhuma categoria cadastrada. Cadastre categorias em <strong>Clínica → Categorias</strong> primeiro.
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--borda-media)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--texto-secundario)', fontWeight: 600 }}>Categoria</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--texto-secundario)', fontWeight: 600, width: 140 }}>Valor à Vista (R$)</th>
                    <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--texto-secundario)', fontWeight: 600, width: 140 }}>Valor a Prazo (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map(cat => (
                    <tr key={cat.categoria_id} style={{ borderBottom: '1px solid var(--borda-suave)' }}>
                      <td style={{ padding: '5px 8px', color: 'var(--texto-principal)' }}>{cat.descricao}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={valoresEdit[cat.categoria_id] ?? ''}
                          onChange={e => setValoresEdit(prev => ({ ...prev, [cat.categoria_id]: e.target.value }))}
                          placeholder="0,00"
                          style={{ width: 110, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={valoresPrazoEdit[cat.categoria_id] ?? ''}
                          onChange={e => setValoresPrazoEdit(prev => ({ ...prev, [cat.categoria_id]: e.target.value }))}
                          placeholder="0,00"
                          style={{ width: 110, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, textAlign: 'right' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ marginTop: 12, fontSize: 11, color: 'var(--texto-terciario)' }}>
              Deixe em branco ou zero para usar o valor padrão do tipo de atendimento.
            </p>

            </div>
          </fieldset>
          </div>
        )}

      </div>
    </form>
  )
}
