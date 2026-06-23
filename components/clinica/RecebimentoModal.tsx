'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { X, DollarSign, CreditCard, Percent, Check } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { AgendamentoListItem } from '@/types/clinica.types'

interface Props {
  open: boolean
  onClose: () => void
  agendamento: AgendamentoListItem | null
}

interface CondicaoPagamento {
  id: number
  descricao: string
  tipo: string
  tipo_pagamento: string
  num_parcelas: number
  intervalo_dias: number
}

interface FormRecebimento {
  condicao_pagamento_id: number
  valor_recebido: number
  desconto: number
  acrescimo: number
  observacao: string
}

function fmtValor(v: number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
      {children}
    </div>
  )
}

function Field({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', ...style }}>{children}</div>
}

export default function RecebimentoModal({ open, onClose, agendamento }: Props) {
  const [saving, setSaving] = useState(false)
  const [condicoes, setCondicoes] = useState<CondicaoPagamento[]>([])
  const [loadingCondicoes, setLoadingCondicoes] = useState(false)

  const [form, setForm] = useState<FormRecebimento>({
    condicao_pagamento_id: 0,
    valor_recebido: 0,
    desconto: 0,
    acrescimo: 0,
    observacao: '',
  })

  const condicaoSelecionada = condicoes.find(c => c.id === form.condicao_pagamento_id)

  useEffect(() => {
    if (open) {
      carregarCondicoesPagamento()
    }
  }, [open])

  useEffect(() => {
    if (agendamento?.tipo_valor) {
      setForm(prev => ({
        ...prev,
        valor_recebido: agendamento.tipo_valor || 0,
      }))
    }
  }, [agendamento])

  async function carregarCondicoesPagamento() {
    setLoadingCondicoes(true)
    try {
      const res = await fetch('/api/cadastro/condicoes-pagamento?ativo=true')
      if (!res.ok) return
      const data = await res.json()
      setCondicoes(data.dados ?? [])
      if (data.dados?.length > 0) {
        setForm(prev => ({ ...prev, condicao_pagamento_id: data.dados[0].id }))
      }
    } catch (error) {
      console.error('Erro ao carregar condições:', error)
    } finally {
      setLoadingCondicoes(false)
    }
  }

  const totalComAjustes = form.valor_recebido - form.desconto + form.acrescimo

  async function handleSalvar() {
    if (!agendamento) return

    if (!form.condicao_pagamento_id) {
      toast.error('Selecione uma condição de pagamento')
      return
    }

    if (form.valor_recebido <= 0) {
      toast.error('Valor do recebimento deve ser maior que zero')
      return
    }

    setSaving(true)
    try {
      const dataMovimento = format(parseISO(agendamento.data_hora_inicio), 'yyyy-MM-dd')

      const payload = {
        agendamento_id: agendamento.id,
        paciente_id: agendamento.paciente_id,
        condicao_pagamento_id: form.condicao_pagamento_id,
        valor_original: agendamento.tipo_valor || form.valor_recebido,
        valor_desconto: form.desconto,
        valor_acrescimo: form.acrescimo,
        valor_recebido: form.valor_recebido,
        total_recebimento: totalComAjustes,
        data_recebimento: dataMovimento,
        observacao: form.observacao,
      }

      const res = await fetch('/api/clinica/recebimentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        const mensagem = error.detalhes ? `${error.erro}: ${error.detalhes}` : (error.erro || 'Erro ao processar recebimento')
        toast.error(mensagem)
        console.error('Erro na API de recebimento:', error)
        return
      }

      toast.success('Recebimento registrado com sucesso!')
      onClose()
    } catch (error) {
      toast.error('Erro ao processar recebimento')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  if (!open || !agendamento) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}
    onClick={e => {
      if (e.target === e.currentTarget) onClose()
    }}
    >
      <div style={{
        background: 'var(--bg-page)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        width: '100%',
        maxWidth: 500,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Cabeçalho */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '0.5px solid var(--borda-suave)',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--texto-principal)', margin: 0 }}>
              Recebimento da Consulta
            </h2>
            <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
              {agendamento.paciente_nome} • {format(parseISO(agendamento.data_hora_inicio), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--texto-terciario)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
        }}>

          {/* Informações da Consulta */}
          <div style={{
            background: 'var(--bg-card)',
            border: '0.5px solid var(--borda-suave)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 20,
          }}>
            <Label>Informações da Consulta</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, marginTop: 8 }}>
              <div>
                <div style={{ color: 'var(--texto-terciario)', marginBottom: 2 }}>Profissional</div>
                <div style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>{agendamento.profissional_nome}</div>
              </div>
              <div>
                <div style={{ color: 'var(--texto-terciario)', marginBottom: 2 }}>Tipo</div>
                <div style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>{agendamento.tipo_descricao || '—'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--texto-terciario)', marginBottom: 2 }}>Valor da Consulta</div>
                <div style={{ fontWeight: 700, color: 'var(--cor-primaria)', fontSize: 14 }}>
                  {fmtValor(agendamento.tipo_valor || 0)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--texto-terciario)', marginBottom: 2 }}>Status</div>
                <div style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>{agendamento.status}</div>
              </div>
            </div>
          </div>

          {/* Condição de Pagamento */}
          <Field style={{ marginBottom: 20 }}>
            <Label>Condição de Pagamento</Label>
            <select
              value={form.condicao_pagamento_id}
              onChange={e => setForm({ ...form, condicao_pagamento_id: Number(e.target.value) })}
              disabled={loadingCondicoes}
              className="input-field"
              style={{
                fontSize: 13,
                fontWeight: 500,
                padding: '10px 12px',
              }}
            >
              <option value={0}>Selecione uma condição...</option>
              {condicoes.map(cond => {
                const label = `${cond.descricao}${cond.tipo === 'P' && cond.num_parcelas > 1 ? ` (${cond.num_parcelas}x)` : ''}${cond.tipo_pagamento === 'pix' ? ' [PIX]' : ''}`
                return (
                  <option key={cond.id} value={cond.id}>
                    {label}
                  </option>
                )
              })}
            </select>
            {loadingCondicoes && (
              <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 6 }}>
                Carregando...
              </div>
            )}
            {condicaoSelecionada?.tipo_pagamento === 'pix' && (
              <div style={{
                fontSize: 12,
                color: 'var(--cor-primaria)',
                marginTop: 8,
                padding: '8px 10px',
                background: 'var(--cor-primaria-light)',
                borderRadius: 4,
              }}>
                ✓ PIX - Conta bancária pré-configurada
              </div>
            )}
          </Field>

          {/* Valores */}
          <Field style={{ marginBottom: 20 }}>
            <Label>Valores</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 10,
                background: 'var(--bg-card)',
                borderRadius: 6,
                border: '0.5px solid var(--borda-suave)',
              }}>
                <DollarSign size={16} style={{ color: 'var(--cor-primaria)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginBottom: 2 }}>Valor Recebido</div>
                  <input
                    type="number"
                    step="0.01"
                    value={form.valor_recebido}
                    onChange={e => setForm({ ...form, valor_recebido: Math.max(0, parseFloat(e.target.value) || 0) })}
                    placeholder="0,00"
                    style={{
                      width: '100%',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--texto-principal)',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: 0,
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-principal)' }}>
                  {fmtValor(form.valor_recebido)}
                </span>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 10,
                background: 'var(--bg-card)',
                borderRadius: 6,
                border: '0.5px solid var(--borda-suave)',
              }}>
                <Percent size={16} style={{ color: 'var(--cor-aviso)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginBottom: 2 }}>Desconto</div>
                  <input
                    type="number"
                    step="0.01"
                    value={form.desconto}
                    onChange={e => setForm({ ...form, desconto: Math.max(0, parseFloat(e.target.value) || 0) })}
                    placeholder="0,00"
                    style={{
                      width: '100%',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--texto-principal)',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: 0,
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cor-aviso)' }}>
                  -{fmtValor(form.desconto)}
                </span>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 10,
                background: 'var(--bg-card)',
                borderRadius: 6,
                border: '0.5px solid var(--borda-suave)',
              }}>
                <Percent size={16} style={{ color: 'var(--cor-sucesso)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginBottom: 2 }}>Acréscimo</div>
                  <input
                    type="number"
                    step="0.01"
                    value={form.acrescimo}
                    onChange={e => setForm({ ...form, acrescimo: Math.max(0, parseFloat(e.target.value) || 0) })}
                    placeholder="0,00"
                    style={{
                      width: '100%',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--texto-principal)',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: 0,
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cor-sucesso)' }}>
                  +{fmtValor(form.acrescimo)}
                </span>
              </div>

              {/* Total */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 12,
                background: 'var(--cor-primaria)',
                borderRadius: 6,
                marginTop: 4,
              }}>
                <DollarSign size={16} style={{ color: '#fff', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Total a Receber</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                    {fmtValor(totalComAjustes)}
                  </div>
                </div>
              </div>
            </div>
          </Field>

          {/* Observação */}
          <Field style={{ marginBottom: 20 }}>
            <Label>Observação</Label>
            <textarea
              value={form.observacao}
              onChange={e => setForm({ ...form, observacao: e.target.value })}
              placeholder="Digite qualquer observação relevante..."
              className="input-field"
              style={{
                minHeight: 60,
                fontSize: 12,
                fontFamily: 'inherit',
                padding: '8px 10px',
                resize: 'none',
              }}
            />
          </Field>

        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          gap: 8,
          padding: '16px 20px',
          borderTop: '0.5px solid var(--borda-suave)',
          flexShrink: 0,
          background: 'var(--bg-card)',
        }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: '0.5px solid var(--borda-media)',
              background: 'var(--bg-page)',
              color: 'var(--texto-principal)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              transition: 'all 0.2s',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              background: 'var(--cor-primaria)',
              color: '#fff',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              transition: 'all 0.2s',
              opacity: saving ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Check size={16} />
            {saving ? 'Processando...' : 'Confirmar Recebimento'}
          </button>
        </div>

      </div>
    </div>
  )
}
