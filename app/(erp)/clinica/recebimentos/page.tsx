'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, parseISO, startOfDay, endOfDay, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  DollarSign, Calendar, User, Stethoscope, CreditCard,
  Search, ChevronLeft, ChevronRight, RefreshCw, Undo2,
} from 'lucide-react'
import type { AgendamentoListItem } from '@/types/clinica.types'
import RecebimentoModal from '@/components/clinica/RecebimentoModal'

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  AGENDADO:   { label: 'Agendado',    cor: '#378ADD' },
  CONFIRMADO: { label: 'Confirmado',  cor: '#0F6E56' },
  AGUARDANDO: { label: 'Aguardando',  cor: '#EF9F27' },
  ATENDIDO:   { label: 'Atendido',    cor: '#1D9E75' },
  FALTOU:     { label: 'Faltou',      cor: '#E24B4A' },
  CANCELADO:  { label: 'Cancelado',   cor: '#888780' },
}

const STATUS_RECEBIMENTO: Record<string, { label: string; cor: string }> = {
  PAGO:       { label: 'Pago',        cor: '#1D9E75' },
  ESTORNADO:  { label: 'Estornado',   cor: '#E24B4A' },
  PENDENTE:   { label: 'Pendente',    cor: '#EF9F27' },
}

function fmtValor(v: number | null | undefined) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function RecebimentosPage() {
  const [agendamentos, setAgendamentos] = useState<AgendamentoListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [dataHoje, setDataHoje] = useState(new Date())
  const [modalOpen, setModalOpen] = useState(false)
  const [agendamentoSel, setAgendamentoSel] = useState<AgendamentoListItem | null>(null)
  const [filtroStatus, setFiltroStatus] = useState<string>('')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const inicio = format(startOfDay(dataHoje), 'yyyy-MM-dd')
      const fim = format(endOfDay(dataHoje), 'yyyy-MM-dd')

      const sp = new URLSearchParams({
        inicio,
        fim,
      })

      const res = await fetch(`/api/clinica/agendamentos?${sp}`)
      if (!res.ok) {
        toast.error('Erro ao carregar agendamentos')
        return
      }

      const data = await res.json()
      setAgendamentos(data.dados ?? [])
    } finally {
      setLoading(false)
    }
  }, [dataHoje])

  useEffect(() => {
    carregar()
  }, [carregar])

  function abrirRecebimento(ag: AgendamentoListItem) {
    setAgendamentoSel(ag)
    setModalOpen(true)
  }

  async function estornarRecebimento(ag: AgendamentoListItem) {
    if (!ag.recebimento_id) return

    const motivo = window.prompt('Motivo do estorno:')
    if (!motivo) return

    try {
      const res = await fetch(`/api/clinica/recebimentos/${ag.recebimento_id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo_estorno: motivo }),
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.detalhes || error.erro || 'Erro ao estornar')
        return
      }

      toast.success('Recebimento estornado com sucesso')
      carregar()
    } catch (error) {
      toast.error('Erro ao estornar recebimento')
      console.error(error)
    }
  }

  const agFiltrados = filtroStatus
    ? agendamentos.filter(ag => ag.status === filtroStatus)
    : agendamentos

  const totalValor = agFiltrados.reduce((sum, ag) => sum + (ag.tipo_valor || 0), 0)

  return (
    <>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <DollarSign size={20} style={{ color: 'var(--cor-primaria)' }} />
            <h1 className="page-title">Recebimentos</h1>
          </div>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>
            Processamento de recebimentos de consultas
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Controles */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Data navegação */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn-ghost"
              style={{ padding: '6px 8px' }}
              onClick={() => setDataHoje(d => new Date(d.getTime() - 86400000))}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="btn-ghost"
              style={{ minWidth: 200, fontSize: 12, fontWeight: 600, padding: '6px 12px' }}
              onClick={() => setDataHoje(new Date())}
              title="Voltar para hoje"
            >
              {format(dataHoje, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </button>
            <button
              className="btn-ghost"
              style={{ padding: '6px 8px' }}
              onClick={() => setDataHoje(d => new Date(d.getTime() + 86400000))}
            >
              <ChevronRight size={16} />
            </button>
            {!isToday(dataHoje) && (
              <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
                (Hoje é {format(new Date(), 'd MMMM', { locale: ptBR })})
              </span>
            )}
          </div>

          {/* Filtro status */}
          <select
            value={filtroStatus}
            onChange={e => setFiltroStatus(e.target.value)}
            className="input-field"
            style={{ fontSize: 12, width: 150 }}
          >
            <option value="">Todos os Status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Refresh */}
          <button
            className="btn-ghost"
            style={{ padding: '6px 8px' }}
            onClick={() => carregar()}
            title="Atualizar"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Total */}
          <div style={{
            marginLeft: 'auto',
            padding: '6px 12px',
            background: 'var(--bg-card)',
            borderRadius: 6,
            border: '0.5px solid var(--borda-suave)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>Total:</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cor-primaria)' }}>
              {fmtValor(totalValor)}
            </span>
          </div>
        </div>

        {/* Listagem */}
        <div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {agFiltrados.length === 0 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 12,
              color: 'var(--texto-terciario)',
              minHeight: 300,
            }}>
              <Calendar size={48} style={{ opacity: 0.3 }} />
              <div style={{ fontSize: 14 }}>Nenhum agendamento neste dia</div>
            </div>
          ) : (
            <div style={{ overflow: 'auto', flex: 1 }}>
              {agFiltrados.map((ag, idx) => {
                const statusInfo = STATUS_LABEL[ag.status] || { label: ag.status, cor: '#999' }
                const podePagar = ['AGENDADO', 'CONFIRMADO', 'AGUARDANDO', 'ATENDIDO'].includes(ag.status)

                return (
                  <div
                    key={ag.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px 16px',
                      borderBottom: idx < agFiltrados.length - 1 ? '0.5px solid var(--borda-suave)' : 'none',
                      gap: 12,
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                    }}
                  >
                    {/* Status */}
                    <div style={{
                      width: 4,
                      height: 40,
                      borderRadius: 2,
                      background: statusInfo.cor,
                      flexShrink: 0,
                    }} />

                    {/* Informações */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4,
                      }}>
                        <div style={{
                          fontWeight: 600,
                          fontSize: 13,
                          color: 'var(--texto-principal)',
                        }}>
                          {format(parseISO(ag.data_hora_inicio), 'HH:mm')}
                        </div>
                        <span style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--texto-principal)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {ag.paciente_nome}
                        </span>
                        {ag.paciente_celular && (
                          <span style={{
                            fontSize: 11,
                            color: 'var(--texto-terciario)',
                            marginLeft: 'auto',
                          }}>
                            {ag.paciente_celular}
                          </span>
                        )}
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 11,
                        color: 'var(--texto-terciario)',
                      }}>
                        <Stethoscope size={12} />
                        <span>{ag.profissional_nome}</span>
                        {ag.tipo_descricao && (
                          <>
                            <span>·</span>
                            <span>{ag.tipo_descricao}</span>
                          </>
                        )}
                        {ag.categoria_descricao && (
                          <>
                            <span>·</span>
                            <span>{ag.categoria_descricao}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status Recebimento */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 4,
                      flexShrink: 0,
                    }}>
                      <div style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--cor-primaria)',
                      }}>
                        {fmtValor(ag.total_recebimento || ag.tipo_valor)}
                      </div>
                      <div style={{
                        display: 'flex',
                        gap: 4,
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                      }}>
                        <div style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: statusInfo.cor,
                          background: statusInfo.cor + '20',
                          padding: '2px 8px',
                          borderRadius: 4,
                        }}>
                          {statusInfo.label}
                        </div>
                        {ag.status_recebimento && (
                          <div style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: STATUS_RECEBIMENTO[ag.status_recebimento]?.cor || '#999',
                            background: (STATUS_RECEBIMENTO[ag.status_recebimento]?.cor || '#999') + '20',
                            padding: '2px 8px',
                            borderRadius: 4,
                          }}>
                            💰 {STATUS_RECEBIMENTO[ag.status_recebimento]?.label || ag.status_recebimento}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Botões Receber/Estornar */}
                    {ag.status_recebimento === 'PAGO' ? (
                      <button
                        onClick={() => estornarRecebimento(ag)}
                        style={{
                          padding: '8px 12px',
                          background: '#E24B4A',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexShrink: 0,
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.opacity = '0.9'
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.opacity = '1'
                        }}
                        title="Desfazer o recebimento"
                      >
                        <Undo2 size={14} />
                        Estornar
                      </button>
                    ) : ag.status_recebimento === 'ESTORNADO' ? (
                      <button
                        onClick={() => abrirRecebimento(ag)}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--cor-primaria)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexShrink: 0,
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.opacity = '0.9'
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.opacity = '1'
                        }}
                        title="Receber novamente"
                      >
                        <CreditCard size={14} />
                        Receber Novamente
                      </button>
                    ) : podePagar ? (
                      <button
                        onClick={() => abrirRecebimento(ag)}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--cor-primaria)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexShrink: 0,
                          transition: 'opacity 0.2s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.opacity = '0.9'
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.opacity = '1'
                        }}
                      >
                        <CreditCard size={14} />
                        Receber
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <RecebimentoModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setAgendamentoSel(null)
        }}
        agendamento={agendamentoSel}
      />
    </>
  )
}
