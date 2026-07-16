'use client'

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Search, X, CheckCircle, XCircle, ClipboardList, FileText } from 'lucide-react'
import { movimentoCaixaSchema, type MovimentoCaixaInput } from '@/lib/validators/movimento-caixa.schema'
import type { MovimentoCaixa } from '@/types/cadastros.types'
import MoneyInput from '@/components/ui/MoneyInput'

interface Props { movimento?: MovimentoCaixa }

// ── Primitivos ────────────────────────────────────────────────────────────────

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, onBlur, onFocus, ...props }, ref) {
    return (
      <input ref={ref} {...props}
        style={{ width: '100%', padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none', ...style }}
        onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)'; onFocus?.(e) }}
        onBlur={e  => { e.target.style.borderColor = 'var(--borda-media)';  onBlur?.(e)  }}
      />
    )
  },
)

const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ style, ...props }, ref) {
    return <select ref={ref} {...props} style={{ width: '100%', padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none', ...style }} />
  },
)

function Row({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'start', gap: '2px 6px', minHeight: 24 }}>
      <label style={{ textAlign: 'right', fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', paddingRight: 2, paddingTop: 4 }}>{label}</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{children}</div>
        {error && <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{error}</span>}
      </div>
    </div>
  )
}

function Sep() {
  return <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />
}

// ── Modal picker genérico ─────────────────────────────────────────────────────

function PickerModal<T extends { id: number }>({ title, url, renderItem, onSelect, onClose }: {
  title:      string
  url:        string
  renderItem: (item: T) => React.ReactNode
  onSelect:   (item: T) => void
  onClose:    () => void
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
      const res  = await fetch(`${url}?${sp}`)
      const data = res.ok ? await res.json() : { dados: [] }
      setLista(data.dados ?? [])
    } finally { setLoading(false) }
  }, [url])

  useEffect(() => { pesquisar(''); inputRef.current?.focus() }, [pesquisar])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function onBusca(v: string) {
    setBusca(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => pesquisar(v), 300)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda-media)', borderRadius: 6, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--borda-suave)' }}>
          <Search size={14} style={{ color: 'var(--texto-terciario)' }} />
          <input ref={inputRef} value={busca} onChange={e => onBusca(e.target.value)}
            placeholder={`Buscar ${title.toLowerCase()}...`}
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: 'var(--texto-principal)', outline: 'none' }}
          />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', display: 'flex', padding: 2 }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>Carregando...</div>}
          {!loading && lista.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>Nenhum resultado</div>}
          {lista.map(item => (
            <div key={item.id} onClick={() => onSelect(item)}
              style={{ padding: '7px 14px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--borda-suave)', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
            >
              {renderItem(item)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Tipos auxiliares para os pickers ─────────────────────────────────────────

type PessoaItem       = { id: number; nome: string; cpf_cnpj: string | null }
type TipoOperacaoItem = { id: number; descricao: string; tipo: string }

type PickerKey = 'pessoa' | 'tipo_operacao'

const ABAS = ['Dados', 'Complemento'] as const
type Aba = typeof ABAS[number]

// ── Componente principal ──────────────────────────────────────────────────────

export default function MovimentoCaixaFormPage({ movimento }: Props) {
  const router  = useRouter()
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [conciliando, setConciliando] = useState(false)
  const [picker,      setPicker]      = useState<PickerKey | null>(null)
  const [aba,         setAba]         = useState<Aba>('Dados')

  const [nomePessoa,       setNomePessoa]       = useState('')
  const [nomeTipoOperacao, setNomeTipoOperacao] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<MovimentoCaixaInput>({
    resolver: zodResolver(movimentoCaixaSchema),
    defaultValues: {
      tipo:           'S',
      data_movimento: today,
      conciliado:     false,
    },
  })

  useEffect(() => {
    if (!movimento) return
    setValue('tipo_operacao_id', movimento.tipo_operacao_id  ?? undefined)
    setValue('pessoa_id',        movimento.pessoa_id         ?? undefined)
    setValue('tipo',             movimento.tipo)
    setValue('valor',            parseFloat(movimento.valor))
    setValue('data_movimento',   movimento.data_movimento)
    setValue('documento',        movimento.documento         ?? '')
    setValue('observacao',       movimento.observacao        ?? '')
    setValue('conciliado',       movimento.conciliado)
    setValue('data_conciliacao', movimento.data_conciliacao  ?? '')
    setNomePessoa(movimento.pessoa_nome            ?? '')
    setNomeTipoOperacao(movimento.tipo_operacao_desc ?? '')
  }, [movimento, setValue])

  async function onSubmit(data: MovimentoCaixaInput) {
    setSaving(true)
    try {
      const url    = movimento ? `/api/financeiro/movimento-caixa/${movimento.id}` : '/api/financeiro/movimento-caixa'
      const method = movimento ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(movimento ? 'Movimento atualizado!' : 'Movimento cadastrado!')
      if (!movimento) router.push(`/financeiro/movimento-caixa/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function conciliar() {
    if (!movimento) return
    setConciliando(true)
    try {
      const novoConciliado = !movimento.conciliado
      const res = await fetch(`/api/financeiro/movimento-caixa/${movimento.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conciliado: novoConciliado }),
      })
      if (!res.ok) { toast.error('Erro ao atualizar conciliação'); return }
      toast.success(novoConciliado ? 'Movimento conciliado!' : 'Conciliação desfeita!')
      router.refresh()
    } finally { setConciliando(false) }
  }

  async function excluir() {
    if (!movimento || !confirm('Excluir este movimento de caixa?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/financeiro/movimento-caixa/${movimento.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir'); return }
      toast.success('Movimento excluído!')
      router.push('/financeiro/movimento-caixa')
    } finally { setDeleting(false) }
  }

  function LookupField({ label, nome, onOpen, onClear, error, disabled }: {
    label:     string
    nome:      string
    onOpen:    () => void
    onClear:   () => void
    error?:    string
    disabled?: boolean
  }) {
    return (
      <Row label={label} error={error}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input readOnly value={nome} onClick={disabled ? undefined : onOpen}
            placeholder={disabled ? '' : 'Clique para selecionar...'}
            style={{ flex: 1, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: nome ? 'var(--texto-principal)' : 'var(--texto-terciario)', border: error ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: disabled ? 'default' : 'pointer', outline: 'none', opacity: disabled ? 0.65 : 1 }}
          />
          {!disabled && <button type="button" onClick={onOpen} style={{ padding: '2px 6px', border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Search size={12} /></button>}
          {!disabled && nome && <button type="button" onClick={onClear} style={{ padding: '2px 4px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--texto-terciario)' }}><X size={12} /></button>}
        </div>
      </Row>
    )
  }

  const isConciliado = movimento?.conciliado ?? false

  return (
    <>
      {/* ── Picker modals ── */}
      {picker === 'pessoa' && (
        <PickerModal<PessoaItem>
          title="Pessoa"
          url="/api/cadastro/pessoas"
          renderItem={p => <><strong>{p.nome}</strong>{p.cpf_cnpj ? <span style={{ marginLeft: 8, color: 'var(--texto-terciario)' }}>{p.cpf_cnpj}</span> : null}</>}
          onSelect={p => { setValue('pessoa_id', p.id); setNomePessoa(p.nome); setPicker(null) }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'tipo_operacao' && (
        <PickerModal<TipoOperacaoItem>
          title="Tipo de Operação"
          url="/api/cadastro/tipos-operacao-caixa"
          renderItem={t => <><strong>{t.descricao}</strong><span style={{ marginLeft: 8, color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)' }}>{t.tipo === 'E' ? 'Entrada' : 'Saída'}</span></>}
          onSelect={t => { setValue('tipo_operacao_id', t.id); setNomeTipoOperacao(t.descricao); setPicker(null) }}
          onClose={() => setPicker(null)}
        />
      )}

      {/* ── Formulário ── */}
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--borda-suave)', flexShrink: 0 }}>
          <button type="button" onClick={() => router.push('/financeiro/movimento-caixa')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            <ArrowLeft size={13} /> Voltar
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)', marginLeft: 4 }}>
            {movimento ? `Movimento de Caixa #${movimento.id}` : 'Novo Movimento de Caixa'}
          </span>
          {movimento && (
            <span style={{ fontSize: 11, fontWeight: 600, color: isConciliado ? 'var(--cor-sucesso)' : 'var(--cor-aviso)', border: `1px solid ${isConciliado ? 'var(--cor-sucesso)' : 'var(--cor-aviso)'}`, borderRadius: 3, padding: '2px 7px' }}>
              {isConciliado ? 'Conciliado' : 'Não Conciliado'}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {movimento && (
            <button type="button" onClick={conciliar} disabled={conciliando}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', backgroundColor: isConciliado ? 'transparent' : 'var(--cor-sucesso)', border: isConciliado ? '1px solid var(--cor-aviso)' : 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: isConciliado ? 'var(--cor-aviso)' : '#fff', fontWeight: 600, opacity: conciliando ? 0.7 : 1 }}>
              {isConciliado ? <><XCircle size={13} /> Desconciliar</> : <><CheckCircle size={13} /> Conciliar</>}
            </button>
          )}
          {movimento && (
            <button type="button" onClick={excluir} disabled={deleting}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)', opacity: deleting ? 0.5 : 1 }}>
              <Trash2 size={13} /> {deleting ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
          <button type="submit" disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', backgroundColor: 'var(--cor-primaria)', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: '#fff', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>

        {/* ── Abas ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--borda-suave)', paddingLeft: 16, flexShrink: 0 }}>
          {ABAS.map(a => (
            <button key={a} type="button" onClick={() => setAba(a)}
              style={{ padding: '6px 16px', fontSize: 12, fontWeight: aba === a ? 700 : 400, background: 'none', border: 'none', borderBottom: aba === a ? '2px solid var(--cor-primaria)' : '2px solid transparent', cursor: 'pointer', color: aba === a ? 'var(--cor-primaria)' : 'var(--texto-secundario)', marginBottom: -1, transition: 'color 0.15s' }}>
              {a}
            </button>
          ))}
        </div>

        {/* Campos */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* ══════════════ ABA DADOS ══════════════ */}
          {aba === 'Dados' && (
          <fieldset className="form-fieldset">
            <legend>
              <ClipboardList size={12} /> Dados do Movimento
            </legend>
            <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>

            <Row label="Tipo:*" error={errors.tipo?.message}>
              <Select {...register('tipo')} style={{ width: 180 }}>
                <option value="S">S — Saída</option>
                <option value="E">E — Entrada</option>
              </Select>
            </Row>

            <Row label="Valor:*" error={errors.valor?.message}>
              <MoneyInput value={watch('valor')} onValue={n => setValue('valor', n, { shouldValidate: true })} error={!!errors.valor} style={{ width: 160 }} />
            </Row>

            <Row label="Data Movimento:*" error={errors.data_movimento?.message}>
              <input type="date" {...register('data_movimento')}
                style={{ padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: errors.data_movimento ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }} />
            </Row>

            <Sep />

            <LookupField
              label="Pessoa:"
              nome={nomePessoa}
              onOpen={() => setPicker('pessoa')}
              onClear={() => { setValue('pessoa_id', null); setNomePessoa('') }}
            />

            {movimento?.origem_tipo && movimento.origem_tipo !== 'Manual' ? (
              <Row label="Descrição:">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, border: '1px solid var(--borda-media)', color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                    {movimento.origem_tipo}
                  </span>
                  {movimento.origem_desc && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)' }}>{movimento.origem_desc}</span>
                  )}
                </div>
              </Row>
            ) : (
              <LookupField
                label="Tipo de Operação:"
                nome={nomeTipoOperacao}
                onOpen={() => setPicker('tipo_operacao')}
                onClear={() => { setValue('tipo_operacao_id', null); setNomeTipoOperacao('') }}
              />
            )}

            <Row label="Documento:">
              <Input {...register('documento')} style={{ width: 220, textTransform: 'uppercase' }} />
            </Row>

            </div>
          </fieldset>
          )}

          {/* ══════════════ ABA COMPLEMENTO ══════════════ */}
          {aba === 'Complemento' && (
          <fieldset className="form-fieldset">
            <legend>
              <FileText size={12} /> Complemento
            </legend>
            <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'start', gap: '2px 6px' }}>
              <label style={{ textAlign: 'right', fontSize: 12, color: 'var(--texto-secundario)', paddingRight: 2, paddingTop: 4 }}>Observação:</label>
              <textarea {...register('observacao')} rows={4}
                style={{ width: '100%', padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)' }}
                onBlur={e  => (e.target.style.borderColor = 'var(--borda-media)')}
              />
            </div>

            {/* Origem do lançamento */}
            {movimento && movimento.origem_tipo && movimento.origem_tipo !== 'Manual' && (<>
              <Sep />
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--texto-terciario)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Origem do lançamento</div>
              <div style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--borda-suave)', borderRadius: 4, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 3, backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda-media)', color: 'var(--texto-secundario)' }}>
                    {movimento.origem_tipo}
                  </span>
                  {movimento.origem_desc && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)' }}>{movimento.origem_desc}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {movimento.titulo_pagar_id && (
                    <span style={{ fontSize: 11, color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)' }}>
                      Título a Pagar #{movimento.titulo_pagar_id}
                    </span>
                  )}
                  {movimento.titulo_receber_id && (
                    <span style={{ fontSize: 11, color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)' }}>
                      Título a Receber #{movimento.titulo_receber_id}
                    </span>
                  )}
                  {movimento.despesa_id && (
                    <span style={{ fontSize: 11, color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)' }}>
                      Despesa #{movimento.despesa_id}
                    </span>
                  )}
                  {movimento.receita_id && (
                    <span style={{ fontSize: 11, color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)' }}>
                      Receita #{movimento.receita_id}
                    </span>
                  )}
                </div>
              </div>
            </>)}

            {/* Conciliação */}
            {movimento && isConciliado && (<>
              <Sep />
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '4px 6px' }}>
                <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--texto-terciario)' }}>Conciliado em:</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>
                  {movimento.data_conciliacao ? movimento.data_conciliacao.slice(0, 10).split('-').reverse().join('/') : '—'}
                </span>
              </div>
            </>)}

            {/* Audit */}
            {movimento && (<>
              <Sep />
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '4px 6px', marginTop: 4 }}>
                <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--texto-terciario)' }}>Criado por:</span>
                <span style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>{movimento.created_by ?? '—'}</span>
                <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--texto-terciario)' }}>Criado em:</span>
                <span style={{ fontSize: 11, color: 'var(--texto-secundario)', fontFamily: 'var(--fonte-mono)' }}>
                  {new Date(movimento.created_at).toLocaleString('pt-BR')}
                </span>
              </div>
            </>)}

            </div>
          </fieldset>
          )}

        </div>
      </form>
    </>
  )
}
