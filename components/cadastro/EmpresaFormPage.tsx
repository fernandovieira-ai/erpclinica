'use client'

import { forwardRef, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Search, Plus, X } from 'lucide-react'
import { empresaSchema, type EmpresaInput } from '@/lib/validators/empresa.schema'
import type { Empresa } from '@/types/cadastros.types'

interface Props { empresa?: Empresa }

const REGIMES = [{ v: 'SN', l: 'Simples Nacional' }, { v: 'LP', l: 'Lucro Presumido' }, { v: 'LR', l: 'Lucro Real' }]
const CRTS    = [{ v: '1', l: '1 - Simples Nacional' }, { v: '2', l: '2 - Simples Excesso' }, { v: '3', l: '3 - Regime Normal' }, { v: '4', l: '4 - MEI' }]

// ── Primitivos de UI ──────────────────────────────────────────────────────────

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, onBlur, onFocus, onChange, type, ...props }, ref) {
    const isText = type !== 'email' && type !== 'number' && type !== 'date'
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

const Check = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string }>(
  function Check({ label, ...props }, ref) {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
        color: 'var(--texto-principal)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <input ref={ref} type="checkbox" {...props} style={{ cursor: 'pointer' }} />
        {label}
      </label>
    )
  }
)

// Row: Label (120px) | Conteúdo
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

// Botão de busca/lupa inline
function BtnBusca({ onClick, loading, title }: { onClick: () => void; loading?: boolean; title?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, flexShrink: 0,
        background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
        cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1,
        color: 'var(--texto-secundario)',
      }}>
      <Search size={12} />
    </button>
  )
}

function mascaraCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

// ── Abas disponíveis ─────────────────────────────────────────────────────────
const ABAS = [
  'Principal',
  'Faturamento',
] as const
type Aba = typeof ABAS[number]

// ── Componente principal ──────────────────────────────────────────────────────

export default function EmpresaFormPage({ empresa }: Props) {
  const router  = useRouter()
  const [saving,       setSaving]      = useState(false)
  const [deleting,     setDeleting]    = useState(false)
  const [excluding,    setExcluding]   = useState(false)
  const [aba,          setAba]         = useState<Aba>('Principal')
  const [buscandoCep,  setBuscandoCep]  = useState(false)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [displayCnpj,  setDisplayCnpj]  = useState('')
  const [tiposCobranca, setTiposCobranca] = useState<{ cod_tipo_cobranca: number; des_tipo_cobranca: string }[]>([])

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<EmpresaInput>({
    resolver: zodResolver(empresaSchema),
    defaultValues: {
      ativo: true, regime_tributario: 'SN', crt: '1', ambiente_nfe: '2',
      serie_nfe: '001', prox_num_nfe: 1, serie_nfce: '001', prox_num_nfce: 1,
    },
  })

  useEffect(() => {
    fetch('/api/cadastro/formas-pagamento?ativo=true&limit=200')
      .then(r => r.json())
      .then(d => setTiposCobranca(d.dados ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!empresa) return
    const rawCnpj = (empresa.cnpj ?? '').replace(/\D/g, '')
    setDisplayCnpj(mascaraCnpj(rawCnpj))
    reset({
      razao_social:      empresa.razao_social,
      nome_fantasia:     empresa.nome_fantasia ?? '',
      cnpj:              rawCnpj,
      ie:                empresa.ie ?? '',
      im:                empresa.im ?? '',
      regime_tributario: (empresa.regime_tributario ?? 'SN') as 'SN' | 'LP' | 'LR',
      crt:               (empresa.crt ?? '1') as '1' | '2' | '3' | '4',
      cep:               empresa.cep ?? '',
      logradouro:        empresa.logradouro ?? '',
      numero:            empresa.numero ?? '',
      complemento:       empresa.complemento ?? '',
      bairro:            empresa.bairro ?? '',
      cidade:            empresa.cidade ?? '',
      uf:                empresa.uf ?? '',
      cod_ibge:          empresa.cod_ibge ?? '',
      telefone:          empresa.telefone ?? '',
      email:             empresa.email ?? '',
      email_nfe:         empresa.email_nfe ?? '',
      ambiente_nfe:      (empresa.ambiente_nfe ?? '2') as '1' | '2',
      serie_nfe:         empresa.serie_nfe ?? '001',
      prox_num_nfe:      empresa.prox_num_nfe ?? 1,
      serie_nfce:        empresa.serie_nfce ?? '001',
      prox_num_nfce:     empresa.prox_num_nfce ?? 1,
      csc_nfce:          empresa.csc_nfce ?? '',
      id_token_nfce:     empresa.id_token_nfce ?? '',
      cod_tipo_cobranca: empresa.cod_tipo_cobranca ?? null,
      ativo:             empresa.ativo,
    })
  }, [empresa, reset])

  async function buscarCep() {
    const cep = watch('cep')?.replace(/\D/g, '')
    if (cep?.length !== 8) { toast.error('CEP inválido'); return }
    setBuscandoCep(true)
    try {
      const res = await fetch(`/api/util/cep/${cep}`)
      const d   = await res.json()
      if (!res.ok) { toast.error(d.erro ?? 'CEP não encontrado'); return }
      setValue('logradouro', d.logradouro)
      setValue('bairro',     d.bairro)
      setValue('cidade',     d.cidade)
      setValue('uf',         d.uf)
      toast.success('Endereço preenchido')
    } catch { toast.error('Erro ao buscar CEP') }
    finally  { setBuscandoCep(false) }
  }

  async function buscarCnpj() {
    const cnpj = (watch('cnpj') ?? '').replace(/\D/g, '')
    if (!cnpj || cnpj.length !== 14) { toast.error('Digite o CNPJ completo antes de buscar'); return }
    setBuscandoCnpj(true)
    try {
      const res = await fetch(`/api/util/cnpj/${cnpj}`)
      const d   = await res.json()
      if (!res.ok) { toast.error(d.erro ?? 'CNPJ não encontrado'); return }
      if (d.razao_social)  setValue('razao_social',  d.razao_social)
      if (d.nome_fantasia) setValue('nome_fantasia',  d.nome_fantasia)
      if (d.cep)         setValue('cep',         d.cep)
      if (d.logradouro)  setValue('logradouro',  d.logradouro)
      if (d.numero)      setValue('numero',  d.numero)
      if (d.complemento) setValue('complemento', d.complemento)
      if (d.bairro)      setValue('bairro',      d.bairro)
      if (d.cidade)      setValue('cidade',      d.cidade)
      if (d.uf)          setValue('uf',          d.uf)
      if (d.telefone)    setValue('telefone',    d.telefone)
      if (d.email)       setValue('email',       d.email)
      setDisplayCnpj(mascaraCnpj(cnpj))
      toast.success('Dados da Receita Federal preenchidos')
    } catch { toast.error('Erro ao consultar CNPJ') }
    finally  { setBuscandoCnpj(false) }
  }

  async function onSubmit(data: EmpresaInput) {
    setSaving(true)
    try {
      const url    = empresa ? `/api/cadastro/empresas/${empresa.id}` : '/api/cadastro/empresas'
      const method = empresa ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(empresa ? 'Empresa atualizada!' : 'Empresa cadastrada!')
      if (!empresa) router.push(`/configuracoes/empresas/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function desativar() {
    if (!empresa || !confirm(`Desativar "${empresa.razao_social}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/cadastro/empresas/${empresa.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: false }),
      })
      toast.success('Empresa desativada')
      router.push('/configuracoes/empresas')
    } finally { setDeleting(false) }
  }

  async function excluir() {
    if (!empresa || !confirm(`Excluir permanentemente "${empresa.razao_social}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluding(true)
    try {
      const res = await fetch(`/api/cadastro/empresas/${empresa.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir — verifique se não há vínculos'); return }
      toast.success('Empresa excluída')
      router.push('/configuracoes/empresas')
    } finally { setExcluding(false) }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Barra de ferramentas ─────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px',
        backgroundColor: 'var(--bg-card)',
        borderBottom: '1px solid var(--borda-media)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <button type="button" onClick={() => router.push('/configuracoes/empresas')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
            fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <ArrowLeft size={13} /> Voltar
        </button>

        <div style={{ width: 1, height: 18, backgroundColor: 'var(--borda-media)', margin: '0 4px' }} />

        <button type="button" onClick={() => router.push('/configuracoes/empresas/novo')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
            fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <Plus size={13} /> Nova Empresa
        </button>

        <button type="submit" disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px',
            background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3,
            fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
            opacity: saving ? 0.7 : 1 }}>
          <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
        </button>

        {empresa && (
          <button type="button" onClick={desativar} disabled={deleting}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3,
              fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)' }}>
            <Trash2 size={13} /> Desativar
          </button>
        )}

        {empresa && (
          <button type="button" onClick={excluir} disabled={excluding}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              background: 'var(--cor-erro)', color: '#fff', border: 'none', borderRadius: 3,
              fontSize: 12, cursor: excluding ? 'not-allowed' : 'pointer',
              opacity: excluding ? 0.7 : 1 }}>
            <X size={13} /> {excluding ? 'Excluindo...' : 'Excluir'}
          </button>
        )}

        {empresa && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--texto-terciario)' }}>
            #{empresa.id} — {empresa.ativo ? 'Ativa' : 'Inativa'}
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
          const ativa    = aba === t
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
          <>
            {/* Linha: Código | Número | CNPJ */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Código:</label>
              <input
                readOnly
                value={empresa?.id ?? ''}
                style={{ width: 70, padding: '3px 6px', backgroundColor: 'var(--bg-page)',
                  color: 'var(--texto-terciario)', border: '1px solid var(--borda-suave)',
                  borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)' }}
              />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', marginLeft: 8 }}>Número:</label>
              <Input {...register('numero')} style={{ width: 70, fontFamily: 'var(--fonte-mono)' }} />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', marginLeft: 8 }}>CNPJ:</label>
              <Input
                ref={register('cnpj').ref}
                name={register('cnpj').name}
                onBlur={register('cnpj').onBlur}
                value={displayCnpj}
                placeholder="00.000.000/0001-00"
                style={{ width: 160, fontFamily: 'var(--fonte-mono)' }}
                onChange={e => {
                  const raw    = e.target.value.replace(/\D/g, '')
                  const masked = mascaraCnpj(raw)
                  setDisplayCnpj(masked)
                  setValue('cnpj', raw, { shouldValidate: false })
                }}
              />
              <BtnBusca onClick={buscarCnpj} loading={buscandoCnpj} title="Buscar na Receita Federal" />
            </div>

            {/* Razão Social */}
            <Row label="Razão Social:">
              <Input {...register('razao_social')}
                style={{ border: errors.razao_social ? '1px solid var(--cor-erro)' : undefined }} />
              {errors.razao_social && (
                <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.razao_social.message}</span>
              )}
            </Row>

            {/* Nome Fantasia */}
            <Row label="Nome Fantasia:">
              <Input {...register('nome_fantasia')} />
            </Row>

            {/* IE | IM */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', width: 120, textAlign: 'right' }}>I. Estadual:</label>
              <Input {...register('ie')} style={{ width: 160, fontFamily: 'var(--fonte-mono)' }} />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', marginLeft: 8 }}>I.Mun.:</label>
              <Input {...register('im')} style={{ width: 140, fontFamily: 'var(--fonte-mono)' }} />
            </div>

            {/* Regime Tributário | CRT */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', width: 120, textAlign: 'right' }}>Regime Trib.:</label>
              <Select {...register('regime_tributario')} style={{ width: 180 }}>
                {REGIMES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
              </Select>
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', marginLeft: 8 }}>CRT:</label>
              <Select {...register('crt')} style={{ width: 200 }}>
                {CRTS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
              </Select>
            </div>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

            {/* CEP | Cidade */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', width: 120, textAlign: 'right' }}>CEP:</label>
              <Input {...register('cep')} style={{ width: 90, fontFamily: 'var(--fonte-mono)' }} placeholder="00000-000" />
              <BtnBusca onClick={buscarCep} loading={buscandoCep} title="Buscar endereço pelo CEP" />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', marginLeft: 8 }}>Cidade:</label>
              <Input {...register('cidade')} style={{ flex: 1 }} />
              <Input {...register('uf')} style={{ width: 36 }} placeholder="UF" />
            </div>

            {/* Logradouro */}
            <Row label="Logradouro:">
              <Input {...register('logradouro')} />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Nº:</label>
              <Input {...register('numero')} style={{ width: 60 }} />
            </Row>

            {/* Complemento | Bairro */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', width: 120, textAlign: 'right' }}>Complemento:</label>
              <Input {...register('complemento')} style={{ flex: 1 }} />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', marginLeft: 8 }}>Bairro:</label>
              <Input {...register('bairro')} style={{ flex: 1 }} />
            </div>

            {/* Telefone */}
            <Row label="Telefone:">
              <Input {...register('telefone')} style={{ width: 150, fontFamily: 'var(--fonte-mono)' }} placeholder="(  )      -    " />
            </Row>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '2px 0' }} />

            {/* Email | Email NF-e */}
            <Row label="Email:">
              <Input type="email" {...register('email')} />
            </Row>
            <Row label="Email NF-e:">
              <Input type="email" {...register('email_nfe')} />
            </Row>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

            {/* Ativo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingLeft: 126 }}>
              <Check label="Empresa Ativa" {...register('ativo')} />
            </div>
          </>
        )}

        {aba === 'Faturamento' && (
          <>
            {/* Tipo de Cobrança Padrão */}
            <Row label="Tipo Cobrança:">
              <Select
                value={watch('cod_tipo_cobranca') ?? ''}
                onChange={e => setValue('cod_tipo_cobranca', e.target.value ? Number(e.target.value) : null)}
                style={{ width: 280 }}
              >
                <option value="">— Nenhum —</option>
                {tiposCobranca.map(tc => (
                  <option key={tc.cod_tipo_cobranca} value={tc.cod_tipo_cobranca}>
                    {tc.des_tipo_cobranca}
                  </option>
                ))}
              </Select>
            </Row>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

            {/* Ambiente */}
            <Row label="Ambiente:">
              <Select {...register('ambiente_nfe')} style={{ width: 200 }}>
                <option value="2">2 - Homologação</option>
                <option value="1">1 - Produção</option>
              </Select>
            </Row>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

            {/* NF-e */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', width: 120, textAlign: 'right' }}>Série NF-e:</label>
              <Input {...register('serie_nfe')} style={{ width: 60, fontFamily: 'var(--fonte-mono)' }} />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', marginLeft: 8 }}>Próx. Número:</label>
              <input type="number" min={1} {...register('prox_num_nfe', { valueAsNumber: true })}
                style={{ width: 90, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                  border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)', outline: 'none' }} />
            </div>

            {/* NFC-e */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', width: 120, textAlign: 'right' }}>Série NFC-e:</label>
              <Input {...register('serie_nfce')} style={{ width: 60, fontFamily: 'var(--fonte-mono)' }} />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', marginLeft: 8 }}>Próx. Número:</label>
              <input type="number" min={1} {...register('prox_num_nfce', { valueAsNumber: true })}
                style={{ width: 90, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                  border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, fontFamily: 'var(--fonte-mono)', outline: 'none' }} />
            </div>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

            {/* CSC / ID Token NFC-e */}
            <Row label="CSC NFC-e:">
              <Input {...register('csc_nfce')} style={{ width: 300, fontFamily: 'var(--fonte-mono)', textTransform: 'none' }} />
            </Row>
            <Row label="ID Token NFC-e:">
              <Input {...register('id_token_nfce')} style={{ width: 80, fontFamily: 'var(--fonte-mono)' }} />
            </Row>

            <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

            {/* Validade certificado */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap', width: 120, textAlign: 'right' }}>Val. Certificado:</label>
              <input type="date" {...register('cert_validade')}
                readOnly
                style={{ padding: '3px 6px', backgroundColor: 'var(--bg-page)', color: 'var(--texto-terciario)',
                  border: '1px solid var(--borda-suave)', borderRadius: 3, fontSize: 12, outline: 'none' }} />
              <span style={{ fontSize: 11, color: 'var(--texto-terciario)', marginLeft: 6 }}>Upload do certificado via painel admin</span>
            </div>
          </>
        )}

        {aba !== 'Principal' && aba !== 'Faturamento' && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--texto-terciario)', fontSize: 13 }}>
            Aba <strong>{aba}</strong> ainda não implementada.
          </div>
        )}
      </div>
    </form>
  )
}
