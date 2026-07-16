'use client'

import { forwardRef, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Plus, X, ClipboardList } from 'lucide-react'
import { condicaoPagamentoSchema, type CondicaoPagamentoInput } from '@/lib/validators/condicao-pagamento.schema'
import type { CondicaoPagamento } from '@/types/cadastros.types'
import TaxaCartaoInline from '@/components/financeiro/cartao/TaxaCartaoInline'

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

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
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

  const [contas, setContas] = useState<Array<{ id: number; mnemonico: string; banco_nome?: string }>>([])

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CondicaoPagamentoInput>({
    resolver: zodResolver(condicaoPagamentoSchema),
    defaultValues: { tipo: 'V', num_parcelas: 1, intervalo_dias: 30, entrada_pct: 0, tipo_pagamento: 'dinheiro', conta_banco_pix_id: null, conta_banco_cartao_id: null, adquirente: '', bandeira: 'TODAS', ativo: true },
  })

  const tipo = watch('tipo')
  const tipoPagamento = watch('tipo_pagamento')
  const isCartao = tipoPagamento === 'debito' || tipoPagamento === 'credito'

  useEffect(() => {
    fetch('/api/cadastro/contas-banco?ativo=true&limit=100')
      .then(r => r.json())
      .then(d => setContas(d.dados ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!condicao) return
    reset({
      descricao:           condicao.descricao,
      tipo:                condicao.tipo,
      num_parcelas:        condicao.num_parcelas,
      intervalo_dias:      condicao.intervalo_dias,
      entrada_pct:         Number(condicao.entrada_pct),
      tipo_pagamento:      condicao.tipo_pagamento ?? 'dinheiro',
      conta_banco_pix_id:  condicao.conta_banco_pix_id ? Number(condicao.conta_banco_pix_id) : null,
      conta_banco_cartao_id: condicao.conta_banco_cartao_id ? Number(condicao.conta_banco_cartao_id) : null,
      adquirente:          condicao.adquirente ?? '',
      bandeira:            condicao.bandeira ?? 'TODAS',
      ativo:               condicao.ativo,
    })
  // contas é usado só para popular as opções do <select> — não deve
  // disparar um reset do formulário quando o fetch assíncrono terminar,
  // senão apaga o que o usuário já tiver digitado/selecionado.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condicao, reset])

  // Os selects de conta bancária (PIX/Cartão) só existem quando a
  // condição correspondente já está ativa, e suas <option> só existem
  // depois que `contas` carrega (fetch assíncrono). Se o reset acima
  // rodar antes de `contas` chegar, o valor não tem <option> pra casar
  // e o select fica em branco — por isso reaplicamos só esses dois
  // valores (via setValue, não reset) assim que `contas` estiver pronto.
  useEffect(() => {
    if (!condicao || contas.length === 0) return
    if (condicao.conta_banco_pix_id)    setValue('conta_banco_pix_id', Number(condicao.conta_banco_pix_id))
    if (condicao.conta_banco_cartao_id) setValue('conta_banco_cartao_id', Number(condicao.conta_banco_cartao_id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contas])

  useEffect(() => {
    // Crédito tem campo próprio (Parcelas Máximas) — não mexe em num_parcelas/intervalo_dias aqui.
    if (tipoPagamento === 'credito') return
    if (tipo === 'V') {
      setValue('num_parcelas', 1)
      setValue('intervalo_dias', 0)
      setValue('entrada_pct', 0)
    } else if (tipo === 'P') {
      setValue('num_parcelas', condicao?.num_parcelas ?? 1)
      setValue('intervalo_dias', condicao?.intervalo_dias ?? 30)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, tipoPagamento])

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

        {/* Coluna esquerda — dados da condição de pagamento */}
        <div style={{ flex: 1, minWidth: 0 }}>
        <fieldset className="form-fieldset">
          <legend>
            <ClipboardList size={12} /> Dados Gerais
          </legend>
          <div className="form-fieldset-body">

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

          {/* Tipo de Pagamento */}
          <Row label="Tipo de Pagamento:">
            <Select {...register('tipo_pagamento')} style={{ width: 180 }}>
              <option value="dinheiro">Dinheiro</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="pix">PIX</option>
              <option value="a_prazo">A Prazo</option>
            </Select>
          </Row>

          {/* Conta Banco PIX — visível apenas quando tipo_pagamento = pix */}
          {tipoPagamento === 'pix' && (
            <Row label="Conta Banco (PIX):">
              <Select
                {...register('conta_banco_pix_id', {
                  setValueAs: v => v ? parseInt(v, 10) : null,
                })}
                style={{ width: 250 }}>
                <option value="">Selecione uma conta...</option>
                {contas.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.mnemonico} {c.banco_nome ? `(${c.banco_nome})` : ''}</option>
                ))}
              </Select>
            </Row>
          )}

          {/* Adquirente/Bandeira — visíveis apenas quando tipo_pagamento = débito/crédito */}
          {isCartao && (
            <>
              <Row label="Adquirente:*">
                <Input list="lista-adquirentes" {...register('adquirente')}
                  placeholder="Ex.: STONE, CIELO, REDE..."
                  style={{ width: 220, border: errors.adquirente ? '1px solid var(--cor-erro)' : undefined }} />
                <datalist id="lista-adquirentes">
                  <option value="STONE" /><option value="CIELO" /><option value="REDE" />
                  <option value="GETNET" /><option value="SAFRAPAY" /><option value="MERCADO PAGO" />
                  <option value="PAGSEGURO" /><option value="SICREDI" />
                </datalist>
                {errors.adquirente && <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.adquirente.message}</span>}
              </Row>

              <Row label="Bandeira:">
                <Select {...register('bandeira')} style={{ width: 180 }}>
                  <option value="TODAS">Todas</option>
                  <option value="VISA">Visa</option>
                  <option value="MASTERCARD">Mastercard</option>
                  <option value="ELO">Elo</option>
                  <option value="AMEX">American Express</option>
                  <option value="HIPERCARD">Hipercard</option>
                </Select>
              </Row>

              <Row label="Conta Bancária (Cartão):*">
                <Select
                  {...register('conta_banco_cartao_id', {
                    setValueAs: v => v ? parseInt(v, 10) : null,
                  })}
                  style={{ width: 250, border: errors.conta_banco_cartao_id ? '1px solid var(--cor-erro)' : undefined }}>
                  <option value="">Selecione uma conta...</option>
                  {contas.map(c => (
                    <option key={c.id} value={String(c.id)}>{c.mnemonico} {c.banco_nome ? `(${c.banco_nome})` : ''}</option>
                  ))}
                </Select>
                {errors.conta_banco_cartao_id && <span style={{ fontSize: 11, color: 'var(--cor-erro)', whiteSpace: 'nowrap' }}>{errors.conta_banco_cartao_id.message}</span>}
              </Row>
              <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginLeft: 0 }}>
                Conta que recebe o depósito da maquininha/adquirente.
              </div>
            </>
          )}


          <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

          {/* Crédito: só o máximo de parcelas que o operador poderá escolher no recebimento */}
          {tipoPagamento === 'credito' && (
            <Row label="Parcelas Máximas:">
              <input type="number" min={1} max={99}
                {...register('num_parcelas', { valueAsNumber: true })}
                style={{ width: 100, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: errors.num_parcelas ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }}
                onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)' }}
                onBlur={e  => { e.target.style.borderColor = errors.num_parcelas ? 'var(--cor-erro)' : 'var(--borda-media)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>Nº máximo de parcelas no cartão. No recebimento o operador escolhe de 1x até esse limite.</span>
              {errors.num_parcelas && <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{errors.num_parcelas.message}</span>}
            </Row>
          )}

          {/* Campos de parcelamento (A Prazo) — visíveis apenas quando tipo = P e não é crédito */}
          {tipo === 'P' && tipoPagamento !== 'credito' && (
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

          {tipo === 'V' && tipoPagamento !== 'credito' && (
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
        </fieldset>
        </div>

        {/* Coluna direita — taxa de cartão (débito/crédito) lado a lado com os dados, ou resumo nos demais tipos */}
        {isCartao ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <TaxaCartaoInline condicaoPagamentoId={condicao?.id} />
          </div>
        ) : (
          <div style={{ width: 220, flexShrink: 0 }}>
            <fieldset className="form-fieldset">
              <legend>Resumo</legend>
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
        )}

      </div>
    </form>
  )
}
