'use client'

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Search, X, ClipboardList, Receipt, PieChart } from 'lucide-react'
import { receitaSchema, type ReceitaInput } from '@/lib/validators/receita.schema'
import type { Receita } from '@/types/cadastros.types'
import MoneyInput from '@/components/ui/MoneyInput'

interface Props { receita?: Receita }

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
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'start', gap: '2px 6px', minHeight: 24 }}>
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

function PickerModal<T extends { id: number }>({ title, url, params: extraParams, renderItem, onSelect, onClose }: {
  title:      string
  url:        string
  params?:    Record<string, string>
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
      const sp = new URLSearchParams({ ativo: 'true', limit: '200', ...extraParams })
      if (termo.trim()) sp.set('busca', termo.trim())
      const res  = await fetch(`${url}?${sp}`)
      const data = res.ok ? await res.json() : { dados: [] }
      setLista(data.dados ?? [])
    } finally { setLoading(false) }
  }, [url, extraParams])

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

// ── Pickers específicos ───────────────────────────────────────────────────────

type PessoaItem        = { id: number; nome: string; cpf_cnpj: string | null }
type TipoReceitaItem   = { id: number; codigo: string; descricao: string; natureza: string }
type TipoCobrancaItem  = { id: number; des_tipo_cobranca: string }
type CentroCustoItem   = { id: number; codigo: string; descricao: string }
type ContaBancoItem    = { id: number; mnemonico: string; banco_nome: string | null }

type PickerKey = 'pessoa' | 'tipo_receita' | 'tipo_cobranca' | 'centro_custo' | 'conta_banco' | 'centro_custo_rateio'

type ParcelaRow = { num: number; vencimento: string; valor: number; juros: number; sacador: string }
type RateioRow  = { centro_custo_id: number; codigo: string; descricao: string; percentual: number; valor: number }

const ABAS = ['Dados', 'Parcelas', 'Rateio'] as const
type Aba = typeof ABAS[number]

// ── Componente principal ──────────────────────────────────────────────────────

export default function ReceitaFormPage({ receita }: Props) {
  const router  = useRouter()
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [picker,   setPicker]   = useState<PickerKey | null>(null)
  const [aba,      setAba]      = useState<Aba>('Dados')

  // nomes exibidos nos campos de lookup
  const [nomePessoa,          setNomePessoa]          = useState('')
  const [nomeTipoReceita,     setNomeTipoReceita]     = useState('')
  const [tipoReceitaNatureza, setTipoReceitaNatureza] = useState('')
  const [nomeTipoCobranca,    setNomeTipoCobranca]    = useState('')
  const [nomeCentro,          setNomeCentro]          = useState('')
  const [nomeContaBanco,      setNomeContaBanco]      = useState('')

  // estado da aba Parcelas
  const [parcelas,      setParcelas]      = useState<ParcelaRow[]>([])
  const [rowIdx,        setRowIdx]        = useState<number | null>(null)
  const [rowVenc,       setRowVenc]       = useState('')
  const [rowValor,      setRowValor]      = useState(0)
  const [rowJuros,      setRowJuros]      = useState(0)
  // campos de geração automática
  const [geraVenc1,     setGeraVenc1]     = useState('')
  const [geraIntervalo, setGeraIntervalo] = useState('30')
  const [geraQtd,       setGeraQtd]       = useState('1')
  const [geraJurosInd,  setGeraJurosInd]  = useState(0)
  const [geraValor,     setGeraValor]     = useState(0)
  const [diaFixo,       setDiaFixo]       = useState(false)

  // estado da aba Rateio
  const [rateios,          setRateios]          = useState<RateioRow[]>([])
  const [rateioIdx,        setRateioIdx]        = useState<number | null>(null)
  const [rateioEdicao,     setRateioEdicao]     = useState(false)
  const [rateioCentroId,   setRateioCentroId]   = useState<number | null>(null)
  const [rateioCentroNome, setRateioCentroNome] = useState('')
  const [rateioPct,        setRateioPct]        = useState('')
  const [rateioVal,        setRateioVal]        = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<ReceitaInput>({
    resolver: zodResolver(receitaSchema),
    defaultValues: {
      data_receita:   today,
      num_parcelas:   1,
      intervalo_dias: 30,
      ind_avista:     false,
      status:         'A',
    },
  })

  const numParcelas  = watch('num_parcelas')
  const indAvista    = watch('ind_avista')
  const dataReceita  = watch('data_receita')
  const valorWatch   = watch('valor')

  function calcValorFromPct(pct: number) {
    const total = valorWatch || 0
    return Math.round(total * pct / 100 * 100) / 100
  }
  function calcPctFromValor(val: number) {
    const total = valorWatch || 0
    return total > 0 ? Math.round(val / total * 10000) / 100 : 0
  }

  function gerarParcelas() {
    const qtd       = Math.max(1, parseInt(geraQtd)  || 1)
    const intervalo = Math.max(1, parseInt(geraIntervalo) || 30)
    const val       = geraValor || valorWatch || 0
    const juros     = geraJurosInd
    const base      = geraVenc1 || dataReceita
    if (!base || val <= 0) return
    const valorBase = Math.floor((val / qtd) * 100) / 100
    const novas: ParcelaRow[] = []
    for (let i = 0; i < qtd; i++) {
      const dt = new Date(base + 'T00:00:00')
      if (diaFixo) {
        dt.setMonth(dt.getMonth() + i)
      } else {
        dt.setDate(dt.getDate() + i * intervalo)
      }
      const valorParcela = i === qtd - 1
        ? Math.round((val - valorBase * (qtd - 1)) * 100) / 100
        : valorBase
      novas.push({ num: i + 1, vencimento: dt.toISOString().slice(0, 10), valor: valorParcela, juros, sacador: '' })
    }
    setParcelas(novas)
    setRowIdx(null); setRowVenc(''); setRowValor(0); setRowJuros(0)
    setValue('num_parcelas', qtd)
    setValue('intervalo_dias', intervalo)
    if (val > 0 && !valorWatch) setValue('valor', val)
  }

  function selecionarRow(i: number) {
    const p = parcelas[i]
    setRowIdx(i)
    setRowVenc(p.vencimento)
    setRowValor(p.valor)
    setRowJuros(p.juros)
  }

  function salvarRow() {
    if (rowIdx === null) return
    const atualizadas = parcelas.map((p, i) => i === rowIdx
      ? { ...p, vencimento: rowVenc, valor: rowValor || p.valor, juros: rowJuros }
      : p
    )
    setParcelas(atualizadas)
    setRowIdx(null); setRowVenc(''); setRowValor(0); setRowJuros(0)
  }

  function adicionarRow() {
    const novaNum = (parcelas[parcelas.length - 1]?.num ?? 0) + 1
    const p: ParcelaRow = { num: novaNum, vencimento: rowVenc || today, valor: rowValor, juros: rowJuros, sacador: '' }
    const novas = [...parcelas, p]
    setParcelas(novas)
    setValue('num_parcelas', novas.length)
    setRowIdx(null); setRowVenc(''); setRowValor(0); setRowJuros(0)
  }

  function excluirRow() {
    if (rowIdx === null) return
    const novas = parcelas.filter((_, i) => i !== rowIdx).map((p, i) => ({ ...p, num: i + 1 }))
    setParcelas(novas)
    setValue('num_parcelas', novas.length || 1)
    setRowIdx(null); setRowVenc(''); setRowValor(0); setRowJuros(0)
  }

  useEffect(() => {
    if (!receita) return
    setValue('pessoa_id',         receita.pessoa_id)
    setValue('tipo_receita_id',   receita.tipo_receita_id)
    setValue('cod_tipo_cobranca', receita.cod_tipo_cobranca ?? undefined)
    setValue('centro_custo_id',   receita.centro_custo_id   ?? undefined)
    setValue('conta_banco_id',    receita.conta_banco_id    ?? undefined)
    setValue('ind_avista',         receita.ind_avista)
    setValue('destino',            receita.destino ?? undefined)
    setValue('data_receita',       receita.data_receita)
    setValue('data_competencia',   receita.data_competencia   ?? '')
    setValue('data_recebimento',   receita.data_recebimento   ?? '')
    setValue('documento',          receita.documento           ?? '')
    setValue('valor',              parseFloat(receita.valor))
    setValue('num_parcelas',       receita.num_parcelas)
    setValue('intervalo_dias',     receita.intervalo_dias)
    setValue('status',             receita.status)
    setValue('observacao',         receita.observacao ?? '')
    setNomePessoa(receita.pessoa_nome           ?? '')
    setNomeTipoReceita(receita.tipo_receita_desc ?? '')
    setTipoReceitaNatureza(receita.tipo_receita_natureza ?? '')
    setNomeCentro(receita.centro_custo_desc     ?? '')
    setNomeContaBanco(receita.conta_banco_desc  ?? '')
    setNomeTipoCobranca(receita.tipo_cobranca_desc ?? '')
    setGeraVenc1(receita.data_receita)
    setGeraQtd(String(receita.num_parcelas))
    setGeraIntervalo(String(receita.intervalo_dias))
    setGeraValor(parseFloat(receita.valor) || 0)

    if (receita.parcelas?.length) {
      setParcelas(receita.parcelas.map(p => ({
        num:        p.numero_parcela,
        vencimento: p.data_vencimento,
        valor:      parseFloat(String(p.valor)),
        juros:      0,
        sacador:    '',
      })))
    }
    if (receita.rateios?.length) {
      setRateios(receita.rateios.map(r => ({
        centro_custo_id: r.centro_custo_id,
        codigo:          r.codigo,
        descricao:       r.descricao,
        percentual:      parseFloat(String(r.percentual)),
        valor:           parseFloat(String(r.valor)),
      })))
    }
  }, [receita, setValue])

  async function onSubmit(data: ReceitaInput) {
    if (!data.destino && !data.cod_tipo_cobranca) {
      toast.error('Tipo de Cobrança é obrigatório para receitas parceladas.')
      setAba('Parcelas')
      return
    }

    if (tipoReceitaNatureza === 'A' && rateios.length === 0) {
      toast.error('Tipo de receita Administrativa requer pelo menos um rateio de centro de custo.')
      setAba('Rateio')
      return
    }

    setSaving(true)
    try {
      const url    = receita ? `/api/financeiro/receitas/${receita.id}` : '/api/financeiro/receitas'
      const method = receita ? 'PATCH' : 'POST'
      const payload = {
        ...data,
        rateios: rateios.map(r => ({ centro_custo_id: r.centro_custo_id, percentual: r.percentual, valor: r.valor })),
      }
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(receita ? 'Receita atualizada!' : 'Receita cadastrada!')
      if (!receita) router.push(`/financeiro/receitas/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function excluir() {
    if (!receita || !confirm('Excluir esta receita?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/financeiro/receitas/${receita.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        toast.error(json.erro ?? 'Erro ao excluir')
        return
      }
      toast.success('Receita excluída!')
      router.push('/financeiro/receitas')
    } finally { setDeleting(false) }
  }

  function LookupField({ label, nome, onOpen, onClear, error }: {
    label:   string
    nome:    string
    onOpen:  () => void
    onClear: () => void
    error?:  string
  }) {
    return (
      <Row label={label} error={error}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input readOnly value={nome} onClick={onOpen}
            placeholder="Clique para selecionar..."
            style={{ flex: 1, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: nome ? 'var(--texto-principal)' : 'var(--texto-terciario)', border: error ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', outline: 'none' }}
          />
          <button type="button" onClick={onOpen}  style={{ padding: '2px 6px', border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Search size={12} /></button>
          {nome && <button type="button" onClick={onClear} style={{ padding: '2px 4px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--texto-terciario)' }}><X size={12} /></button>}
        </div>
      </Row>
    )
  }

  return (
    <>
      {/* ── Picker modals ── */}
      {picker === 'pessoa' && (
        <PickerModal<PessoaItem>
          title="Cliente"
          url="/api/cadastro/pessoas"
          params={{ papel: 'cliente' }}
          renderItem={p => <><strong>{p.nome}</strong>{p.cpf_cnpj ? <span style={{ marginLeft: 8, color: 'var(--texto-terciario)' }}>{p.cpf_cnpj}</span> : null}</>}
          onSelect={p => { setValue('pessoa_id', p.id); setNomePessoa(p.nome); setPicker(null) }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'tipo_receita' && (
        <PickerModal<TipoReceitaItem>
          title="Tipo de Receita"
          url="/api/cadastro/tipos-receita"
          renderItem={t => <><span style={{ fontFamily: 'var(--fonte-mono)', marginRight: 8, color: 'var(--texto-terciario)' }}>{t.codigo}</span><strong>{t.descricao}</strong></>}
          onSelect={t => { setValue('tipo_receita_id', t.id); setNomeTipoReceita(`${t.codigo} - ${t.descricao}`); setTipoReceitaNatureza(t.natureza); setPicker(null) }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'tipo_cobranca' && (
        <PickerModal<TipoCobrancaItem>
          title="Tipo de Cobrança"
          url="/api/cadastro/formas-pagamento"
          renderItem={t => <strong>{t.des_tipo_cobranca}</strong>}
          onSelect={t => { setValue('cod_tipo_cobranca', t.id); setNomeTipoCobranca(t.des_tipo_cobranca); setPicker(null) }}
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

      {/* ── Formulário ── */}
      <form onSubmit={handleSubmit(onSubmit, (errs) => {
        const first = Object.values(errs)[0]
        if (first && 'message' in first) toast.error(first.message as string)
      })} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--borda-suave)', flexShrink: 0 }}>
          <button type="button" onClick={() => router.push('/financeiro/receitas')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            <ArrowLeft size={13} /> Voltar
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)', marginLeft: 4 }}>
            {receita ? `Receita #${receita.id}` : 'Nova Receita'}
          </span>
          <div style={{ flex: 1 }} />
          {receita && (
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
              {a}{a === 'Parcelas' && numParcelas > 1 ? ` (${numParcelas}x)` : ''}{a === 'Rateio' && tipoReceitaNatureza === 'A' && rateios.length === 0 ? ' ⚠' : ''}
            </button>
          ))}
        </div>

        {/* Campos */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {aba === 'Dados' && (
        <fieldset className="form-fieldset">
          <legend>
            <ClipboardList size={12} /> Dados Gerais
          </legend>
          <div className="form-fieldset-body">

          {/* Lookups */}
          <LookupField
            label="Pessoa:*"
            nome={nomePessoa}
            onOpen={() => setPicker('pessoa')}
            onClear={() => { setValue('pessoa_id', 0); setNomePessoa('') }}
            error={errors.pessoa_id?.message}
          />
          <LookupField
            label="Tipo de Receita:*"
            nome={nomeTipoReceita}
            onOpen={() => setPicker('tipo_receita')}
            onClear={() => { setValue('tipo_receita_id', 0); setNomeTipoReceita(''); setTipoReceitaNatureza('') }}
            error={errors.tipo_receita_id?.message}
          />
          <Sep />

          {/* Datas */}
          <Row label="Data Receita:*" error={errors.data_receita?.message}>
            <input type="date" {...register('data_receita')}
              style={{ padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: errors.data_receita ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }} />
          </Row>
          <Row label="Competência:">
            <input type="date" {...register('data_competencia')}
              style={{ padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }} />
          </Row>
          <Row label="Data Recebimento:">
            <input type="date" {...register('data_recebimento')}
              style={{ padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }} />
          </Row>

          <Sep />

          {/* Documento / Valor */}
          <Row label="Documento:">
            <Input {...register('documento')} style={{ width: 200, textTransform: 'uppercase' }} />
          </Row>
          <Row label="Valor:*" error={errors.valor?.message}>
            <MoneyInput value={watch('valor')} onValue={n => setValue('valor', n, { shouldValidate: true })} error={!!errors.valor} style={{ width: 140 }} />
          </Row>

          <Sep />

          {/* ── Destino: Banco ── */}
          <fieldset className="form-fieldset" style={{ margin: 0 }}>
            <legend style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => {
                const next = watch('destino') === 'B' ? undefined : 'B'
                setValue('destino', next)
                if (next !== 'B') { setValue('conta_banco_id', null); setNomeContaBanco('') }
              }}>
              <input type="checkbox" readOnly checked={watch('destino') === 'B'}
                style={{ cursor: 'pointer', width: 13, height: 13, accentColor: 'var(--cor-primaria)' }} />
              Banco
            </legend>

            {watch('destino') === 'B' ? (
              <LookupField
                label="Conta Bancária:"
                nome={nomeContaBanco}
                onOpen={() => setPicker('conta_banco')}
                onClear={() => { setValue('conta_banco_id', null); setNomeContaBanco('') }}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--texto-terciario)' }}>Marque para registrar recebimento via banco</p>
            )}
          </fieldset>

          {/* ── Destino: Caixa ── */}
          <fieldset className="form-fieldset" style={{ margin: 0 }}>
            <legend style={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => {
                const next = watch('destino') === 'C' ? undefined : 'C'
                setValue('destino', next)
                if (next === 'C') { setValue('conta_banco_id', null); setNomeContaBanco('') }
              }}>
              <input type="checkbox" readOnly checked={watch('destino') === 'C'}
                style={{ cursor: 'pointer', width: 13, height: 13, accentColor: 'var(--cor-primaria)' }} />
              Caixa
            </legend>

            {watch('destino') === 'C' ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--texto-secundario)' }}>Recebimento registrado no caixa da empresa</p>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--texto-terciario)' }}>Marque para registrar recebimento via caixa</p>
            )}
          </fieldset>

          <Sep />

          {/* Status */}
          <Row label="Status:">
            <Select {...register('status')} style={{ width: 180 }}>
              <option value="A">A — Aprovada</option>
              <option value="P">P — Pendente</option>
            </Select>
          </Row>

          <Sep />

          {/* Observação */}
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'start', gap: '2px 6px' }}>
            <label style={{ textAlign: 'right', fontSize: 12, color: 'var(--texto-secundario)', paddingRight: 2, paddingTop: 4 }}>Observação:</label>
            <textarea {...register('observacao')} rows={3}
              style={{ width: '100%', padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
              onFocus={e => (e.target.style.borderColor = 'var(--cor-primaria)')}
              onBlur={e  => (e.target.style.borderColor = 'var(--borda-media)')}
            />
          </div>

          </div>
        </fieldset>
        )}

        {aba === 'Parcelas' && (
          <fieldset className="form-fieldset">
            <legend>
              <Receipt size={12} /> Parcelas
            </legend>
            <div className="form-fieldset-body">

            {/* Tipo de Cobrança */}
            <LookupField
              label="Tipo de Cobrança:"
              nome={nomeTipoCobranca}
              onOpen={() => setPicker('tipo_cobranca')}
              onClear={() => { setValue('cod_tipo_cobranca', null); setNomeTipoCobranca('') }}
            />

            <Sep />

            {/* ── Row de edição manual ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Vencimento:</label>
              <input type="date" value={rowVenc} onChange={e => setRowVenc(e.target.value)}
                style={{ padding: '2px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }} />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', marginLeft: 4 }}>Valor:</label>
              <MoneyInput value={rowValor} onValue={setRowValor} style={{ width: 100 }} />
              <button type="button" title={rowIdx !== null ? 'Salvar alteração' : 'Adicionar parcela'}
                onClick={rowIdx !== null ? salvarRow : adicionarRow}
                style={{ padding: '2px 7px', border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--cor-primaria)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {rowIdx !== null ? '✔ Salvar' : '+ Add'}
              </button>
              {rowIdx !== null && (
                <button type="button" title="Cancelar edição"
                  onClick={() => { setRowIdx(null); setRowVenc(''); setRowValor(0); setRowJuros(0) }}
                  style={{ padding: '2px 6px', border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--texto-terciario)' }}>
                  ✕
                </button>
              )}
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', marginLeft: 4 }}>Juros:</label>
              <MoneyInput value={rowJuros} onValue={setRowJuros} style={{ width: 70 }} />
            </div>

            {/* ── Grid de parcelas ── */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
              <table style={{ flex: 1, borderCollapse: 'collapse', fontSize: 12, border: '1px solid var(--borda-media)' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-hover)' }}>
                    <th style={{ padding: '4px 8px', textAlign: 'center', width: 55,  fontWeight: 600, color: 'var(--texto-secundario)', borderBottom: '1px solid var(--borda-media)' }}>Parcela</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left',   width: 110, fontWeight: 600, color: 'var(--texto-secundario)', borderBottom: '1px solid var(--borda-media)' }}>Vencimento</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right',  width: 100, fontWeight: 600, color: 'var(--texto-secundario)', borderBottom: '1px solid var(--borda-media)' }}>Valor</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right',  width: 80,  fontWeight: 600, color: 'var(--texto-secundario)', borderBottom: '1px solid var(--borda-media)' }}>Juros</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left',               fontWeight: 600, color: 'var(--texto-secundario)', borderBottom: '1px solid var(--borda-media)' }}>Sacador</th>
                  </tr>
                </thead>
                <tbody>
                  {parcelas.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--texto-terciario)', fontStyle: 'italic' }}>&lt;Sem dados — use Geração Automática&gt;</td></tr>
                  )}
                  {parcelas.map((p, i) => (
                    <tr key={i} onClick={() => selecionarRow(i)}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--borda-suave)', background: rowIdx === i ? 'var(--cor-primaria)18' : undefined }}
                      onMouseEnter={e => { if (rowIdx !== i) e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = rowIdx === i ? 'var(--cor-primaria)18' : '' }}>
                      <td style={{ padding: '4px 8px', textAlign: 'center', fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)' }}>{p.num}</td>
                      <td style={{ padding: '4px 8px', fontFamily: 'var(--fonte-mono)' }}>{p.vencimento.split('-').reverse().join('/')}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 500 }}>{p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)' }}>{p.juros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--texto-terciario)' }}>{p.sacador || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                {parcelas.length > 0 && (() => {
                  const totalVal   = parcelas.reduce((s, p) => s + p.valor,  0)
                  const totalJuros = parcelas.reduce((s, p) => s + p.juros,  0)
                  return (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--borda-media)', background: 'var(--bg-hover)' }}>
                        <td colSpan={2} style={{ padding: '4px 8px', fontSize: 11, color: 'var(--texto-terciario)', textAlign: 'right', fontWeight: 600 }}>Total</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 700 }}>{totalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 700, color: 'var(--texto-terciario)' }}>{totalJuros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )
                })()}
              </table>

              {/* botões laterais */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
                <button type="button" title="Adicionar linha" onClick={() => { setRowIdx(null); setRowVenc(''); setRowValor(0); setRowJuros(0) }}
                  style={{ width: 26, height: 26, border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: 'var(--cor-primaria)' }}>+</button>
                <button type="button" title="Editar selecionada" disabled={rowIdx === null}
                  onClick={() => rowIdx !== null && selecionarRow(rowIdx)}
                  style={{ width: 26, height: 26, border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', cursor: rowIdx !== null ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, opacity: rowIdx === null ? 0.35 : 1 }}>✎</button>
                <button type="button" title="Excluir selecionada" disabled={rowIdx === null}
                  onClick={excluirRow}
                  style={{ width: 26, height: 26, border: '1px solid var(--cor-erro)40', borderRadius: 3, background: 'none', cursor: rowIdx !== null ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--cor-erro)', opacity: rowIdx === null ? 0.35 : 1 }}>🗑</button>
              </div>
            </div>

            <Sep />

            {/* ── Geração Automática de Parcelas ── */}
            <fieldset className="form-fieldset" style={{ margin: 0 }}>
              <legend>Geração Automática de Parcelas</legend>
              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', userSelect: 'none', color: 'var(--texto-principal)' }}>
                  <input type="checkbox" checked={diaFixo} onChange={e => setDiaFixo(e.target.checked)} style={{ cursor: 'pointer', width: 13, height: 13, accentColor: 'var(--cor-primaria)' }} />
                  Dia Fixo
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', userSelect: 'none', color: 'var(--texto-principal)' }}>
                  <input type="checkbox" disabled style={{ cursor: 'not-allowed', width: 13, height: 13 }} />
                  Último Dia Útil do Mês
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr auto 1fr', alignItems: 'center', gap: '6px 10px' }}>
                <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Venc. 1ª Parcela</label>
                <input type="date" value={geraVenc1} onChange={e => setGeraVenc1(e.target.value)}
                  style={{ padding: '2px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }} />

                <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Intervalo Vencimentos</label>
                <input type="number" min={1} value={geraIntervalo} onChange={e => setGeraIntervalo(e.target.value)}
                  style={{ padding: '2px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)', outline: 'none', textAlign: 'center' }} />

                <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Qtd. Parcelas</label>
                <input type="number" min={1} max={360} value={geraQtd} onChange={e => setGeraQtd(e.target.value)}
                  style={{ padding: '2px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)', outline: 'none', textAlign: 'center' }} />

                <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Juros Individual</label>
                <MoneyInput value={geraJurosInd} onValue={setGeraJurosInd} style={{ padding: '2px 6px' }} />

                <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Val. a Parcelar</label>
                <MoneyInput value={geraValor} onValue={setGeraValor} style={{ padding: '2px 6px' }} />

                <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <button type="button" onClick={gerarParcelas}
                    style={{ padding: '3px 16px', backgroundColor: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    + Gerar
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>
                    Total:&nbsp;
                    <strong style={{ fontFamily: 'var(--fonte-mono)' }}>
                      {parcelas.reduce((s, p) => s + p.valor + p.juros, 0)
                        .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </strong>
                  </span>
                </div>
              </div>
            </fieldset>

            {/* campos hidden para o form submit */}
            <input type="hidden" {...register('num_parcelas',   { valueAsNumber: true })} />
            <input type="hidden" {...register('intervalo_dias', { valueAsNumber: true })} />
            <input type="hidden" {...register('ind_avista')} />

            </div>
          </fieldset>
        )}

        {/* ══════════════════════════════ ABA RATEIO ══════════════════════════════ */}
        {aba === 'Rateio' && (() => {
          const valorTotal   = valorWatch || 0
          const valorRateado = rateios.reduce((s, r) => s + r.valor, 0)
          const valorDif     = Math.round((valorTotal - valorRateado) * 100) / 100

          function adicionarRateio() {
            if (!rateioCentroId || !rateioCentroNome) return
            const pct = parseFloat(rateioPct.replace(',', '.')) || 0
            const val = parseFloat(rateioVal.replace(',', '.')) || calcValorFromPct(pct)
            const partes = rateioCentroNome.split(' - ')
            const novas = [...rateios, {
              centro_custo_id: rateioCentroId,
              codigo: partes[0] ?? '',
              descricao: partes.slice(1).join(' - ') || rateioCentroNome,
              percentual: pct || calcPctFromValor(val),
              valor: val,
            }]
            setRateios(novas)
            setValue('centro_custo_id', rateioCentroId)
            setRateioCentroId(null); setRateioCentroNome(''); setRateioPct(''); setRateioVal('')
            setRateioIdx(null); setRateioEdicao(false)
          }

          function replicarParaGrupo() {
            if (!rateioCentroId) return
            const pct = parseFloat(rateioPct.replace(',', '.')) || 0
            const val = parseFloat(rateioVal.replace(',', '.')) || calcValorFromPct(pct)
            const partes = rateioCentroNome.split(' - ')
            const nova: RateioRow = {
              centro_custo_id: rateioCentroId,
              codigo: partes[0] ?? '',
              descricao: partes.slice(1).join(' - ') || rateioCentroNome,
              percentual: pct || calcPctFromValor(val),
              valor: val,
            }
            setRateios(prev => [...prev.filter(r => r.centro_custo_id !== rateioCentroId), nova])
            setValue('centro_custo_id', rateioCentroId)
            setRateioCentroId(null); setRateioCentroNome(''); setRateioPct(''); setRateioVal('')
            setRateioIdx(null)
          }

          function excluirRateio() {
            if (rateioIdx === null) return
            const novas = rateios.filter((_, i) => i !== rateioIdx)
            setRateios(novas)
            if (novas.length === 0) setValue('centro_custo_id', null)
            else setValue('centro_custo_id', novas[novas.length - 1].centro_custo_id)
            setRateioIdx(null); setRateioEdicao(false)
            setRateioCentroId(null); setRateioCentroNome(''); setRateioPct(''); setRateioVal('')
          }

          function selecionarRateio(i: number) {
            const r = rateios[i]
            setRateioIdx(i)
            setRateioCentroId(r.centro_custo_id)
            setRateioCentroNome(`${r.codigo} - ${r.descricao}`)
            setRateioPct(r.percentual.toFixed(2).replace('.', ','))
            setRateioVal(r.valor.toFixed(2).replace('.', ','))
          }

          function salvarRateio() {
            if (rateioIdx === null || !rateioCentroId) return
            const pct = parseFloat(rateioPct.replace(',', '.')) || 0
            const val = parseFloat(rateioVal.replace(',', '.')) || calcValorFromPct(pct)
            const partes = rateioCentroNome.split(' - ')
            const novas = rateios.map((r, i) => i === rateioIdx ? {
              centro_custo_id: rateioCentroId,
              codigo: partes[0] ?? '',
              descricao: partes.slice(1).join(' - ') || rateioCentroNome,
              percentual: pct || calcPctFromValor(val),
              valor: val,
            } : r)
            setRateios(novas)
            setRateioIdx(null); setRateioEdicao(false)
            setRateioCentroId(null); setRateioCentroNome(''); setRateioPct(''); setRateioVal('')
          }

          const inStyle: React.CSSProperties = { padding: '2px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }
          const lblStyle: React.CSSProperties = { fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }

          return (
            <fieldset className="form-fieldset">
              <legend>
                <PieChart size={12} /> Rateio de Centro de Custo
              </legend>
              <div className="form-fieldset-body">

              {tipoReceitaNatureza === 'A' && rateios.length === 0 && (
                <div style={{ padding: '8px 12px', marginBottom: 4, backgroundColor: 'var(--cor-aviso)18', border: '1px solid var(--cor-aviso)60', borderRadius: 4, fontSize: 12, color: 'var(--cor-aviso)', fontWeight: 500 }}>
                  ⚠ Tipo de receita <strong>Administrativa</strong> — é obrigatório informar ao menos um rateio de centro de custo antes de salvar.
                </div>
              )}
              {picker === 'centro_custo_rateio' && (
                <PickerModal<CentroCustoItem>
                  title="Centro de Custo"
                  url="/api/cadastro/centros-custo"
                  renderItem={c => <><span style={{ fontFamily: 'var(--fonte-mono)', marginRight: 8, color: 'var(--texto-terciario)' }}>{c.codigo}</span><strong>{c.descricao}</strong></>}
                  onSelect={c => { setRateioCentroId(c.id); setRateioCentroNome(`${c.codigo} - ${c.descricao}`); setPicker(null) }}
                  onClose={() => setPicker(null)}
                />
              )}

              {/* linha Centro */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={lblStyle}>Centro:</span>
                <input readOnly value={rateioCentroNome} onClick={() => setPicker('centro_custo_rateio')}
                  placeholder="Clique para selecionar..." style={{ ...inStyle, flex: 1, cursor: 'pointer' }} />
                <button type="button" onClick={() => setPicker('centro_custo_rateio')}
                  style={{ padding: '2px 7px', border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Search size={12} /></button>
              </div>

              {/* linha Rateio % / Valor / botões */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={lblStyle}>Rateio %:</span>
                <input type="text" value={rateioPct}
                  onChange={e => {
                    const pct = parseFloat(e.target.value.replace(',', '.')) || 0
                    setRateioPct(e.target.value)
                    setRateioVal(calcValorFromPct(pct).toFixed(2).replace('.', ','))
                  }}
                  style={{ ...inStyle, width: 70, textAlign: 'right', fontFamily: 'var(--fonte-mono)' }} />
                <span style={lblStyle}>Valor Rateio:</span>
                <input type="text" value={rateioVal}
                  onChange={e => {
                    const val = parseFloat(e.target.value.replace(',', '.')) || 0
                    setRateioVal(e.target.value)
                    setRateioPct(calcPctFromValor(val).toFixed(2).replace('.', ','))
                  }}
                  style={{ ...inStyle, width: 100, textAlign: 'right', fontFamily: 'var(--fonte-mono)' }} />
                <button type="button" onClick={replicarParaGrupo}
                  style={{ padding: '3px 10px', border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>
                  Replicar para Grupo
                </button>
                <div style={{ flex: 1 }} />
                <button type="button" title={rateioEdicao ? 'Salvar edição' : 'Adicionar'} onClick={rateioEdicao ? salvarRateio : adicionarRateio}
                  style={{ width: 26, height: 26, border: `1px solid ${rateioEdicao ? 'var(--cor-aviso)' : 'var(--borda-media)'}`, borderRadius: 3, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: rateioEdicao ? 14 : 16, color: rateioEdicao ? 'var(--cor-aviso)' : 'var(--cor-primaria)', fontWeight: 700 }}>{rateioEdicao ? '✔' : '+'}</button>
                <button type="button" title="Editar selecionado" disabled={rateioIdx === null}
                  onClick={() => { if (rateioIdx !== null) { selecionarRateio(rateioIdx); setRateioEdicao(true) } }}
                  style={{ width: 26, height: 26, border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', cursor: rateioIdx !== null ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, opacity: rateioIdx === null ? 0.35 : 1 }}>✎</button>
                <button type="button" title="Excluir selecionado" disabled={rateioIdx === null} onClick={excluirRateio}
                  style={{ width: 26, height: 26, border: '1px solid var(--cor-erro)40', borderRadius: 3, background: 'none', cursor: rateioIdx !== null ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--cor-erro)', opacity: rateioIdx === null ? 0.35 : 1 }}>🗑</button>
              </div>

              {/* Grid rateio */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, border: '1px solid var(--borda-media)' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-hover)' }}>
                    <th style={{ padding: '4px 8px', textAlign: 'left', width: 100, fontWeight: 600, color: 'var(--texto-secundario)', borderBottom: '1px solid var(--borda-media)' }}>Cód. Centro de Custo</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left',             fontWeight: 600, color: 'var(--texto-secundario)', borderBottom: '1px solid var(--borda-media)' }}>Centro de Custo</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right', width: 80, fontWeight: 600, color: 'var(--texto-secundario)', borderBottom: '1px solid var(--borda-media)' }}>%</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right', width: 100,fontWeight: 600, color: 'var(--texto-secundario)', borderBottom: '1px solid var(--borda-media)' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {rateios.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: '40px 8px', textAlign: 'center', color: 'var(--texto-terciario)', fontStyle: 'italic' }}>&lt;Sem dados&gt;</td></tr>
                  )}
                  {rateios.map((r, i) => (
                    <tr key={i} onClick={() => { setRateioIdx(i); setRateioEdicao(false); setRateioCentroId(null); setRateioCentroNome(''); setRateioPct(''); setRateioVal('') }}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--borda-suave)', background: rateioIdx === i ? 'var(--cor-primaria)18' : undefined }}
                      onMouseEnter={e => { if (rateioIdx !== i) e.currentTarget.style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = rateioIdx === i ? 'var(--cor-primaria)18' : '' }}>
                      <td style={{ padding: '4px 8px', fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)' }}>{r.codigo}</td>
                      <td style={{ padding: '4px 8px' }}>{r.descricao}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)' }}>{r.percentual.toFixed(2).replace('.', ',')}%</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 500 }}>{r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Rodapé: Valor a Ratear / Valor Rateado / Diferença */}
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '6px 2px', borderTop: '1px solid var(--borda-suave)', fontSize: 12 }}>
                <span style={lblStyle}>Valor a Ratear:</span>
                <input readOnly value={valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  style={{ ...inStyle, width: 110, textAlign: 'right', fontFamily: 'var(--fonte-mono)', background: 'var(--bg-hover)' }} />
                <span style={lblStyle}>Valor Rateado:</span>
                <input readOnly value={valorRateado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  style={{ ...inStyle, width: 110, textAlign: 'right', fontFamily: 'var(--fonte-mono)', background: 'var(--bg-hover)' }} />
                <span style={lblStyle}>Valor Diferença:</span>
                <input readOnly value={valorDif.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  style={{ ...inStyle, width: 110, textAlign: 'right', fontFamily: 'var(--fonte-mono)', background: 'var(--bg-hover)', color: Math.abs(valorDif) > 0.01 ? 'var(--cor-erro)' : 'var(--cor-sucesso)' }} />
              </div>

              </div>
            </fieldset>
          )
        })()}
        </div>
      </form>
    </>
  )
}
