'use client'

import { forwardRef, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Search, Plus, X } from 'lucide-react'
import { pessoaSchema, type PessoaInput } from '@/lib/validators/pessoa.schema'
import type { Pessoa } from '@/types/cadastros.types'
import MoneyInput from '@/components/ui/MoneyInput'

interface Props { pessoa?: Pessoa; papelInicial?: string }

const UFS: { sigla: string; nome: string }[] = [
  { sigla: 'AC', nome: 'ACRE' },
  { sigla: 'AL', nome: 'ALAGOAS' },
  { sigla: 'AP', nome: 'AMAPA' },
  { sigla: 'AM', nome: 'AMAZONAS' },
  { sigla: 'BA', nome: 'BAHIA' },
  { sigla: 'CE', nome: 'CEARA' },
  { sigla: 'DF', nome: 'DISTRITO FEDERAL' },
  { sigla: 'ES', nome: 'ESPIRITO SANTO' },
  { sigla: 'GO', nome: 'GOIAS' },
  { sigla: 'MA', nome: 'MARANHAO' },
  { sigla: 'MT', nome: 'MATO GROSSO' },
  { sigla: 'MS', nome: 'MATO GROSSO DO SUL' },
  { sigla: 'MG', nome: 'MINAS GERAIS' },
  { sigla: 'PA', nome: 'PARA' },
  { sigla: 'PB', nome: 'PARAIBA' },
  { sigla: 'PR', nome: 'PARANA' },
  { sigla: 'PE', nome: 'PERNAMBUCO' },
  { sigla: 'PI', nome: 'PIAUI' },
  { sigla: 'RJ', nome: 'RIO DE JANEIRO' },
  { sigla: 'RN', nome: 'RIO GRANDE DO NORTE' },
  { sigla: 'RS', nome: 'RIO GRANDE DO SUL' },
  { sigla: 'RO', nome: 'RONDONIA' },
  { sigla: 'RR', nome: 'RORAIMA' },
  { sigla: 'SC', nome: 'SANTA CATARINA' },
  { sigla: 'SP', nome: 'SAO PAULO' },
  { sigla: 'SE', nome: 'SERGIPE' },
  { sigla: 'TO', nome: 'TOCANTINS' },
]

// Linha de formulário estilo ERP: Label: [campo]
function FormRow({ label, children, fullWidth }: { label: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: fullWidth ? '1fr' : '110px 1fr',
      alignItems: 'center',
      gap: '2px 6px',
      minHeight: 26,
    }}>
      {!fullWidth && (
        <label style={{
          textAlign: 'right', fontSize: 12,
          color: 'var(--texto-secundario)', whiteSpace: 'nowrap',
          paddingRight: 2,
        }}>
          {label}
        </label>
      )}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

// Input compacto estilo ERP — usa forwardRef para compatibilidade com react-hook-form
const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, onBlur, onFocus, onChange, type, ...props }, ref) {
    // 'search' = chave_pix, 'date' = datas — ambos não devem ser convertidos p/ maiúsculas
    const isText = type !== 'email' && type !== 'number' && type !== 'search' && type !== 'date'
    return (
      <input
        ref={ref}
        type={type === 'search' ? 'text' : type}
        {...props}
        style={{
          width: '100%', padding: '3px 6px',
          backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
          border: '1px solid var(--borda-media)', borderRadius: 3,
          fontSize: 12, fontFamily: 'var(--fonte-sans)',
          outline: 'none',
          textTransform: isText ? 'uppercase' : 'none',
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
  }
)

// Select compacto — usa forwardRef para compatibilidade com react-hook-form
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
  }
)

// Checkbox estilo ERP
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

// Seção com borda e título (estilo fieldset ERP)
function Secao({ titulo, children, style }: { titulo: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <fieldset style={{
      border: '1px solid var(--borda-media)', borderRadius: 4,
      padding: '6px 10px 10px', margin: 0, ...style,
    }}>
      <legend style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)',
        padding: '0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {titulo}
      </legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </fieldset>
  )
}

function mascaraCpfCnpj(valor: string, pj: boolean): string {
  const d = valor.replace(/\D/g, '').slice(0, pj ? 14 : 11)
  if (pj) {
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

const ABAS_PESSOA = ['Principal', 'Financeiro', 'Fiscal / Obs'] as const

export default function PessoaFormPage({ pessoa, papelInicial }: Props) {
  const router  = useRouter()
  const [saving,       setSaving]      = useState(false)
  const [deleting,     setDeleting]    = useState(false)
  const [excluding,    setExcluding]   = useState(false)
  const [aba,          setAba]         = useState<'Principal' | 'Financeiro' | 'Fiscal / Obs'>('Principal')
  const [buscandoCep,  setBuscandoCep]  = useState(false)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { errors } } = useForm<PessoaInput>({
    resolver: zodResolver(pessoaSchema),
    defaultValues: {
      tipo_pessoa: 'F', cpf_cnpj: '', data_nascimento: '', cep: '',
      ind_cliente: false, ind_fornecedor: false,
      ind_banco: false, ind_transportador: false,
      ind_paciente: papelInicial === 'paciente', ind_profissional: papelInicial === 'profissional',
      limite_credito: 0, contribuinte_icms: false, optante_simples: false,
    },
  })

  useEffect(() => {
    if (!pessoa) return
    const rawDoc = (pessoa.cpf_cnpj ?? '').replace(/\D/g, '')
    reset({
      tipo_pessoa:       pessoa.tipo_pessoa,
      nome:              pessoa.nome,
      nome_fantasia:     pessoa.nome_fantasia ?? '',
      cpf_cnpj:          mascaraCpfCnpj(rawDoc, pessoa.tipo_pessoa === 'J'),
      data_nascimento:   pessoa.data_nascimento
                           ? String(pessoa.data_nascimento).slice(0, 10)
                           : '',
      rg_ie:             pessoa.rg_ie ?? '',
      im:                pessoa.im ?? '',
      ind_cliente:       pessoa.ind_cliente,
      ind_fornecedor:    pessoa.ind_fornecedor,
      ind_banco:         pessoa.ind_banco,
      ind_transportador: pessoa.ind_transportador,
      ind_paciente:      pessoa.ind_paciente,
      ind_profissional:  pessoa.ind_profissional,
      cep:               pessoa.cep ?? '',
      logradouro:        pessoa.logradouro ?? '',
      numero:            pessoa.numero ?? '',
      complemento:       pessoa.complemento ?? '',
      bairro:            pessoa.bairro ?? '',
      cidade:            pessoa.cidade ?? '',
      uf:                pessoa.uf ?? '',
      telefone:          pessoa.telefone ?? '',
      celular:           pessoa.celular ?? '',
      whatsapp:          pessoa.whatsapp ?? '',
      email:             pessoa.email ?? '',
      email_nfe:         pessoa.email_nfe ?? '',
      limite_credito:    Number(pessoa.limite_credito),
      banco_nome:        pessoa.banco_nome ?? '',
      banco_agencia:     pessoa.banco_agencia ?? '',
      banco_conta:       pessoa.banco_conta ?? '',
      banco_tipo:        pessoa.banco_tipo ?? undefined,
      chave_pix:         pessoa.chave_pix ?? '',
      contribuinte_icms: pessoa.contribuinte_icms,
      optante_simples:   pessoa.optante_simples,
      obs:               pessoa.obs ?? '',
    })
  }, [pessoa, reset])

  const tipoPessoaWatched = watch('tipo_pessoa')
  const bancoTipoWatched = watch('banco_tipo')

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
    const cnpj = (watch('cpf_cnpj') ?? '').replace(/\D/g, '')
    if (!cnpj || cnpj.length !== 14) { toast.error('Digite o CNPJ completo (14 dígitos) antes de buscar'); return }
    setBuscandoCnpj(true)
    try {
      const res = await fetch(`/api/util/cnpj/${cnpj}`)
      const d   = await res.json()
      if (!res.ok) { toast.error(d.erro ?? 'CNPJ não encontrado'); return }

      // Dados da empresa
      if (d.razao_social)  setValue('nome',          d.razao_social)
      if (d.nome_fantasia) setValue('nome_fantasia',  d.nome_fantasia)

      // Endereço
      if (d.cep)         setValue('cep',         d.cep)
      if (d.logradouro)  setValue('logradouro',  d.logradouro)
      if (d.numero)      setValue('numero',      d.numero)
      if (d.complemento) setValue('complemento', d.complemento)
      if (d.bairro)      setValue('bairro',      d.bairro)
      if (d.cidade)      setValue('cidade',      d.cidade)
      if (d.uf)          setValue('uf',          d.uf)

      // Contato
      if (d.telefone) setValue('telefone', d.telefone)
      if (d.email)    setValue('email',    d.email)

      // Fiscal
      if (d.optante_simples) setValue('optante_simples', true)

      toast.success(`Dados da Receita Federal preenchidos${d.situacao ? ` — ${d.situacao}` : ''}`)
    } catch { toast.error('Erro ao consultar CNPJ') }
    finally  { setBuscandoCnpj(false) }
  }

  async function onSubmit(data: PessoaInput) {
    setSaving(true)
    try {
      const payload = { ...data, cpf_cnpj: (data.cpf_cnpj ?? '').replace(/\D/g, '') || null }
      console.log('[PessoaForm] onSubmit payload:', JSON.stringify(payload, null, 2))
      const url    = pessoa ? `/api/cadastro/pessoas/${pessoa.id}` : '/api/cadastro/pessoas'
      const method = pessoa ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(pessoa ? 'Pessoa atualizada!' : 'Pessoa cadastrada!')
      if (!pessoa) router.push(`/cadastro/pessoas/${json.id}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function desativar() {
    if (!pessoa || !confirm(`Desativar "${pessoa.nome}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/cadastro/pessoas/${pessoa.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: false }),
      })
      toast.success('Pessoa desativada')
      router.push('/cadastro/pessoas')
    } finally { setDeleting(false) }
  }

  async function excluir() {
    if (!pessoa || !confirm(`Excluir permanentemente "${pessoa.nome}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluding(true)
    try {
      const res = await fetch(`/api/cadastro/pessoas/${pessoa.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir — verifique se não há vínculos'); return }
      toast.success('Pessoa excluída')
      router.push('/cadastro/pessoas')
    } finally { setExcluding(false) }
  }

  const tipoPessoa = tipoPessoaWatched
  const pj = tipoPessoa === 'J'

  return (
    <form onSubmit={handleSubmit(onSubmit, (erros) => {
        console.warn('[PessoaForm] Erros de validação:', erros)
        const mensagens = Object.entries(erros)
          .map(([campo, e]) => `${campo}: ${(e as { message?: string }).message ?? 'inválido'}`)
          .join('; ')
        toast.error(`Corrija os campos: ${mensagens}`)
      })} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Barra de ferramentas ─────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px',
        backgroundColor: 'var(--bg-card)',
        borderBottom: '1px solid var(--borda-media)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <button type="button" onClick={() => router.push('/cadastro/pessoas')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
            fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <ArrowLeft size={13} /> Voltar
        </button>

        <div style={{ width: 1, height: 18, backgroundColor: 'var(--borda-media)', margin: '0 4px' }} />

        <button type="button" onClick={() => router.push('/cadastro/pessoas/novo')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
            fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <Plus size={13} /> Nova Pessoa
        </button>

        <button type="submit" disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px',
            background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3,
            fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
            opacity: saving ? 0.7 : 1 }}>
          <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
        </button>

        {pessoa && (
          <button type="button" onClick={desativar} disabled={deleting}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3,
              fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)' }}>
            <Trash2 size={13} /> Desativar
          </button>
        )}

        {pessoa && (
          <button type="button" onClick={excluir} disabled={excluding}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              background: 'var(--cor-erro)', color: '#fff', border: 'none', borderRadius: 3,
              fontSize: 12, cursor: excluding ? 'not-allowed' : 'pointer',
              opacity: excluding ? 0.7 : 1 }}>
            <X size={13} /> {excluding ? 'Excluindo...' : 'Excluir'}
          </button>
        )}

        {pessoa && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--texto-terciario)' }}>
            #{pessoa.id} — {pessoa.ativo ? 'Ativo' : 'Inativo'}
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
        {ABAS_PESSOA.map(t => {
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

      {/* ── Corpo do formulário ──────────────────────────────── */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1 }}>

        {aba === 'Principal' && (<>
        {/* ══ SEÇÃO PRINCIPAL ════════════════════════════════════ */}
        <Secao titulo="Principal">

          {/* Capa */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>

            {/* Coluna esquerda — Nome + Natureza */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <FormRow label="Nome:">
                <Input {...register('nome')}
                  style={{ border: errors.nome ? '1px solid var(--cor-erro)' : undefined }} />
              </FormRow>
              {errors.nome && <span style={{ fontSize: 11, color: 'var(--cor-erro)', paddingLeft: 116 }}>{errors.nome.message}</span>}
              <FormRow label="Nome Fantasia:">
                <Input {...register('nome_fantasia')} />
              </FormRow>

              {/* Natureza */}
              <div style={{ display: 'flex', gap: 16, paddingLeft: 116, marginTop: 2 }}>
                <fieldset style={{ border: '1px solid var(--borda-suave)', borderRadius: 3, padding: '4px 8px' }}>
                  <legend style={{ fontSize: 10, color: 'var(--texto-terciario)', padding: '0 4px' }}>Natureza</legend>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {[{ v: 'F', l: 'Física' }, { v: 'J', l: 'Jurídica' }].map(({ v, l }) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input type="radio" value={v} {...register('tipo_pessoa', { onChange: () => setValue('cpf_cnpj', '') })} /> {l}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </div>

            {/* Coluna direita — Identificação */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <FormRow label={pj ? 'CNPJ:' : 'CPF:'}>
                <Input
                  {...register('cpf_cnpj')}
                  placeholder={pj ? '00.000.000/0001-00' : '000.000.000-00'}
                  style={{ fontFamily: 'var(--fonte-mono)' }}
                  onChange={e => {
                    const masked = mascaraCpfCnpj(e.target.value, pj)
                    setValue('cpf_cnpj', masked, { shouldValidate: false })
                  }}
                />
                {pj && (
                  <button
                    type="button"
                    onClick={buscarCnpj}
                    disabled={buscandoCnpj}
                    title="Buscar dados na Receita Federal"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '3px 8px', whiteSpace: 'nowrap',
                      background: 'none', border: '1px solid var(--borda-media)',
                      borderRadius: 3, fontSize: 11, cursor: buscandoCnpj ? 'not-allowed' : 'pointer',
                      color: buscandoCnpj ? 'var(--texto-terciario)' : 'var(--cor-primaria)',
                      opacity: buscandoCnpj ? 0.6 : 1,
                    }}
                  >
                    <Search size={11} />
                    {buscandoCnpj ? 'Buscando...' : 'Receita Federal'}
                  </button>
                )}
              </FormRow>
              {!pj && (
                <FormRow label="Dt. Nasc.:">
                  <Input type="date" {...register('data_nascimento')}
                    style={{ width: 140, fontFamily: 'var(--fonte-mono)' }} />
                </FormRow>
              )}
              <FormRow label={pj ? 'IE-ST:' : 'RG:'}>
                <Input {...register('rg_ie')} />
              </FormRow>
              {pj && (
                <FormRow label="I.M.:">
                  <Input {...register('im')} />
                </FormRow>
              )}
            </div>
          </div>

          {/* Separador */}
          <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

          {/* Endereço + Contato — 2 colunas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>

            {/* Endereço */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <FormRow label="CEP:">
                <Input {...register('cep')} style={{ width: 90, fontFamily: 'var(--fonte-mono)' }} placeholder="00000-000" />
                <button
                  type="button"
                  onClick={buscarCep}
                  disabled={buscandoCep}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
                    background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
                    fontSize: 11, cursor: buscandoCep ? 'not-allowed' : 'pointer',
                    color: buscandoCep ? 'var(--texto-terciario)' : 'var(--texto-secundario)',
                    whiteSpace: 'nowrap', opacity: buscandoCep ? 0.6 : 1,
                  }}
                >
                  <Search size={11} /> {buscandoCep ? 'Buscando...' : 'Buscar'}
                </button>
              </FormRow>
              <FormRow label="Logradouro:">
                <Input {...register('logradouro')} />
              </FormRow>
              <FormRow label="Número:">
                <Input {...register('numero')} style={{ width: 70 }} />
                <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Compl.:</label>
                <Input {...register('complemento')} />
              </FormRow>
              <FormRow label="Bairro:">
                <Input {...register('bairro')} />
              </FormRow>
              <FormRow label="Cidade:">
                <Input {...register('cidade')} style={{ flex: 1 }} />
              </FormRow>
              <FormRow label="UF:">
                <Select {...register('uf')} style={{ width: 200 }}>
                  <option value="">—</option>
                  {UFS.map(u => <option key={u.sigla} value={u.sigla}>{u.nome}</option>)}
                </Select>
              </FormRow>
            </div>

            {/* Contato */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <FormRow label="Telefone:">
                <Input {...register('telefone')} placeholder="(  )      -    "
                  style={{ fontFamily: 'var(--fonte-mono)', width: 150 }} />
              </FormRow>
              <FormRow label="Celular:">
                <Input {...register('celular')} placeholder="(  )      -    "
                  style={{ fontFamily: 'var(--fonte-mono)', width: 150 }} />
              </FormRow>
              <FormRow label="WhatsApp:">
                <Input {...register('whatsapp')} placeholder="(  )      -    "
                  style={{ fontFamily: 'var(--fonte-mono)', width: 150 }} />
              </FormRow>
              <FormRow label="E-mail:">
                <Input type="email" {...register('email')} />
              </FormRow>
              <FormRow label="E-mail NF-e:">
                <Input type="email" {...register('email_nfe')} />
              </FormRow>
            </div>
          </div>
        </Secao>

        {/* ══ CLASSIFICAÇÃO ══════════════════════════════════════ */}
        <Secao titulo="Classificação">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', padding: '4px 0' }}>
            <Check label="Cliente"       checked={!!watch('ind_cliente')}       onChange={e => setValue('ind_cliente',       e.target.checked)} />
            <Check label="Fornecedor"    checked={!!watch('ind_fornecedor')}    onChange={e => setValue('ind_fornecedor',    e.target.checked)} />
            <Check label="Banco / Fin."  checked={!!watch('ind_banco')}         onChange={e => setValue('ind_banco',         e.target.checked)} />
            <Check label="Transportador" checked={!!watch('ind_transportador')} onChange={e => setValue('ind_transportador', e.target.checked)} />
            <Check label="Paciente"      checked={!!watch('ind_paciente')}      onChange={e => setValue('ind_paciente',      e.target.checked)} />
            <Check label="Profissional"  checked={!!watch('ind_profissional')}  onChange={e => setValue('ind_profissional',  e.target.checked)} />
          </div>
        </Secao>
        </>)}

        {aba === 'Financeiro' && (
          <Secao titulo="Financeiro">
            <FormRow label="Lim. Crédito:">
              <MoneyInput value={watch('limite_credito')} onValue={n => setValue('limite_credito', n)} style={{ width: 130 }} />
            </FormRow>
            <FormRow label="Banco:">
              <Input {...register('banco_nome')} />
            </FormRow>
            <FormRow label="Agência:">
              <Input {...register('banco_agencia')} style={{ width: 80, fontFamily: 'var(--fonte-mono)' }} />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Conta:</label>
              <Input {...register('banco_conta')} style={{ fontFamily: 'var(--fonte-mono)' }} />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Tipo:</label>
              {[{ v: 'C', l: 'Corrente' }, { v: 'P', l: 'Poupança' }].map(({ v, l }) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="radio" value={v} {...register('banco_tipo')} checked={bancoTipoWatched === v} onChange={() => setValue('banco_tipo', v as 'C' | 'P')} /> {l}
                </label>
              ))}
            </FormRow>
            <FormRow label="Chave PIX:">
              <Input {...register('chave_pix')} type="search" />
            </FormRow>
          </Secao>
        )}

        {aba === 'Fiscal / Obs' && (
          <Secao titulo="Fiscal / Observações">
            <div style={{ display: 'flex', gap: 20, paddingLeft: 4 }}>
              <Check label="Contribuinte de ICMS"         checked={!!watch('contribuinte_icms')} onChange={e => setValue('contribuinte_icms', e.target.checked)} />
              <Check label="Optante pelo Simples Nacional" checked={!!watch('optante_simples')}   onChange={e => setValue('optante_simples',   e.target.checked)} />
            </div>
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginBottom: 3 }}>Observações:</div>
              <textarea
                {...register('obs')}
                rows={5}
                style={{
                  width: '100%', padding: '4px 6px',
                  backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                  border: '1px solid var(--borda-media)', borderRadius: 3,
                  fontSize: 12, fontFamily: 'var(--fonte-sans)', resize: 'vertical',
                }}
              />
            </div>
          </Secao>
        )}

      </div>
    </form>
  )
}
