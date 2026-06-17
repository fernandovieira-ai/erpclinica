'use client'

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Search, X, CopyCheck, Banknote, RotateCcw } from 'lucide-react'
import { tituloPagarSchema, type TituloPagarInput } from '@/lib/validators/titulo-pagar.schema'
import type { TituloPagar } from '@/types/cadastros.types'
import MoneyInput from '@/components/ui/MoneyInput'

interface Props { titulo?: TituloPagar }

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
type TipoDespesaItem  = { id: number; codigo: string; descricao: string }
type FormaPagtoItem   = { id: number; des_tipo_cobranca: string }
type CentroCustoItem  = { id: number; codigo: string; descricao: string }
type ContaBancoItem   = { id: number; mnemonico: string; banco_nome: string | null }

type PickerKey = 'pessoa' | 'tipo_despesa' | 'tipo_cobranca' | 'centro_custo' | 'conta_banco' | 'conta_banco_liq'

const ABAS = ['Dados', 'Valores', 'Complemento'] as const
type Aba = typeof ABAS[number]

// ── Componente principal ──────────────────────────────────────────────────────

export default function TituloPagarFormPage({ titulo }: Props) {
  const router  = useRouter()
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [picker,   setPicker]   = useState<PickerKey | null>(null)
  const [aba,      setAba]      = useState<Aba>('Dados')

  const [nomePessoa,      setNomePessoa]      = useState('')
  const [nomeTipoDespesa, setNomeTipoDespesa] = useState('')
  const [nomeTipoCobranca, setNomeTipoCobranca] = useState('')
  const [nomeCentro,      setNomeCentro]      = useState('')
  const [nomeContaBanco,  setNomeContaBanco]  = useState('')
  const [nomeContaBancoLiq, setNomeContaBancoLiq] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<TituloPagarInput>({
    resolver: zodResolver(tituloPagarSchema),
    defaultValues: {
      data_emissao:     today,
      valor_juros:      0,
      valor_multa:      0,
      valor_desconto:   0,
      valor_retencao:   0,
      valor_liquidado:  0,
      status:           'A',
      requer_aprovacao: false,
    },
  })

  useEffect(() => {
    if (!titulo) return
    setValue('pessoa_id',          titulo.pessoa_id)
    setValue('tipo_despesa_id',    titulo.tipo_despesa_id   ?? undefined)
    setValue('cod_tipo_cobranca',   titulo.cod_tipo_cobranca  ?? undefined)
    setValue('centro_custo_id',    titulo.centro_custo_id   ?? undefined)
    setValue('conta_banco_id',     titulo.conta_banco_id    ?? undefined)
    setValue('despesa_id',         titulo.despesa_id        ?? undefined)
    setValue('numero_titulo',      titulo.numero_titulo     ?? '')
    setValue('num_documento',      titulo.num_documento     ?? '')
    setValue('data_emissao',       titulo.data_emissao)
    setValue('data_vencimento',    titulo.data_vencimento)
    setValue('data_liquidacao',    titulo.data_liquidacao   ?? '')
    setValue('data_competencia',   titulo.data_competencia  ?? '')
    setValue('valor_original',     parseFloat(titulo.valor_original))
    setValue('valor_juros',        parseFloat(titulo.valor_juros))
    setValue('valor_multa',        parseFloat(titulo.valor_multa))
    setValue('valor_desconto',     parseFloat(titulo.valor_desconto))
    setValue('valor_retencao',     parseFloat(titulo.valor_retencao))
    setValue('valor_liquidado',    parseFloat(titulo.valor_liquidado))
    setValue('destino_liquidacao',  titulo.destino_liquidacao ?? undefined)
    setValue('conta_banco_liq_id',  titulo.conta_banco_liq_id ?? undefined)
    setValue('status',             titulo.status)
    setValue('requer_aprovacao',   titulo.requer_aprovacao)
    setValue('status_aprovacao',   titulo.status_aprovacao ?? undefined)
    setValue('codigo_barras',      titulo.codigo_barras ?? '')
    setValue('nosso_numero',       titulo.nosso_numero  ?? '')
    setValue('observacao',         titulo.observacao    ?? '')
    setNomePessoa(titulo.pessoa_nome          ?? '')
    setNomeTipoDespesa(titulo.tipo_despesa_desc  ?? '')
    setNomeTipoCobranca(titulo.tipo_cobranca_desc ?? '')
    setNomeCentro(titulo.centro_custo_desc     ?? '')
    setNomeContaBanco(titulo.conta_banco_desc   ?? '')
    setNomeContaBancoLiq(titulo.conta_banco_liq_desc ?? '')
  }, [titulo, setValue])

  async function onSubmit(data: TituloPagarInput) {
    setSaving(true)
    try {
      const url    = titulo ? `/api/financeiro/titulos-pagar/${titulo.id}` : '/api/financeiro/titulos-pagar'
      const method = titulo ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(titulo ? 'Título atualizado!' : 'Título cadastrado!')
      if (!titulo) router.push(`/financeiro/titulos-pagar/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function liquidar() {
    const destino = watch('destino_liquidacao')
    if (!destino) {
      toast.error('Selecione o destino de liquidação (Caixa ou Banco) na aba Valores.')
      setAba('Valores')
      return
    }
    if (destino === 'B' && !watch('conta_banco_liq_id')) {
      toast.error('Selecione a conta bancária de liquidação na aba Valores.')
      setAba('Valores')
      return
    }
    if (!watch('data_liquidacao')) setValue('data_liquidacao', today)
    if (!watch('valor_liquidado')) setValue('valor_liquidado', parseFloat(valorLiquido.toFixed(2)))
    setValue('status', 'L')
    handleSubmit(onSubmit)()
  }

  const bloqueado = titulo?.status === 'L'

  async function estornar() {
    if (!titulo || !confirm('Estornar liquidação? O título voltará para status Aberto.')) return
    setValue('status', 'A')
    setValue('data_liquidacao', '')
    setValue('valor_liquidado', 0)
    setValue('destino_liquidacao', null)
    setValue('conta_banco_liq_id', null)
    setNomeContaBancoLiq('')
    handleSubmit(onSubmit)()
  }

  async function excluir() {
    if (!titulo || !confirm('Excluir este título a pagar?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/financeiro/titulos-pagar/${titulo.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir'); return }
      toast.success('Título excluído!')
      router.push('/financeiro/titulos-pagar')
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

  const valorOriginal  = watch('valor_original')  || 0
  const valorLiquidado = watch('valor_liquidado') || 0
  const valorJuros     = watch('valor_juros')     || 0
  const valorMulta     = watch('valor_multa')     || 0
  const valorDesconto  = watch('valor_desconto')  || 0
  const valorRetencao  = watch('valor_retencao')  || 0
  const destLiq        = watch('destino_liquidacao')
  const valorLiquido   = valorOriginal + valorJuros + valorMulta - valorDesconto - valorRetencao
  const valorSaldo     = valorLiquido - valorLiquidado

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
      {picker === 'tipo_despesa' && (
        <PickerModal<TipoDespesaItem>
          title="Tipo de Despesa"
          url="/api/cadastro/tipos-despesa"
          renderItem={t => <><span style={{ fontFamily: 'var(--fonte-mono)', marginRight: 8, color: 'var(--texto-terciario)' }}>{t.codigo}</span><strong>{t.descricao}</strong></>}
          onSelect={t => { setValue('tipo_despesa_id', t.id); setNomeTipoDespesa(`${t.codigo} - ${t.descricao}`); setPicker(null) }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'tipo_cobranca' && (
        <PickerModal<FormaPagtoItem>
          title="Tipo de Cobrança"
          url="/api/cadastro/formas-pagamento"
          renderItem={f => <strong>{f.des_tipo_cobranca}</strong>}
          onSelect={f => { setValue('cod_tipo_cobranca', f.id); setNomeTipoCobranca(f.des_tipo_cobranca); setPicker(null) }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'centro_custo' && (
        <PickerModal<CentroCustoItem>
          title="Centro de Custo"
          url="/api/cadastro/centros-custo"
          renderItem={c => <><span style={{ fontFamily: 'var(--fonte-mono)', marginRight: 8, color: 'var(--texto-terciario)' }}>{c.codigo}</span><strong>{c.descricao}</strong></>}
          onSelect={c => { setValue('centro_custo_id', c.id); setNomeCentro(`${c.codigo} - ${c.descricao}`); setPicker(null) }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'conta_banco' && (
        <PickerModal<ContaBancoItem>
          title="Conta Bancária"
          url="/api/cadastro/contas-banco"
          renderItem={c => <><strong>{c.mnemonico}</strong>{c.banco_nome ? <span style={{ marginLeft: 8, color: 'var(--texto-terciario)' }}>{c.banco_nome}</span> : null}</>}
          onSelect={c => { setValue('conta_banco_id', c.id); setNomeContaBanco(c.mnemonico); setPicker(null) }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'conta_banco_liq' && (
        <PickerModal<ContaBancoItem>
          title="Conta Bancária — Liquidação"
          url="/api/cadastro/contas-banco"
          renderItem={c => <><strong>{c.mnemonico}</strong>{c.banco_nome ? <span style={{ marginLeft: 8, color: 'var(--texto-terciario)' }}>{c.banco_nome}</span> : null}</>}
          onSelect={c => { setValue('conta_banco_liq_id', c.id); setNomeContaBancoLiq(c.mnemonico); setPicker(null) }}
          onClose={() => setPicker(null)}
        />
      )}

      {/* ── Formulário ── */}
      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--borda-suave)', flexShrink: 0 }}>
          <button type="button" onClick={() => router.push('/financeiro/titulos-pagar')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            <ArrowLeft size={13} /> Voltar
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)', marginLeft: 4 }}>
            {titulo ? `Título a Pagar #${titulo.id}` : 'Novo Título a Pagar'}
          </span>
          <div style={{ flex: 1 }} />
          {titulo?.status === 'A' && (
            <button type="button" onClick={liquidar} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', backgroundColor: 'var(--cor-sucesso)', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: '#fff', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              <Banknote size={13} /> Liquidar
            </button>
          )}
          {bloqueado && (
            <button type="button" onClick={estornar} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', background: 'none', border: '1px solid var(--cor-aviso)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--cor-aviso)', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              <RotateCcw size={13} /> Estornar
            </button>
          )}
          {titulo && (
            <button type="button" onClick={excluir} disabled={deleting}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)', opacity: deleting ? 0.5 : 1 }}>
              <Trash2 size={13} /> {deleting ? 'Excluindo...' : 'Excluir'}
            </button>
          )}
          {!bloqueado && (
            <button type="submit" disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', backgroundColor: 'var(--cor-primaria)', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: '#fff', fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
          )}
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
          {aba === 'Dados' && (<>

            <LookupField
              label="Pessoa / Fornecedor:*"
              nome={nomePessoa}
              onOpen={() => setPicker('pessoa')}
              onClear={() => { setValue('pessoa_id', 0); setNomePessoa('') }}
              error={errors.pessoa_id?.message}
              disabled={bloqueado}
            />
            <LookupField
              label="Tipo de Despesa:"
              nome={nomeTipoDespesa}
              onOpen={() => setPicker('tipo_despesa')}
              onClear={() => { setValue('tipo_despesa_id', null); setNomeTipoDespesa('') }}
              disabled={bloqueado}
            />
            <LookupField
              label="Tipo de Cobrança:"
              nome={nomeTipoCobranca}
              onOpen={() => setPicker('tipo_cobranca')}
              onClear={() => { setValue('cod_tipo_cobranca', null); setNomeTipoCobranca('') }}
              disabled={bloqueado}
            />
            <LookupField
              label="Centro de Custo:"
              nome={nomeCentro}
              onOpen={() => setPicker('centro_custo')}
              onClear={() => { setValue('centro_custo_id', null); setNomeCentro('') }}
              disabled={bloqueado}
            />

            <Sep />

            <Row label="Nº Título:">
              <Input {...register('numero_titulo')} disabled={bloqueado} style={{ width: 180, opacity: bloqueado ? 0.65 : 1 }} />
            </Row>
            <Row label="Nº Documento:">
              <Input {...register('num_documento')} disabled={bloqueado} style={{ width: 220, opacity: bloqueado ? 0.65 : 1 }} />
            </Row>

            <Sep />

            <Row label="Data Emissão:*" error={errors.data_emissao?.message}>
              <input type="date" {...register('data_emissao')} disabled={bloqueado}
                style={{ padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: errors.data_emissao ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none', opacity: bloqueado ? 0.65 : 1 }} />
            </Row>
            <Row label="Data Vencimento:*" error={errors.data_vencimento?.message}>
              <input type="date" {...register('data_vencimento')} disabled={bloqueado}
                style={{ padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: errors.data_vencimento ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none', opacity: bloqueado ? 0.65 : 1 }} />
            </Row>
            <Row label="Data Competência:">
              <input type="date" {...register('data_competencia')} disabled={bloqueado}
                style={{ padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none', opacity: bloqueado ? 0.65 : 1 }} />
            </Row>

            <Sep />

            <Row label="Status:">
              <Select {...register('status')} disabled={bloqueado} style={{ width: 180, opacity: bloqueado ? 0.65 : 1 }}>
                <option value="A">A — Aberto</option>
                <option value="L">L — Liquidado</option>
                <option value="C">C — Cancelado</option>
              </Select>
            </Row>

            <Row label="Requer Aprovação:">
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: bloqueado ? 'default' : 'pointer', userSelect: 'none', color: 'var(--texto-principal)', opacity: bloqueado ? 0.65 : 1 }}>
                <input type="checkbox" {...register('requer_aprovacao')} disabled={bloqueado} style={{ cursor: bloqueado ? 'default' : 'pointer', width: 13, height: 13, accentColor: 'var(--cor-primaria)' }} />
                Sim
              </label>
            </Row>

            {watch('requer_aprovacao') && (
              <Row label="Status Aprovação:">
                <Select {...register('status_aprovacao')} disabled={bloqueado} style={{ width: 180, opacity: bloqueado ? 0.65 : 1 }}>
                  <option value="">— Selecione —</option>
                  <option value="P">P — Pendente</option>
                  <option value="A">A — Aprovado</option>
                  <option value="R">R — Rejeitado</option>
                </Select>
              </Row>
            )}
          </>)}

          {/* ══════════════ ABA VALORES ══════════════ */}
          {aba === 'Valores' && (<>

            <Row label="Valor Original:*" error={errors.valor_original?.message}>
              <MoneyInput value={watch('valor_original')} onValue={n => setValue('valor_original', n, { shouldValidate: true })} disabled={bloqueado} error={!!errors.valor_original} style={{ width: 160 }} />
            </Row>
            <Row label="Juros:">
              <MoneyInput value={watch('valor_juros')} onValue={n => setValue('valor_juros', n)} disabled={bloqueado} style={{ width: 160 }} />
            </Row>
            <Row label="Multa:">
              <MoneyInput value={watch('valor_multa')} onValue={n => setValue('valor_multa', n)} disabled={bloqueado} style={{ width: 160 }} />
            </Row>
            <Row label="Desconto:">
              <MoneyInput value={watch('valor_desconto')} onValue={n => setValue('valor_desconto', n)} disabled={bloqueado} style={{ width: 160 }} />
            </Row>
            <Row label="Retenção:">
              <MoneyInput value={watch('valor_retencao')} onValue={n => setValue('valor_retencao', n)} disabled={bloqueado} style={{ width: 160 }} />
            </Row>

            <Sep />

            {/* Totalizador calculado */}
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'start', gap: '2px 6px' }}>
              <label style={{ textAlign: 'right', fontSize: 12, color: 'var(--texto-secundario)', paddingRight: 2, paddingTop: 4 }}>Valor Líquido:</label>
              <span style={{ padding: '3px 6px', fontSize: 12, fontFamily: 'var(--fonte-mono)', fontWeight: 700, color: 'var(--texto-principal)' }}>
                {valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <Sep />

            <Row label="Data Liquidação:">
              <input type="date" {...register('data_liquidacao')} disabled={bloqueado}
                style={{ padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none', opacity: bloqueado ? 0.65 : 1 }} />
            </Row>
            <Row label="Valor Liquidado:">
              <MoneyInput value={watch('valor_liquidado')} onValue={n => setValue('valor_liquidado', n)} disabled={bloqueado} style={{ width: 160 }} />
              {!bloqueado && (
                <button type="button"
                  title="Preencher com valor líquido (liquidação total)"
                  onClick={() => setValue('valor_liquidado', parseFloat(valorLiquido.toFixed(2)))}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>
                  <CopyCheck size={12} /> Liq. total
                </button>
              )}
            </Row>
            <Row label="Destino Liquidação:">
              <Select
                {...register('destino_liquidacao')}
                disabled={bloqueado}
                onChange={e => {
                  setValue('destino_liquidacao', (e.target.value as 'C' | 'B') || null)
                  if (e.target.value !== 'B') { setValue('conta_banco_liq_id', null); setNomeContaBancoLiq('') }
                }}
                style={{ width: 180, opacity: bloqueado ? 0.65 : 1 }}
              >
                <option value="">— Selecione —</option>
                <option value="C">Caixa</option>
                <option value="B">Banco</option>
              </Select>
            </Row>
            {(destLiq === 'B' || (bloqueado && titulo?.conta_banco_liq_id)) && (
              <LookupField
                label="Conta Bancária Liq.:"
                nome={nomeContaBancoLiq}
                onOpen={() => setPicker('conta_banco_liq')}
                onClear={() => { setValue('conta_banco_liq_id', null); setNomeContaBancoLiq('') }}
                disabled={bloqueado}
              />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'start', gap: '2px 6px' }}>
              <label style={{ textAlign: 'right', fontSize: 12, color: 'var(--texto-secundario)', paddingRight: 2, paddingTop: 4 }}>Saldo:</label>
              <span style={{ padding: '3px 6px', fontSize: 12, fontFamily: 'var(--fonte-mono)', fontWeight: 700, color: valorSaldo > 0 ? 'var(--cor-aviso)' : 'var(--cor-sucesso)' }}>
                {valorSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </>)}

          {/* ══════════════ ABA COMPLEMENTO ══════════════ */}
          {aba === 'Complemento' && (<>

            <Row label="Código de Barras:">
              <Input {...register('codigo_barras')} disabled={bloqueado} style={{ width: 340, fontFamily: 'var(--fonte-mono)', letterSpacing: '0.05em', opacity: bloqueado ? 0.65 : 1 }} />
            </Row>
            <Row label="Nosso Número:">
              <Input {...register('nosso_numero')} disabled={bloqueado} style={{ width: 180, fontFamily: 'var(--fonte-mono)', opacity: bloqueado ? 0.65 : 1 }} />
            </Row>

            <Sep />

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'start', gap: '2px 6px' }}>
              <label style={{ textAlign: 'right', fontSize: 12, color: 'var(--texto-secundario)', paddingRight: 2, paddingTop: 4 }}>Observação:</label>
              <textarea {...register('observacao')} rows={4} disabled={bloqueado}
                style={{ width: '100%', padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, resize: 'vertical', outline: 'none', fontFamily: 'inherit', opacity: bloqueado ? 0.65 : 1 }}
                onFocus={e => { if (!bloqueado) e.target.style.borderColor = 'var(--cor-primaria)' }}
                onBlur={e  => (e.target.style.borderColor = 'var(--borda-media)')}
              />
            </div>

            {titulo && (<>
              <Sep />
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '4px 6px', marginTop: 4 }}>
                {titulo.aprovado_por && (<>
                  <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--texto-terciario)' }}>Aprovado por:</span>
                  <span style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>{titulo.aprovado_por}</span>
                </>)}
                <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--texto-terciario)' }}>Criado por:</span>
                <span style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>{titulo.created_by ?? '—'}</span>
                <span style={{ textAlign: 'right', fontSize: 11, color: 'var(--texto-terciario)' }}>Criado em:</span>
                <span style={{ fontSize: 11, color: 'var(--texto-secundario)', fontFamily: 'var(--fonte-mono)' }}>
                  {new Date(titulo.created_at).toLocaleString('pt-BR')}
                </span>
              </div>
            </>)}
          </>)}

        </div>
      </form>
    </>
  )
}
