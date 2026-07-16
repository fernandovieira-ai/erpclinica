'use client'

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Plus, Search, X, ClipboardList } from 'lucide-react'
import { contaBancoSchema, type ContaBancoInput } from '@/lib/validators/conta-banco.schema'
import type { ContaBanco, Banco } from '@/types/cadastros.types'
import MoneyInput from '@/components/ui/MoneyInput'

interface Props { conta?: ContaBanco }

// ── Primitivos de UI ──────────────────────────────────────────────────────────

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, onBlur, onFocus, onChange, type, ...props }, ref) {
    const isText = type !== 'email' && type !== 'number' && type !== 'date' && type !== 'tel'
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
      <select
        ref={ref}
        {...props}
        style={{
          width: '100%', padding: '3px 6px',
          backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
          border: '1px solid var(--borda-media)', borderRadius: 3,
          fontSize: 12,
          ...style,
        }}
      />
    )
  },
)

function Row({ label, labelWidth = 120, children }: { label: string; labelWidth?: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${labelWidth}px 1fr`, alignItems: 'center', gap: '2px 6px', minHeight: 24 }}>
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

// ── Modal de pesquisa de banco FEBRABAN ───────────────────────────────────────

function BancoPickerModal({ onSelect, onClose }: {
  onSelect: (banco: Banco) => void
  onClose:  () => void
}) {
  const [busca,    setBusca]   = useState('')
  const [lista,    setLista]   = useState<Banco[]>([])
  const [loading,  setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pesquisar = useCallback(async (termo: string) => {
    setLoading(true)
    try {
      const sp  = new URLSearchParams({ ativo: 'true' })
      if (termo.trim()) sp.set('busca', termo.trim())
      const res = await fetch(`/api/cadastro/bancos?${sp}`)
      if (res.ok) setLista(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  // Carrega lista inicial ao abrir
  useEffect(() => {
    pesquisar('')
    inputRef.current?.focus()
  }, [pesquisar])

  // Debounce na busca
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
        position: 'relative',
        width: 560, maxHeight: '80vh',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--borda-media)',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--borda-media)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)' }}>
            Pesquisar Banco FEBRABAN
          </span>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-secundario)', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {/* Campo de busca */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--borda-suave)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--texto-terciario)', pointerEvents: 'none',
            }} />
            <input
              ref={inputRef}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Pesquisar por código ou nome..."
              style={{
                width: '100%', padding: '5px 8px 5px 28px',
                backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                border: '1px solid var(--borda-media)', borderRadius: 3,
                fontSize: 12, outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--borda-media)' }}
            />
          </div>
        </div>

        {/* Lista de resultados */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>
              Carregando...
            </div>
          )}
          {!loading && lista.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>
              Nenhum banco encontrado
            </div>
          )}
          {!loading && lista.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelect(b)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '8px 16px',
                background: 'none', border: 'none', borderBottom: '1px solid var(--borda-suave)',
                cursor: 'pointer', textAlign: 'left',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-input)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
            >
              <span style={{
                width: 48, flexShrink: 0, textAlign: 'center',
                fontFamily: 'var(--fonte-mono)', fontSize: 12, fontWeight: 600,
                color: 'var(--cor-primaria)',
                backgroundColor: 'var(--bg-page)',
                border: '1px solid var(--borda-suave)',
                borderRadius: 3, padding: '2px 4px',
              }}>
                {b.codigo_compensacao}
              </span>
              <span style={{ fontSize: 12, color: 'var(--texto-principal)' }}>{b.nome}</span>
              {b.nome_curto && (
                <span style={{ fontSize: 11, color: 'var(--texto-terciario)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                  {b.nome_curto}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--borda-suave)',
          fontSize: 11, color: 'var(--texto-terciario)',
        }}>
          {lista.length} banco{lista.length !== 1 ? 's' : ''} encontrado{lista.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

// ── Abas ─────────────────────────────────────────────────────────────────────
const ABAS = ['Principal'] as const
type Aba = typeof ABAS[number]

// ── Componente principal ──────────────────────────────────────────────────────

export default function ContaBancoFormPage({ conta }: Props) {
  const router  = useRouter()
  const [saving,       setSaving]      = useState(false)
  const [deleting,     setDeleting]    = useState(false)
  const [excluding,    setExcluding]   = useState(false)
  const [aba,          setAba]         = useState<Aba>('Principal')
  const [modalBanco,   setModalBanco]  = useState(false)
  const [bancoCodigo,  setBancoCodigo] = useState(conta?.banco_codigo ?? '')
  const [bancoNome,    setBancoNome]   = useState(conta?.banco_nome ?? '')

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<ContaBancoInput>({
    resolver: zodResolver(contaBancoSchema),
    defaultValues: {
      tipo:          'C',
      saldo_inicial: 0,
      limite:        0,
      ativo:         true,
    },
  })

  useEffect(() => {
    if (!conta) return
    setBancoCodigo(conta.banco_codigo ?? '')
    setBancoNome(conta.banco_nome ?? '')
    reset({
      banco_id:      conta.banco_id,
      mnemonico:     conta.mnemonico,
      agencia:       conta.agencia,
      agencia_dv:    conta.agencia_dv ?? '',
      conta:         conta.conta,
      conta_dv:      conta.conta_dv ?? '',
      tipo:          conta.tipo,
      nome_gerente:  conta.nome_gerente ?? '',
      telefone:      conta.telefone ?? '',
      saldo_inicial: parseFloat(conta.saldo_inicial) || 0,
      num_convenio:  conta.num_convenio ?? '',
      limite:        parseFloat(conta.limite) || 0,
      ativo:         conta.ativo,
    })
  }, [conta, reset])

  function selecionarBanco(banco: Banco) {
    setValue('banco_id', banco.id, { shouldValidate: true })
    setBancoCodigo(banco.codigo_compensacao)
    setBancoNome(banco.nome)
    setModalBanco(false)
  }

  async function onSubmit(data: ContaBancoInput) {
    setSaving(true)
    try {
      const url    = conta ? `/api/cadastro/contas-banco/${conta.id}` : '/api/cadastro/contas-banco'
      const method = conta ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(conta ? 'Conta bancária atualizada!' : 'Conta bancária cadastrada!')
      if (!conta) router.push(`/cadastro/contas-banco/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function desativar() {
    if (!conta || !confirm(`Desativar a conta "${conta.mnemonico}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/cadastro/contas-banco/${conta.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: false }),
      })
      toast.success('Conta desativada')
      router.push('/cadastro/contas-banco')
    } finally { setDeleting(false) }
  }

  async function excluir() {
    if (!conta || !confirm(`Excluir permanentemente a conta "${conta.mnemonico}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluding(true)
    try {
      const res = await fetch(`/api/cadastro/contas-banco/${conta.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir — verifique se não há vínculos'); return }
      toast.success('Conta excluída')
      router.push('/cadastro/contas-banco')
    } finally { setExcluding(false) }
  }

  return (
    <>
      {modalBanco && (
        <BancoPickerModal
          onSelect={selecionarBanco}
          onClose={() => setModalBanco(false)}
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
          <button type="button" onClick={() => router.push('/cadastro/contas-banco')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
              fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            <ArrowLeft size={13} /> Voltar
          </button>

          <div style={{ width: 1, height: 18, backgroundColor: 'var(--borda-media)', margin: '0 4px' }} />

          <button type="button" onClick={() => router.push('/cadastro/contas-banco/novo')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
              fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            <Plus size={13} /> Nova Conta
          </button>

          <button type="submit" disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px',
              background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3,
              fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
              opacity: saving ? 0.7 : 1 }}>
            <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>

          {conta && (
            <button type="button" onClick={desativar} disabled={deleting}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3,
                fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)' }}>
              <Trash2 size={13} /> Desativar
            </button>
          )}

          {conta && (
            <button type="button" onClick={excluir} disabled={excluding}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                background: 'var(--cor-erro)', color: '#fff', border: 'none', borderRadius: 3,
                fontSize: 12, cursor: excluding ? 'not-allowed' : 'pointer',
                opacity: excluding ? 0.7 : 1 }}>
              <X size={13} /> {excluding ? 'Excluindo...' : 'Excluir'}
            </button>
          )}

          {conta && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--texto-terciario)' }}>
              #{conta.id} — {conta.ativo ? 'Ativa' : 'Inativa'}
            </span>
          )}
        </div>

        {/* ── Abas ────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 0,
          backgroundColor: 'var(--bg-page)',
          borderBottom: '1px solid var(--borda-media)',
          paddingLeft: 12,
          overflowX: 'auto',
        }}>
          {ABAS.map(t => {
            const ativa = aba === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setAba(t)}
                style={{
                  padding: '7px 14px',
                  fontSize: 12,
                  fontWeight: ativa ? 600 : 400,
                  color: ativa ? 'var(--cor-primaria)' : 'var(--texto-secundario)',
                  background: ativa ? 'var(--bg-card)' : 'none',
                  border: 'none',
                  borderBottom: ativa ? '2px solid var(--cor-primaria)' : '2px solid transparent',
                  borderRight: '1px solid var(--borda-suave)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {t}
              </button>
            )
          })}
        </div>

        {/* ── Corpo ────────────────────────────────────────────── */}
        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', flex: 1 }}>

          {aba === 'Principal' && (
            <fieldset className="form-fieldset">
              <legend>
                <ClipboardList size={12} /> Dados Gerais
              </legend>
              <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>

              {/* Linha 1: Código | Mnemônico */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>Código:</Label>
                <input
                  readOnly
                  value={conta?.id ?? ''}
                  style={{ width: 70, padding: '3px 6px', backgroundColor: 'var(--bg-page)',
                    color: 'var(--texto-terciario)', border: '1px solid var(--borda-suave)',
                    borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)' }}
                />
                <Label style={{ marginLeft: 8 }}>Mnemônico:</Label>
                <Input
                  {...register('mnemonico')}
                  style={{ width: 100, fontFamily: 'var(--fonte-mono)',
                    border: errors.mnemonico ? '1px solid var(--cor-erro)' : undefined }}
                  placeholder="BB"
                />
                {errors.mnemonico && (
                  <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.mnemonico.message}</span>
                )}
              </div>

              {/* Linha 2: Banco na FEBRABAN */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>Banco na FEBRABAN:</Label>
                {/* Código (read-only, preenchido pelo modal) */}
                <input
                  readOnly
                  value={bancoCodigo}
                  placeholder="—"
                  style={{ width: 60, padding: '3px 6px',
                    backgroundColor: 'var(--bg-page)', color: 'var(--texto-principal)',
                    border: errors.banco_id ? '1px solid var(--cor-erro)' : '1px solid var(--borda-suave)',
                    borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)', outline: 'none',
                    textAlign: 'center' }}
                />
                {/* Nome do banco (read-only) */}
                <input
                  readOnly
                  value={bancoNome}
                  placeholder="Clique na lupa para selecionar o banco"
                  style={{ flex: 1, padding: '3px 6px',
                    backgroundColor: 'var(--bg-page)', color: 'var(--texto-secundario)',
                    border: errors.banco_id ? '1px solid var(--cor-erro)' : '1px solid var(--borda-suave)',
                    borderRadius: 3, fontSize: 12 }}
                />
                {/* Botão lupa */}
                <button
                  type="button"
                  onClick={() => setModalBanco(true)}
                  title="Pesquisar banco FEBRABAN"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, flexShrink: 0,
                    background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
                    cursor: 'pointer', color: 'var(--texto-secundario)',
                  }}>
                  <Search size={12} />
                </button>
                {errors.banco_id && (
                  <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.banco_id.message}</span>
                )}
              </div>

              <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

              {/* Linha 3: Agência | Conta | Telefone */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>Agência:</Label>
                <Input {...register('agencia')} style={{ width: 90, fontFamily: 'var(--fonte-mono)' }} placeholder="0000" />
                <Label>-</Label>
                <Input {...register('agencia_dv')} style={{ width: 36, fontFamily: 'var(--fonte-mono)' }} placeholder="DV" />
                <Label style={{ marginLeft: 8 }}>Conta:</Label>
                <Input {...register('conta')} style={{ width: 120, fontFamily: 'var(--fonte-mono)' }} placeholder="00000-0" />
                <Label>-</Label>
                <Input {...register('conta_dv')} style={{ width: 36, fontFamily: 'var(--fonte-mono)' }} placeholder="DV" />
                <Label style={{ marginLeft: 8 }}>Telefone:</Label>
                <Input {...register('telefone')} type="tel" style={{ width: 140, fontFamily: 'var(--fonte-mono)' }} placeholder="(  )      -    " />
              </div>

              {/* Linha 4: Gerente */}
              <Row label="Gerente:">
                <Input {...register('nome_gerente')} />
              </Row>

              <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

              {/* Linha 5: Saldo Abertura | Val. Limite Conta | Nº Convênio */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>Saldo Abertura:</Label>
                <MoneyInput value={watch('saldo_inicial')} onValue={n => setValue('saldo_inicial', n)} style={{ width: 120 }} />
                <Label style={{ marginLeft: 8 }}>Val. Limite Conta:</Label>
                <MoneyInput value={watch('limite')} onValue={n => setValue('limite', n)} style={{ width: 120 }} />
                <Label style={{ marginLeft: 8 }}>Nº Convênio:</Label>
                <Input {...register('num_convenio')} style={{ width: 140, fontFamily: 'var(--fonte-mono)' }} />
              </div>

              <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

              {/* Linha 6: Tipo de Conta | Ativo */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>Tipo de Conta:</Label>
                <Select {...register('tipo')} style={{ width: 160 }}>
                  <option value="C">Conta Corrente</option>
                  <option value="P">Conta Poupança</option>
                </Select>
                <Label style={{ marginLeft: 8 }}>Ativo:</Label>
                <Select
                  value={watch('ativo') ? 'true' : 'false'}
                  onChange={e => setValue('ativo', e.target.value === 'true')}
                  style={{ width: 80 }}
                >
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </Select>
              </div>

              {/* Saldo Atual — somente leitura em edição */}
              {conta && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  <Label style={{ width: 120, textAlign: 'right', paddingRight: 2 }}>Saldo Atual:</Label>
                  <input
                    readOnly
                    value={parseFloat(conta.saldo_atual).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    style={{ width: 140, padding: '3px 6px', backgroundColor: 'var(--bg-page)',
                      color: 'var(--texto-terciario)', border: '1px solid var(--borda-suave)',
                      borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)', textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>calculado automaticamente</span>
                </div>
              )}
              </div>
            </fieldset>
          )}
        </div>
      </form>
    </>
  )
}
