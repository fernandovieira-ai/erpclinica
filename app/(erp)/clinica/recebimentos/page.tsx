'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  format, parseISO, addDays, addMonths, subMonths,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInCalendarDays,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  DollarSign, Calendar, User, Stethoscope, CreditCard,
  ChevronLeft, ChevronRight, RefreshCw, Undo2,
} from 'lucide-react'
import type { AgendamentoListItem } from '@/types/clinica.types'
import RecebimentoModal from '@/components/clinica/RecebimentoModal'

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  AGENDADO:   { label: 'Agendado',   cor: '#378ADD' },
  CONFIRMADO: { label: 'Confirmado', cor: '#0F6E56' },
  AGUARDANDO: { label: 'Aguardando', cor: '#EF9F27' },
  ATENDIDO:   { label: 'Atendido',   cor: '#1D9E75' },
  FALTOU:     { label: 'Faltou',     cor: '#E24B4A' },
  CANCELADO:  { label: 'Cancelado',  cor: '#888780' },
}

const STATUS_RECEBIMENTO: Record<string, { label: string; cor: string }> = {
  PAGO:      { label: 'Pago',      cor: '#1D9E75' },
  ESTORNADO: { label: 'Estornado', cor: '#E24B4A' },
  PENDENTE:  { label: 'Pendente',  cor: '#EF9F27' },
}

function fmtValor(v: number | null | undefined) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type PresetPeriodo = 'hoje' | 'ontem' | 'semana' | '7dias' | 'mes' | '30dias' | 'mes_passado'

const PRESETS_PERIODO: { valor: PresetPeriodo; label: string }[] = [
  { valor: 'hoje',        label: 'Hoje' },
  { valor: 'ontem',       label: 'Ontem' },
  { valor: 'semana',      label: 'Esta Semana' },
  { valor: '7dias',       label: 'Últimos 7 dias' },
  { valor: 'mes',         label: 'Este Mês' },
  { valor: '30dias',      label: 'Últimos 30 dias' },
  { valor: 'mes_passado', label: 'Mês Passado' },
]

function rangeDoPreset(preset: PresetPeriodo): { inicio: Date; fim: Date } {
  const hoje = new Date()
  switch (preset) {
    case 'hoje':  return { inicio: hoje, fim: hoje }
    case 'ontem': { const d = addDays(hoje, -1); return { inicio: d, fim: d } }
    case '7dias':  return { inicio: addDays(hoje, -6),  fim: hoje }
    case '30dias': return { inicio: addDays(hoje, -29), fim: hoje }
    case 'semana': return { inicio: startOfWeek(hoje, { weekStartsOn: 1 }), fim: endOfWeek(hoje, { weekStartsOn: 1 }) }
    case 'mes':    return { inicio: startOfMonth(hoje), fim: endOfMonth(hoje) }
    case 'mes_passado': { const m = subMonths(hoje, 1); return { inicio: startOfMonth(m), fim: endOfMonth(m) } }
  }
}

const fmtISO = (d: Date) => format(d, 'yyyy-MM-dd')

export default function RecebimentosPage() {
  const [agendamentos, setAgendamentos] = useState<AgendamentoListItem[]>([])
  const [loading, setLoading]           = useState(false)
  const [dataInicio, setDataInicio]     = useState(() => fmtISO(new Date()))
  const [dataFim, setDataFim]           = useState(() => fmtISO(new Date()))
  const [modalOpen, setModalOpen]       = useState(false)
  const [agendamentosSel, setAgendamentosSel] = useState<AgendamentoListItem[]>([])
  const [filtroStatus, setFiltroStatus] = useState<string>('')

  const periodoUnico = dataInicio === dataFim

  const presetAtivo = useMemo(() => {
    for (const p of PRESETS_PERIODO) {
      const r = rangeDoPreset(p.valor)
      if (fmtISO(r.inicio) === dataInicio && fmtISO(r.fim) === dataFim) return p.valor
    }
    return null
  }, [dataInicio, dataFim])

  function aplicarPreset(preset: PresetPeriodo) {
    const { inicio, fim } = rangeDoPreset(preset)
    setDataInicio(fmtISO(inicio))
    setDataFim(fmtISO(fim))
  }

  function paginar(direcao: 1 | -1) {
    const inicio = parseISO(dataInicio)
    const fim    = parseISO(dataFim)
    const ehMesInteiro = fmtISO(inicio) === fmtISO(startOfMonth(inicio)) &&
      fmtISO(fim) === fmtISO(endOfMonth(fim)) && inicio.getMonth() === fim.getMonth()

    if (ehMesInteiro) {
      const novoMes = addMonths(inicio, direcao)
      setDataInicio(fmtISO(startOfMonth(novoMes)))
      setDataFim(fmtISO(endOfMonth(novoMes)))
      return
    }

    const dias = differenceInCalendarDays(fim, inicio) + 1
    setDataInicio(fmtISO(addDays(inicio, direcao * dias)))
    setDataFim(fmtISO(addDays(fim, direcao * dias)))
  }

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clinica/agendamentos?inicio=${dataInicio}&fim=${dataFim}`)
      if (!res.ok) { toast.error('Erro ao carregar agendamentos'); return }
      const data = await res.json()
      setAgendamentos(data.dados ?? [])
    } finally {
      setLoading(false)
    }
  }, [dataInicio, dataFim])

  useEffect(() => { carregar() }, [carregar])

  function abrirRecebimento(ags: AgendamentoListItem[]) {
    setAgendamentosSel(ags)
    setModalOpen(true)
  }

  async function estornarTudo(agPagos: AgendamentoListItem[]) {
    if (!agPagos.length) return

    const total = agPagos.length
    const aviso = total > 1
      ? `Este estorno irá reverter ${total} atendimento(s) deste paciente.\n\nMotivo do estorno:`
      : 'Motivo do estorno:'

    const motivo = window.prompt(aviso)
    if (!motivo) return

    // Coleta um recebimento_id representante por lote único (backend agrupa pelo movimento/título)
    const lotesUnicos = new Map<string, number>()
    for (const ag of agPagos) {
      if (!ag.recebimento_id) continue
      const key = ag.movimento_caixa_id
        ? `caixa-${ag.movimento_caixa_id}`
        : ag.movimento_banco_id
          ? `banco-${ag.movimento_banco_id}`
          : ag.batch_agendamento_id
            ? `batch-${ag.batch_agendamento_id}`
            : `rec-${ag.recebimento_id}`
      if (!lotesUnicos.has(key)) lotesUnicos.set(key, ag.recebimento_id)
    }

    try {
      let totalEstornados = 0
      for (const recebimentoId of lotesUnicos.values()) {
        const res = await fetch(`/api/clinica/recebimentos/${recebimentoId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo_estorno: motivo }),
        })
        if (!res.ok) {
          const error = await res.json()
          toast.error(error.detalhes || error.erro || 'Erro ao estornar')
          carregar()
          return
        }
        const data = await res.json()
        totalEstornados += data.total_estornados ?? 1
      }
      toast.success(`${totalEstornados} atendimento(s) estornado(s) com sucesso`)
      carregar()
    } catch {
      toast.error('Erro ao estornar recebimento')
    }
  }

  const agFiltrados = filtroStatus
    ? agendamentos.filter(ag => ag.status === filtroStatus)
    : agendamentos

  // Agrupa por paciente preservando a ordem do primeiro atendimento do dia
  const grupos = useMemo(() => {
    const map = new Map<number, AgendamentoListItem[]>()
    for (const ag of agFiltrados) {
      if (!map.has(ag.paciente_id)) map.set(ag.paciente_id, [])
      map.get(ag.paciente_id)!.push(ag)
    }
    return Array.from(map.values())
  }, [agFiltrados])

  const totalValor = agFiltrados.reduce((sum, ag) =>
    sum + Number(ag.total_recebimento ?? ag.tipo_valor ?? 0), 0)

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>

          {/* Linha 1: presets de período */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-page)', padding: 3, borderRadius: 8, flexWrap: 'wrap', width: 'fit-content' }}>
            {PRESETS_PERIODO.map(p => (
              <button
                key={p.valor}
                onClick={() => aplicarPreset(p.valor)}
                style={{
                  padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                  background: presetAtivo === p.valor ? 'var(--bg-card)' : 'transparent',
                  color: presetAtivo === p.valor ? 'var(--cor-primaria)' : 'var(--texto-secundario)',
                  boxShadow: presetAtivo === p.valor ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Linha 2: navegação, intervalo customizado, status e total */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Navegação de período */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn-ghost" style={{ padding: '6px 8px' }} onClick={() => paginar(-1)} title="Período anterior">
                <ChevronLeft size={16} />
              </button>
              <span style={{ minWidth: 180, textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--texto-principal)' }}>
                {periodoUnico
                  ? format(parseISO(dataInicio), "d 'de' MMMM 'de' yyyy", { locale: ptBR })
                  : `${format(parseISO(dataInicio), 'd MMM', { locale: ptBR })} — ${format(parseISO(dataFim), "d MMM 'de' yyyy", { locale: ptBR })}`}
              </span>
              <button className="btn-ghost" style={{ padding: '6px 8px' }} onClick={() => paginar(1)} title="Próximo período">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Intervalo customizado */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>De</span>
              <input
                type="date"
                className="input-field"
                value={dataInicio}
                max={dataFim}
                onChange={e => setDataInicio(e.target.value)}
                style={{ fontSize: 12, width: 140 }}
              />
              <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>até</span>
              <input
                type="date"
                className="input-field"
                value={dataFim}
                min={dataInicio}
                onChange={e => setDataFim(e.target.value)}
                style={{ fontSize: 12, width: 140 }}
              />
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

            <button
              className="btn-ghost"
              style={{ padding: '6px 8px' }}
              onClick={() => carregar()}
              title="Atualizar"
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>

            {/* Total do período */}
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
              <span style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>
                {periodoUnico ? 'Total do dia:' : 'Total do período:'}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cor-primaria)' }}>
                {fmtValor(totalValor)}
              </span>
            </div>
          </div>
        </div>

        {/* Listagem agrupada por paciente */}
        {grupos.length === 0 ? (
          <div className="card" style={{
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {grupos.map(grupo => {
              const paciente = grupo[0]
              const pendentes = grupo.filter(ag =>
                ag.status_recebimento !== 'PAGO' &&
                ['AGENDADO', 'CONFIRMADO', 'AGUARDANDO', 'ATENDIDO'].includes(ag.status)
              )
              const totalGrupo = grupo.reduce((sum, ag) =>
                sum + Number(ag.total_recebimento ?? ag.tipo_valor ?? 0), 0)

              // Agrupa os PAGO por lote (movimento ou título A Prazo)
              const movimentosEstorno = new Map<string, AgendamentoListItem[]>()
              for (const ag of grupo.filter(a => a.status_recebimento === 'PAGO')) {
                const key = ag.movimento_caixa_id
                  ? `caixa-${ag.movimento_caixa_id}`
                  : ag.movimento_banco_id
                    ? `banco-${ag.movimento_banco_id}`
                    : ag.batch_agendamento_id
                      ? `batch-${ag.batch_agendamento_id}`
                      : `rec-${ag.recebimento_id}`
                if (!movimentosEstorno.has(key)) movimentosEstorno.set(key, [])
                movimentosEstorno.get(key)!.push(ag)
              }
              const lotesPagos = Array.from(movimentosEstorno.values())

              return (
                <div key={paciente.paciente_id} className="card" style={{ overflow: 'hidden', padding: 0 }}>

                  {/* Cabeçalho do paciente */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 16px',
                    background: 'var(--bg-card)',
                    borderBottom: '0.5px solid var(--borda-suave)',
                  }}>
                    <User size={13} style={{ color: 'var(--texto-terciario)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--texto-principal)' }}>
                      {paciente.paciente_nome}
                    </span>
                    {paciente.paciente_celular && (
                      <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
                        {paciente.paciente_celular}
                      </span>
                    )}

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cor-primaria)' }}>
                        {fmtValor(totalGrupo)}
                      </span>
                      {lotesPagos.length > 0 && (
                        <button
                          onClick={() => estornarTudo(grupo.filter(a => a.status_recebimento === 'PAGO'))}
                          style={{
                            padding: '5px 12px',
                            background: '#E24B4A',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 5,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <Undo2 size={13} />
                          Estornar
                        </button>
                      )}
                      {pendentes.length > 0 && (
                        <button
                          onClick={() => abrirRecebimento(pendentes)}
                          style={{
                            padding: '5px 12px',
                            background: 'var(--cor-primaria)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 5,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <CreditCard size={13} />
                          {pendentes.length > 1 ? `Receber (${pendentes.length})` : 'Receber'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Linhas de atendimento */}
                  {grupo.map((ag, idx) => {
                    const statusInfo = STATUS_LABEL[ag.status] ?? { label: ag.status, cor: '#999' }
                    const recInfo    = ag.status_recebimento ? STATUS_RECEBIMENTO[ag.status_recebimento] : null

                    return (
                      <div
                        key={ag.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 16px',
                          borderBottom: idx < grupo.length - 1 ? '0.5px solid var(--borda-suave)' : 'none',
                          fontSize: 12,
                        }}
                      >
                        {/* Data (só quando período > 1 dia) + Hora */}
                        <span style={{ fontWeight: 700, color: 'var(--texto-principal)', minWidth: periodoUnico ? 38 : 80, flexShrink: 0 }}>
                          {periodoUnico
                            ? format(parseISO(ag.data_hora_inicio), 'HH:mm')
                            : format(parseISO(ag.data_hora_inicio), "dd/MM HH:mm")}
                        </span>

                        {/* Profissional · Tipo · Categoria */}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, color: 'var(--texto-terciario)' }}>
                          <Stethoscope size={11} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ag.profissional_nome}
                            {ag.tipo_descricao && ` · ${ag.tipo_descricao}`}
                            {ag.categoria_descricao && ` · ${ag.categoria_descricao}`}
                          </span>
                        </div>

                        {/* Valor */}
                        <span style={{ fontWeight: 600, color: 'var(--cor-primaria)', flexShrink: 0 }}>
                          {fmtValor(ag.total_recebimento ?? ag.tipo_valor)}
                        </span>

                        {/* Badge status agendamento */}
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: statusInfo.cor,
                          background: statusInfo.cor + '20',
                          padding: '2px 6px',
                          borderRadius: 3,
                          flexShrink: 0,
                        }}>
                          {statusInfo.label}
                        </span>

                        {/* Badge status recebimento */}
                        {recInfo && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: recInfo.cor,
                            background: recInfo.cor + '20',
                            padding: '2px 6px',
                            borderRadius: 3,
                            flexShrink: 0,
                          }}>
                            {recInfo.label}
                          </span>
                        )}

                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <RecebimentoModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setAgendamentosSel([])
        }}
        agendamento={null}
        agendamentos={agendamentosSel}
        onRecebimentoSalvo={carregar}
      />
    </>
  )
}
