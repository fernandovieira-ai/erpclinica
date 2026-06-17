'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays, LayoutGrid, List,
  Stethoscope, RefreshCw,
} from 'lucide-react'
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks,
  addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameDay, parseISO, isToday,
  setHours, setMinutes, addDays, isSameMonth, startOfDay,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import type { AgendamentoListItem, ProfissionalListItem } from '@/types/clinica.types'
import AgendamentoModal from '@/components/clinica/AgendamentoModal'

type ViewMode = 'dia' | 'semana' | 'mes' | 'lista'

const HORAS = Array.from({ length: 28 }, (_, i) => {
  const h = Math.floor(i / 2) + 7
  const m = i % 2 === 0 ? 0 : 30
  return { h, m, label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
})

const STATUS_COLOR: Record<string, string> = {
  AGENDADO:   '#378ADD',
  CONFIRMADO: '#0F6E56',
  AGUARDANDO: '#EF9F27',
  ATENDIDO:   '#1D9E75',
  FALTOU:     '#E24B4A',
  CANCELADO:  '#888780',
}

const STATUS_LABEL: Record<string, string> = {
  AGENDADO:   'Agendado',
  CONFIRMADO: 'Confirmado',
  AGUARDANDO: 'Aguardando',
  ATENDIDO:   'Atendido',
  FALTOU:     'Faltou',
  CANCELADO:  'Cancelado',
}

function durMinutes(ag: AgendamentoListItem) {
  return (new Date(ag.data_hora_fim).getTime() - new Date(ag.data_hora_inicio).getTime()) / 60000
}

const SLOT_H = 44

export default function AgendamentoPage() {
  const [view, setView]                   = useState<ViewMode>('dia')
  const [refDate, setRefDate]             = useState(new Date())
  const [selectedDay, setSelectedDay]     = useState(new Date())
  const [agendamentos, setAgendamentos]   = useState<AgendamentoListItem[]>([])
  const [profissionais, setProfissionais] = useState<ProfissionalListItem[]>([])
  const [profFiltro, setProfFiltro]       = useState<number>(0)
  const [loading, setLoading]             = useState(false)
  const [calMes, setCalMes]               = useState(new Date())
  const [agsMes, setAgsMes]               = useState<Set<string>>(new Set())

  const [modalOpen, setModalOpen]       = useState(false)
  const [editAg, setEditAg]             = useState<AgendamentoListItem | null>(null)
  const [slotInicio, setSlotInicio]     = useState<Date | null>(null)
  const [buscandoSlot, setBuscandoSlot] = useState(false)

  const periodo = useMemo(() => {
    if (view === 'dia') return { ini: selectedDay, fim: selectedDay }
    if (view === 'semana') {
      const ini = startOfWeek(refDate, { weekStartsOn: 0 })
      return { ini, fim: endOfWeek(refDate, { weekStartsOn: 0 }) }
    }
    return { ini: startOfMonth(refDate), fim: endOfMonth(refDate) }
  }, [view, refDate, selectedDay])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({
        inicio: format(periodo.ini, 'yyyy-MM-dd'),
        fim:    format(periodo.fim, 'yyyy-MM-dd'),
      })
      if (profFiltro) sp.set('profissional_id', String(profFiltro))
      const res = await fetch(`/api/clinica/agendamentos?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar agenda'); return }
      const data = await res.json()
      setAgendamentos(data.dados ?? [])
    } finally { setLoading(false) }
  }, [periodo, profFiltro])

  const carregarMes = useCallback(async () => {
    const ini = startOfMonth(calMes)
    const fim = endOfMonth(calMes)
    const sp = new URLSearchParams({
      inicio: format(ini, 'yyyy-MM-dd'),
      fim:    format(fim, 'yyyy-MM-dd'),
    })
    if (profFiltro) sp.set('profissional_id', String(profFiltro))
    const res = await fetch(`/api/clinica/agendamentos?${sp}`)
    if (!res.ok) return
    const data = await res.json()
    const dias = new Set<string>(
      (data.dados ?? []).map((a: AgendamentoListItem) =>
        format(parseISO(a.data_hora_inicio), 'yyyy-MM-dd')
      )
    )
    setAgsMes(dias)
  }, [calMes, profFiltro])

  useEffect(() => {
    fetch('/api/clinica/profissionais').then(r => r.json()).then(d => {
      setProfissionais(d.dados ?? [])
    })
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarMes() }, [carregarMes])

  useEffect(() => {
    if (!isSameMonth(selectedDay, calMes)) setCalMes(selectedDay)
  }, [selectedDay])

  function navAnterior() {
    if (view === 'dia') setSelectedDay(d => addDays(d, -1))
    else if (view === 'semana') setRefDate(d => subWeeks(d, 1))
    else setRefDate(d => subMonths(d, 1))
  }
  function navProximo() {
    if (view === 'dia') setSelectedDay(d => addDays(d, 1))
    else if (view === 'semana') setRefDate(d => addWeeks(d, 1))
    else setRefDate(d => addMonths(d, 1))
  }

  function abrirNovo(dia: Date, hora?: { h: number; m: number }) {
    const dt = hora ? setMinutes(setHours(dia, hora.h), hora.m) : setHours(dia, 8)
    setEditAg(null)
    setSlotInicio(dt)
    setModalOpen(true)
  }

  function abrirEditar(ag: AgendamentoListItem, e: React.MouseEvent) {
    e.stopPropagation()
    setEditAg(ag)
    setSlotInicio(null)
    setModalOpen(true)
  }

  async function abrirNovoProximoDisponivel() {
    setBuscandoSlot(true)
    try {
      const agora = new Date()

      // próximo limite de 30 min a partir de agora
      const m = agora.getMinutes()
      let nextH = agora.getHours()
      let nextM: number
      if (m < 30) { nextM = 30 } else { nextM = 0; nextH += 1 }

      // busca agendamentos dos próximos 14 dias
      const sp = new URLSearchParams({
        inicio: format(agora, 'yyyy-MM-dd'),
        fim:    format(addDays(agora, 14), 'yyyy-MM-dd'),
      })
      if (profFiltro) sp.set('profissional_id', String(profFiltro))

      let ags: AgendamentoListItem[] = []
      const res = await fetch(`/api/clinica/agendamentos?${sp}`)
      if (res.ok) {
        const data = await res.json()
        ags = data.dados ?? []
      }

      // percorre slots dia a dia até achar o primeiro livre
      for (let d = 0; d <= 14; d++) {
        const dia = startOfDay(addDays(agora, d))
        for (const slot of HORAS) {
          if (d === 0 && (slot.h < nextH || (slot.h === nextH && slot.m < nextM))) continue

          const slotDt = setMinutes(setHours(dia, slot.h), slot.m)
          const ocupado = ags.some(ag => {
            const ini = parseISO(ag.data_hora_inicio)
            const fim = parseISO(ag.data_hora_fim)
            return slotDt >= ini && slotDt < fim
          })

          if (!ocupado) {
            setEditAg(null)
            setSlotInicio(slotDt)
            setModalOpen(true)
            return
          }
        }
      }

      // fallback: próximo dia útil às 8h
      setEditAg(null)
      setSlotInicio(setHours(addDays(agora, 1), 8))
      setModalOpen(true)
    } finally {
      setBuscandoSlot(false)
    }
  }

  const tituloNav = useMemo(() => {
    if (view === 'dia')
      return format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })
    if (view === 'semana') {
      const ini = startOfWeek(refDate, { weekStartsOn: 0 })
      const fim = endOfWeek(refDate, { weekStartsOn: 0 })
      return `${format(ini, "d 'de' MMM", { locale: ptBR })} – ${format(fim, "d 'de' MMM yyyy", { locale: ptBR })}`
    }
    return format(refDate, "MMMM 'de' yyyy", { locale: ptBR })
  }, [view, refDate, selectedDay])

  // ── Mini Calendário ──────────────────────────────────────────
  function renderSidebar() {
    const primeiroDia  = startOfMonth(calMes)
    const gradeInicio  = startOfWeek(primeiroDia, { weekStartsOn: 0 })
    const gradeFim     = endOfWeek(endOfMonth(calMes), { weekStartsOn: 0 })
    const diasGrade    = eachDayOfInterval({ start: gradeInicio, end: gradeFim })

    return (
      <div style={{
        width: 236, flexShrink: 0,
        borderLeft: '0.5px solid var(--borda-suave)',
        display: 'flex', flexDirection: 'column',
        overflow: 'auto',
      }}>
        {/* Navegação do mês */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 12px 10px',
          borderBottom: '0.5px solid var(--borda-suave)',
        }}>
          <button
            onClick={() => setCalMes(d => subMonths(d, 1))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--texto-terciario)', display: 'flex', alignItems: 'center', borderRadius: 4 }}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--texto-principal)', textTransform: 'capitalize' }}>
            {format(calMes, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <button
            onClick={() => setCalMes(d => addMonths(d, 1))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--texto-terciario)', display: 'flex', alignItems: 'center', borderRadius: 4 }}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Grade do mini calendário */}
        <div style={{ padding: '8px 10px 12px' }}>
          {/* Cabeçalho dias da semana */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
              <div key={i} style={{
                textAlign: 'center', fontSize: 10, fontWeight: 700,
                color: 'var(--texto-terciario)', padding: '4px 0',
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Dias */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 1 }}>
            {diasGrade.map(dia => {
              const key        = format(dia, 'yyyy-MM-dd')
              const isSelected = isSameDay(dia, selectedDay)
              const mesAtual   = isSameMonth(dia, calMes)
              const temAg      = agsMes.has(key)
              const hoje       = isToday(dia)

              return (
                <div
                  key={key}
                  onClick={() => {
                    setSelectedDay(dia)
                    if (view !== 'dia') setView('dia')
                  }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    cursor: 'pointer', paddingBottom: 2,
                  }}
                >
                  <div style={{
                    width: 26, height: 26,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%',
                    fontSize: 11,
                    fontWeight: isSelected || hoje ? 700 : 400,
                    color: isSelected
                      ? '#fff'
                      : hoje
                      ? 'var(--cor-primaria)'
                      : mesAtual
                      ? 'var(--texto-principal)'
                      : 'var(--texto-terciario)',
                    background: isSelected
                      ? 'var(--cor-primaria)'
                      : hoje && !isSelected
                      ? 'var(--cor-primaria-light)'
                      : 'transparent',
                    transition: 'background 0.1s',
                    opacity: mesAtual ? 1 : 0.4,
                  }}>
                    {format(dia, 'd')}
                  </div>
                  <div style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: isSelected
                      ? 'rgba(255,255,255,0.6)'
                      : 'var(--cor-primaria)',
                    opacity: temAg && mesAtual ? 1 : 0,
                    marginTop: 1,
                  }} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Legenda */}
        <div style={{ padding: '12px 14px', borderTop: '0.5px solid var(--borda-suave)' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)',
            textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10,
          }}>
            Legenda
          </div>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <div key={k} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12, color: 'var(--texto-secundario)', marginBottom: 7,
            }}>
              <div style={{
                width: 9, height: 9, borderRadius: 2,
                background: STATUS_COLOR[k], flexShrink: 0,
              }} />
              {v}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Visão Dia ─────────────────────────────────────────────────
  function renderDia() {
    const agsHoje = agendamentos.filter(ag =>
      isSameDay(parseISO(ag.data_hora_inicio), selectedDay)
    )

    const agora = new Date()
    const minutoAtual = agora.getHours() * 60 + agora.getMinutes()

    return (
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Cabeçalho do dia */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '0.5px solid var(--borda-suave)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--texto-principal)', textTransform: 'capitalize' }}>
            {format(selectedDay, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--texto-terciario)',
            background: 'var(--bg-hover)', padding: '2px 10px', borderRadius: 20,
          }}>
            {agsHoje.length} agendamento{agsHoje.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Grade de horários */}
        {HORAS.map(slot => {
          const slotMin   = slot.h * 60 + slot.m
          const isAtual   = isToday(selectedDay) && minutoAtual >= slotMin && minutoAtual < slotMin + 30
          const isMeia    = slot.m === 30
          const slotDt    = setMinutes(setHours(selectedDay, slot.h), slot.m)
          const isPast    = slotDt < agora && !isAtual
          const ags       = agsHoje.filter(ag => {
            const ini = parseISO(ag.data_hora_inicio)
            return ini.getHours() === slot.h && ini.getMinutes() === slot.m
          })
          // slot coberto por agendamento que começou antes
          const isOccupied = agsHoje.some(ag => {
            const ini = parseISO(ag.data_hora_inicio)
            const fim = parseISO(ag.data_hora_fim)
            return slotDt >= ini && slotDt < fim
          })

          return (
            <div
              key={slot.label}
              onClick={() => !isPast && !isOccupied && abrirNovo(selectedDay, slot)}
              style={{
                display: 'flex',
                minHeight: SLOT_H,
                borderBottom: `0.5px solid ${isMeia ? 'var(--borda-suave)' : 'rgba(0,0,0,0.03)'}`,
                background: isAtual
                  ? 'rgba(15,110,86,0.04)'
                  : isPast
                  ? 'rgba(0,0,0,0.012)'
                  : isOccupied && ags.length === 0
                  ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.025) 4px, rgba(0,0,0,0.025) 8px)'
                  : undefined,
                cursor: isPast || isOccupied ? 'default' : 'pointer',
                opacity: isPast && !isOccupied ? 0.45 : 1,
              }}
            >
              {/* Coluna hora */}
              <div style={{
                width: 58, flexShrink: 0,
                display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                paddingRight: 10, paddingTop: 7,
                fontSize: 11, fontWeight: 500,
                color: isAtual ? 'var(--cor-primaria)' : 'var(--texto-terciario)',
                borderRight: `0.5px solid ${isAtual ? 'var(--cor-primaria)' : 'var(--borda-suave)'}`,
              }}>
                {slot.m === 0 ? slot.label : ''}
              </div>

              {/* Área de agendamentos */}
              <div style={{ flex: 1, padding: ags.length ? '4px 10px' : '0 10px', position: 'relative' }}>
                {ags.map(ag => {
                  const dur         = durMinutes(ag)
                  const statusColor = STATUS_COLOR[ag.status] ?? '#378ADD'
                  const tipoColor   = ag.tipo_cor ?? statusColor
                  return (
                    <div
                      key={ag.id}
                      onClick={e => abrirEditar(ag, e)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        background: statusColor + '12',
                        border: `0.5px solid ${statusColor}35`,
                        borderLeft: `3px solid ${statusColor}`,
                        borderRadius: 7,
                        padding: '7px 12px',
                        marginBottom: 3,
                        cursor: 'pointer',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = statusColor + '22' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = statusColor + '12' }}
                    >
                      {/* Hora */}
                      <div style={{
                        fontSize: 12, fontWeight: 700, color: statusColor,
                        width: 38, flexShrink: 0,
                      }}>
                        {format(parseISO(ag.data_hora_inicio), 'HH:mm')}
                      </div>

                      {/* Paciente + info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: 600, fontSize: 13,
                          color: 'var(--texto-principal)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {ag.paciente_nome}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                          {ag.tipo_descricao && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ width: 7, height: 7, borderRadius: 2, background: tipoColor, flexShrink: 0, display: 'inline-block' }} />
                              {ag.tipo_descricao}
                            </span>
                          )}
                          {ag.tipo_descricao && <span>·</span>}
                          <span>{ag.profissional_nome}</span>
                          <span>·</span>
                          <span>{dur}min</span>
                        </div>
                      </div>

                      {/* Observação */}
                      {ag.observacao && (
                        <div style={{
                          fontSize: 11, color: 'var(--texto-terciario)',
                          maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden',
                          textOverflow: 'ellipsis', flexShrink: 1,
                          fontStyle: 'italic',
                        }}
                          title={ag.observacao}
                        >
                          {ag.observacao}
                        </div>
                      )}

                      {/* Telefone */}
                      {ag.paciente_celular && (
                        <div style={{
                          fontSize: 11, color: 'var(--texto-terciario)',
                          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3,
                        }}>
                          {ag.paciente_celular}
                        </div>
                      )}

                      {/* Categoria */}
                      {ag.categoria_descricao && (
                        <div style={{
                          fontSize: 11, fontWeight: 500,
                          color: 'var(--texto-secundario)',
                          background: 'var(--bg-hover)',
                          padding: '2px 9px', borderRadius: 20,
                          flexShrink: 0,
                        }}>
                          {ag.categoria_descricao}
                        </div>
                      )}

                      {/* Status badge */}
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: statusColor,
                        background: statusColor + '18',
                        padding: '2px 9px', borderRadius: 20,
                        flexShrink: 0,
                      }}>
                        {STATUS_LABEL[ag.status]}
                      </div>
                    </div>
                  )
                })}

                {/* Hint slot vazio */}
                {ags.length === 0 && !isOccupied && slot.m === 0 && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', paddingLeft: 10,
                    opacity: 0, transition: 'opacity 0.15s',
                    fontSize: 11, color: 'var(--cor-primaria)',
                    pointerEvents: 'none',
                  }}
                  className="slot-hint"
                  >
                    <Plus size={11} style={{ marginRight: 3 }} /> agendar
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Visão Semana ─────────────────────────────────────────────
  function renderSemana() {
    const dias = eachDayOfInterval(periodo)
    return (
      <div style={{ overflow: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '58px repeat(7, 1fr)', minWidth: 700 }}>

          <div style={{ height: 48, borderBottom: '0.5px solid var(--borda-suave)' }} />
          {dias.map(dia => (
            <div
              key={dia.toISOString()}
              style={{
                height: 48, borderBottom: '0.5px solid var(--borda-suave)',
                borderLeft: '0.5px solid var(--borda-suave)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                background: isToday(dia) ? 'rgba(15,110,86,0.04)' : undefined,
              }}
              onClick={() => { setSelectedDay(dia); setView('dia') }}
            >
              <div style={{ fontSize: 10, color: 'var(--texto-terciario)', textTransform: 'uppercase', fontWeight: 600 }}>
                {format(dia, 'EEE', { locale: ptBR })}
              </div>
              <div style={{
                fontSize: 18, fontWeight: isToday(dia) ? 700 : 400,
                color: isToday(dia) ? 'var(--cor-primaria)' : 'var(--texto-principal)',
                width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '50%',
                background: isToday(dia) ? 'var(--cor-primaria-light)' : undefined,
              }}>
                {format(dia, 'd')}
              </div>
            </div>
          ))}

          {HORAS.map(slot => (
            <>
              <div
                key={`h-${slot.label}`}
                style={{
                  height: SLOT_H,
                  borderBottom: slot.m === 30 ? '0.5px solid var(--borda-suave)' : 'none',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                  paddingRight: 8, paddingTop: 4,
                  fontSize: 10, color: 'var(--texto-terciario)', fontWeight: 500,
                }}
              >
                {slot.m === 0 ? slot.label : ''}
              </div>

              {dias.map(dia => {
                const ags = agendamentos.filter(ag => {
                  const ini = parseISO(ag.data_hora_inicio)
                  return isSameDay(ini, dia) && ini.getHours() === slot.h && ini.getMinutes() === slot.m
                })
                return (
                  <div
                    key={`${dia.toISOString()}-${slot.label}`}
                    style={{
                      height: SLOT_H,
                      borderLeft: '0.5px solid var(--borda-suave)',
                      borderBottom: slot.m === 30 ? '0.5px solid var(--borda-suave)' : '0.5px solid rgba(0,0,0,0.03)',
                      position: 'relative',
                      cursor: 'pointer',
                      background: isToday(dia) ? 'rgba(15,110,86,0.02)' : undefined,
                    }}
                    onClick={() => abrirNovo(dia, slot)}
                  >
                    {ags.map(ag => {
                      const dur         = durMinutes(ag)
                      const statusColor = STATUS_COLOR[ag.status] ?? '#378ADD'
                      const height      = Math.max((dur / 30) * SLOT_H - 2, SLOT_H - 2)
                      return (
                        <div
                          key={ag.id}
                          onClick={e => abrirEditar(ag, e)}
                          style={{
                            position: 'absolute', left: 2, right: 2, top: 2,
                            height, zIndex: 2,
                            background: statusColor + '20',
                            borderLeft: `3px solid ${statusColor}`,
                            borderRadius: 4,
                            padding: '2px 6px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 11, fontWeight: 600, color: statusColor, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ag.paciente_nome}
                          </div>
                          {dur >= 30 && (
                            <div style={{ fontSize: 10, color: 'var(--texto-terciario)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {ag.tipo_descricao ?? STATUS_LABEL[ag.status]}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>
    )
  }

  // ── Visão Mês ────────────────────────────────────────────────
  function renderMes() {
    const primeiroDia = startOfMonth(refDate)
    const gradeInicio = startOfWeek(primeiroDia, { weekStartsOn: 0 })
    const gradeFim    = endOfWeek(endOfMonth(refDate), { weekStartsOn: 0 })
    const semanas: Date[][] = []
    let semana: Date[] = []

    eachDayOfInterval({ start: gradeInicio, end: gradeFim }).forEach(dia => {
      semana.push(dia)
      if (semana.length === 7) { semanas.push(semana); semana = [] }
    })

    return (
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '0.5px solid var(--borda-suave)' }}>
          {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
            <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--texto-terciario)', textTransform: 'uppercase' }}>
              {d}
            </div>
          ))}
        </div>
        {semanas.map((sem, si) => (
          <div key={si} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {sem.map(dia => {
              const ags      = agendamentos.filter(ag => isSameDay(parseISO(ag.data_hora_inicio), dia))
              const mesAtual = dia.getMonth() === refDate.getMonth()
              return (
                <div
                  key={dia.toISOString()}
                  style={{
                    minHeight: 90,
                    border: '0.5px solid var(--borda-suave)',
                    padding: '4px 6px',
                    opacity: mesAtual ? 1 : 0.35,
                    cursor: 'pointer',
                    background: isToday(dia) ? 'rgba(15,110,86,0.03)' : undefined,
                  }}
                  onClick={() => { setSelectedDay(dia); setView('dia') }}
                >
                  <div style={{
                    fontSize: 12, fontWeight: isToday(dia) ? 700 : 400,
                    color: isToday(dia) ? 'var(--cor-primaria)' : 'var(--texto-secundario)',
                    width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%',
                    background: isToday(dia) ? 'var(--cor-primaria-light)' : undefined,
                    marginBottom: 4,
                  }}>
                    {format(dia, 'd')}
                  </div>
                  {ags.slice(0, 3).map(ag => {
                    const statusColor = STATUS_COLOR[ag.status] ?? '#378ADD'
                    return (
                      <div
                        key={ag.id}
                        onClick={e => abrirEditar(ag, e)}
                        style={{
                          fontSize: 11, fontWeight: 500,
                          background: statusColor + '20',
                          borderLeft: `2px solid ${statusColor}`,
                          borderRadius: 3,
                          padding: '1px 5px',
                          marginBottom: 2,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          color: 'var(--texto-principal)',
                        }}
                      >
                        {format(parseISO(ag.data_hora_inicio), 'HH:mm')} {ag.paciente_nome}
                      </div>
                    )
                  })}
                  {ags.length > 3 && (
                    <div style={{ fontSize: 10, color: 'var(--texto-terciario)', paddingLeft: 4 }}>
                      +{ags.length - 3} mais
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  // ── Visão Lista ──────────────────────────────────────────────
  function renderLista() {
    const agOrdenados = [...agendamentos].sort((a, b) =>
      new Date(a.data_hora_inicio).getTime() - new Date(b.data_hora_inicio).getTime()
    )
    const porDia = new Map<string, AgendamentoListItem[]>()
    for (const ag of agOrdenados) {
      const key = format(parseISO(ag.data_hora_inicio), 'yyyy-MM-dd')
      if (!porDia.has(key)) porDia.set(key, [])
      porDia.get(key)!.push(ag)
    }

    if (agOrdenados.length === 0) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--texto-terciario)', fontSize: 14 }}>
          Nenhum agendamento no período
        </div>
      )
    }

    return (
      <div style={{ flex: 1, overflow: 'auto' }}>
        {Array.from(porDia.entries()).map(([key, ags]) => (
          <div key={key}>
            <div style={{ padding: '10px 16px 6px', fontSize: 11, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.05em', background: 'var(--bg-page)', borderBottom: '0.5px solid var(--borda-suave)' }}>
              {format(parseISO(key), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </div>
            {ags.map(ag => {
              const statusColor = STATUS_COLOR[ag.status] ?? '#378ADD'
              const tipoColor   = ag.tipo_cor ?? statusColor
              return (
                <div
                  key={ag.id}
                  onClick={e => abrirEditar(ag, e)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 16px',
                    borderBottom: '0.5px solid var(--borda-suave)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: statusColor, flexShrink: 0 }} />
                  <div style={{ width: 50, fontSize: 13, fontWeight: 600, color: 'var(--texto-secundario)', flexShrink: 0 }}>
                    {format(parseISO(ag.data_hora_inicio), 'HH:mm')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ag.paciente_nome}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--texto-terciario)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {ag.tipo_descricao && (
                        <>
                          <span style={{ width: 7, height: 7, borderRadius: 2, background: tipoColor, flexShrink: 0, display: 'inline-block' }} />
                          {ag.tipo_descricao} ·{' '}
                        </>
                      )}
                      {ag.profissional_nome}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: statusColor, background: statusColor + '20', padding: '2px 9px', borderRadius: 20, flexShrink: 0 }}>
                    {STATUS_LABEL[ag.status]}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <style>{`
        .slot-row:hover .slot-hint { opacity: 1 !important; }
        .slot-row:hover { background: rgba(15,110,86,0.02) !important; }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>

        {/* Toolbar */}
        <div className="page-header" style={{ paddingBottom: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Stethoscope size={18} style={{ color: 'var(--cor-primaria)' }} />
            <h1 className="page-title">Agenda</h1>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Filtro profissional */}
            <select
              className="input-field"
              style={{ width: 180, fontSize: 12 }}
              value={profFiltro}
              onChange={e => setProfFiltro(Number(e.target.value))}
            >
              <option value={0}>Todos os profissionais</option>
              {profissionais.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>

            {/* Navegação */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button className="btn-ghost" style={{ padding: '6px 8px' }} onClick={navAnterior}>
                <ChevronLeft size={16} />
              </button>
              <button
                className="btn-ghost"
                style={{ fontSize: 12, fontWeight: 600, minWidth: 200, textAlign: 'center', padding: '6px 10px', textTransform: 'capitalize' }}
                onClick={() => { setRefDate(new Date()); setSelectedDay(new Date()) }}
              >
                {tituloNav}
              </button>
              <button className="btn-ghost" style={{ padding: '6px 8px' }} onClick={navProximo}>
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Views */}
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-card)', border: '0.5px solid var(--borda-suave)', borderRadius: 6, padding: 2 }}>
              {[
                { key: 'dia',    icon: <CalendarDays size={13} />, label: 'Dia' },
                { key: 'semana', icon: <LayoutGrid size={13} />,   label: 'Semana' },
                { key: 'mes',    icon: <LayoutGrid size={13} />,   label: 'Mês' },
                { key: 'lista',  icon: <List size={13} />,         label: 'Lista' },
              ].map(v => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key as ViewMode)}
                  className={view === v.key ? 'btn-primary' : 'btn-ghost'}
                  style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, borderRadius: 4, border: 'none' }}
                >
                  {v.icon} {v.label}
                </button>
              ))}
            </div>

            <button
              className="btn-ghost"
              style={{ padding: '6px 8px' }}
              onClick={() => { carregar(); carregarMes() }}
              title="Atualizar"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>

            <button
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: buscandoSlot ? 0.7 : 1 }}
              disabled={buscandoSlot}
              onClick={abrirNovoProximoDisponivel}
            >
              {buscandoSlot
                ? <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <Plus size={14} />
              }
              {buscandoSlot ? 'Buscando...' : 'Novo Agendamento'}
            </button>
          </div>
        </div>

        {/* Corpo principal */}
        <div className="page-body" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingTop: 0 }}>
          <div className="card" style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: 0 }}>

            {/* Conteúdo principal */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {view === 'dia'    && renderDia()}
              {view === 'semana' && renderSemana()}
              {view === 'mes'    && renderMes()}
              {view === 'lista'  && renderLista()}
            </div>

            {/* Sidebar: mini calendário + legenda */}
            {renderSidebar()}
          </div>
        </div>
      </div>

      <AgendamentoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { carregar(); carregarMes() }}
        agendamento={editAg}
        dataHoraInicio={slotInicio}
        profissionalPre={profissionais.find(p => p.id === profFiltro) ?? null}
      />
    </>
  )
}
