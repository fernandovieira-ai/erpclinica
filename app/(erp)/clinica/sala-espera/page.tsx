'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  format, parseISO, differenceInMinutes,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Clock, Users, RefreshCw, Stethoscope,
  CalendarDays, UserCheck, AlertTriangle, CheckCircle2, Timer, ClipboardList,
} from 'lucide-react'
import { toast } from 'sonner'
import PacienteCheckInFormModal from '@/components/clinica/PacienteCheckInFormModal'
import type { AgendamentoListItem, ProfissionalListItem } from '@/types/clinica.types'

// ─── helpers ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#0F6E56', '#378ADD', '#8B5CF6', '#EC4899',
  '#14B8A6', '#F97316', '#EF9F27', '#475569',
]

function avatarColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return p.length === 1
    ? p[0][0].toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

type WaitLevel = 'ok' | 'aviso' | 'alerta' | 'critico'

function waitLevel(mins: number): WaitLevel {
  if (mins < 15) return 'ok'
  if (mins < 30) return 'aviso'
  if (mins < 60) return 'alerta'
  return 'critico'
}

const LEVEL_STYLE: Record<WaitLevel, { text: string; bg: string; border: string; label: string }> = {
  ok:      { text: '#1D9E75', bg: '#E1F5EE', border: '#1D9E75', label: 'Em dia' },
  aviso:   { text: '#D97706', bg: '#FEF3C7', border: '#EF9F27', label: 'Aguardando' },
  alerta:  { text: '#DC2626', bg: '#FEE2E2', border: '#E24B4A', label: 'Longa espera' },
  critico: { text: '#991B1B', bg: '#FEE2E2', border: '#B91C1C', label: 'Crítico' },
}

function fmtWait(mins: number): string {
  if (mins < 1) return '< 1min'
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60), m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

const POSITION_STYLE = [
  { bg: 'linear-gradient(135deg,#F59E0B,#FBBF24)', shadow: '0 2px 8px rgba(245,158,11,.35)' },
  { bg: 'linear-gradient(135deg,#6B7280,#9CA3AF)', shadow: '0 2px 8px rgba(107,114,128,.35)' },
  { bg: 'linear-gradient(135deg,#B45309,#D97706)', shadow: '0 2px 8px rgba(180,83,9,.35)'   },
]

// ─── page ─────────────────────────────────────────────────────────────────────

export default function SalaEsperaPage() {
  const [agendamentos, setAgendamentos]   = useState<AgendamentoListItem[]>([])
  const [profissionais, setProfissionais] = useState<ProfissionalListItem[]>([])
  const [profFiltro, setProfFiltro]       = useState<number>(0)
  const [loading, setLoading]             = useState(true)
  const [ultimaAt, setUltimaAt]           = useState<Date>(new Date())
  const [countdown, setCountdown]         = useState(30)
  const [agora, setAgora]                 = useState(() => new Date())

  const [modalPacienteOpen,   setModalPacienteOpen]   = useState(false)
  const [pacienteDados,       setPacienteDados]       = useState<any>(null)
  const [agendamentoAtual,    setAgendamentoAtual]    = useState<AgendamentoListItem | null>(null)
  const [agendamentosAtuais,  setAgendamentosAtuais]  = useState<AgendamentoListItem[]>([])

  // Relógio ao vivo para o tempo de espera
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const hoje   = format(new Date(), 'yyyy-MM-dd')
      const params = new URLSearchParams({ inicio: hoje, fim: hoje, status: 'AGUARDANDO' })
      if (profFiltro) params.set('profissional_id', String(profFiltro))

      const res = await fetch(`/api/clinica/agendamentos?${params}`)
      if (!res.ok) return
      const data = await res.json()

      const sorted: AgendamentoListItem[] = [...(data.dados ?? [])].sort((a, b) => {
        const agA = new Date(a.data_hora_inicio).getTime()
        const agB = new Date(b.data_hora_inicio).getTime()
        if (agA !== agB) return agA - agB
        const chA = a.horario_chegada ? new Date(a.horario_chegada).getTime() : Infinity
        const chB = b.horario_chegada ? new Date(b.horario_chegada).getTime() : Infinity
        return chA - chB
      })

      setAgendamentos(sorted)
      setUltimaAt(new Date())
      setAgora(new Date())
    } finally {
      setLoading(false)
    }
  }, [profFiltro])

  // Auto-refresh a cada 30 s com countdown
  useEffect(() => {
    carregar()
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { carregar(); return 30 }
        return prev - 1
      })
    }, 1_000)
    return () => clearInterval(id)
  }, [carregar])

  function refreshManual() {
    setCountdown(30)
    carregar()
  }

  async function abrirAtendimento(ag: AgendamentoListItem) {
    try {
      const res = await fetch(`/api/cadastro/pessoas/${ag.paciente_id}`)
      if (!res.ok) { toast.error('Erro ao carregar dados do paciente'); return }
      const data    = await res.json()
      const diaAg   = format(parseISO(ag.data_hora_inicio), 'yyyy-MM-dd')
      const todosNoDia = agendamentos.filter(a =>
        a.paciente_id === ag.paciente_id &&
        format(parseISO(a.data_hora_inicio), 'yyyy-MM-dd') === diaAg
      ).sort((a, b) => new Date(a.data_hora_inicio).getTime() - new Date(b.data_hora_inicio).getTime())
      setPacienteDados(data)
      setAgendamentoAtual(ag)
      setAgendamentosAtuais(todosNoDia.length > 1 ? todosNoDia : [])
      setModalPacienteOpen(true)
    } catch {
      toast.error('Erro ao carregar dados do paciente')
    }
  }

  function fecharModalPaciente() {
    setModalPacienteOpen(false)
    setPacienteDados(null)
    setAgendamentoAtual(null)
    setAgendamentosAtuais([])
  }

  // Carrega profissionais uma vez
  useEffect(() => {
    fetch('/api/clinica/profissionais')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setProfissionais(d.dados ?? d) })
      .catch(() => {})
  }, [])

  // Se o usuário logado está vinculado a um profissional, pré-seleciona o filtro
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.profissional_id) setProfFiltro(d.profissional_id)
    }).catch(() => {})
  }, [])

  // Estatísticas resumidas
  const stats = useMemo(() => {
    if (!agendamentos.length) return null
    const waits = agendamentos.map(ag => {
      const ch = ag.horario_chegada ? parseISO(ag.horario_chegada) : parseISO(ag.data_hora_inicio)
      return differenceInMinutes(agora, ch)
    })
    return {
      total:    agendamentos.length,
      media:    Math.round(waits.reduce((s, v) => s + v, 0) / waits.length),
      maximo:   Math.max(...waits),
      criticos: waits.filter(w => w >= 30).length,
    }
  }, [agendamentos, agora])

  return (
    <>
      <style>{`
        @keyframes pulse-urgente {
          0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,.0); }
          50%      { box-shadow: 0 0 0 6px rgba(220,38,38,.18); }
        }
        .card-critico { animation: pulse-urgente 2s ease-in-out infinite; }
        @keyframes fade-in {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .patient-card { animation: fade-in .2s ease both; }
      `}</style>

      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={18} style={{ color: 'var(--cor-primaria)' }} />
          <h1 className="page-title">Sala de Espera</h1>
          <span style={{ fontSize: 12, color: 'var(--texto-terciario)', marginLeft: 2 }}>
            {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Filtro profissional */}
          <select
            value={profFiltro}
            onChange={e => { setProfFiltro(Number(e.target.value)); setCountdown(30) }}
            style={{
              height: 32, padding: '0 10px', borderRadius: 6,
              border: '1px solid var(--borda-media)',
              background: 'var(--bg-card)', color: 'var(--texto-principal)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            <option value={0}>Todos os profissionais</option>
            {profissionais.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>

          {/* Botão refresh com countdown */}
          <button
            onClick={refreshManual}
            title="Atualizar agora"
            style={{
              height: 32, padding: '0 12px', borderRadius: 6,
              border: '1px solid var(--borda-media)',
              background: 'var(--bg-card)', color: 'var(--texto-secundario)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <RefreshCw size={13} style={{
              opacity: loading ? 0.4 : 1,
              animation: loading ? 'spin 1s linear infinite' : 'none',
            }} />
            {loading ? 'Atualizando…' : `${countdown}s`}
          </button>
        </div>
      </div>

      <div className="page-body">

        {/* Estatísticas */}
        {stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`,
            gap: 10, marginBottom: 20,
          }}>
            {/* Total */}
            <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'var(--cor-primaria-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Users size={18} style={{ color: 'var(--cor-primaria)' }} />
              </div>
              <div>
                <div className="stat-label">Aguardando</div>
                <div className="stat-value" style={{ fontSize: 22 }}>{stats.total}</div>
              </div>
            </div>

            {/* Tempo médio */}
            <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: '#E1F5EE',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Timer size={18} style={{ color: '#1D9E75' }} />
              </div>
              <div>
                <div className="stat-label">Tempo médio</div>
                <div className="stat-value" style={{ fontSize: 22 }}>{fmtWait(stats.media)}</div>
              </div>
            </div>

            {/* Maior espera */}
            <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: stats.maximo >= 30 ? '#FEE2E2' : '#E1F5EE',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Clock size={18} style={{ color: stats.maximo >= 30 ? '#DC2626' : '#1D9E75' }} />
              </div>
              <div>
                <div className="stat-label">Maior espera</div>
                <div className="stat-value" style={{
                  fontSize: 22,
                  color: stats.maximo >= 60 ? '#DC2626' : stats.maximo >= 30 ? '#D97706' : 'var(--texto-principal)',
                }}>
                  {fmtWait(stats.maximo)}
                </div>
              </div>
            </div>

            {/* Alerta se houver longos */}
            {stats.criticos > 0 && (
              <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: '#FEF3C7',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <AlertTriangle size={18} style={{ color: '#D97706' }} />
                </div>
                <div>
                  <div className="stat-label">Acima de 30min</div>
                  <div className="stat-value" style={{ fontSize: 22, color: '#D97706' }}>
                    {stats.criticos}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cards de pacientes */}
        {loading && !agendamentos.length ? (
          <div style={{
            height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--texto-terciario)', fontSize: 14,
          }}>
            Carregando…
          </div>
        ) : agendamentos.length === 0 ? (
          /* Empty state */
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: 300, gap: 14, textAlign: 'center',
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 20,
              background: 'var(--cor-primaria-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle2 size={32} style={{ color: 'var(--cor-primaria)' }} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--texto-principal)', marginBottom: 6 }}>
                Sala de espera vazia
              </div>
              <div style={{ fontSize: 13, color: 'var(--texto-terciario)' }}>
                Nenhum paciente aguardando no momento
              </div>
            </div>
            <Link href="/clinica/agendamento" style={{
              marginTop: 4, fontSize: 13, fontWeight: 500,
              color: 'var(--cor-primaria)', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <CalendarDays size={14} /> Ver agenda do dia
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {agendamentos.map((ag, idx) => {
              const chegada  = ag.horario_chegada ? parseISO(ag.horario_chegada) : null
              const waitMins = chegada ? differenceInMinutes(agora, chegada) : 0
              const level    = waitLevel(waitMins)
              const ls       = LEVEL_STYLE[level]
              const isCrit   = level === 'critico'
              const posSt    = POSITION_STYLE[idx] ?? null
              const ini      = initials(ag.paciente_nome)
              const avColor  = avatarColor(ag.paciente_nome)

              // Chegou antes ou depois do horário agendado?
              const agendadoMs = new Date(ag.data_hora_inicio).getTime()
              const chegadaMs  = chegada ? chegada.getTime() : agendadoMs
              const diffChegada = Math.round((chegadaMs - agendadoMs) / 60000)
              const chegadaLabel =
                diffChegada < -1  ? `${Math.abs(diffChegada)}min adiantado`
                : diffChegada > 5 ? `${diffChegada}min atrasado`
                : 'no horário'

              return (
                <div
                  key={ag.id}
                  className={`patient-card${isCrit ? ' card-critico' : ''}`}
                  style={{
                    animationDelay: `${idx * 40}ms`,
                    background: 'var(--bg-card)',
                    border: `0.5px solid var(--borda-suave)`,
                    borderLeft: `4px solid ${ls.border}`,
                    borderRadius: 12,
                    padding: '9px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  {/* Badge posição */}
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: posSt ? posSt.bg : 'var(--bg-hover)',
                    boxShadow: posSt ? posSt.shadow : 'none',
                    color: posSt ? '#fff' : 'var(--texto-terciario)',
                    fontWeight: 800, fontSize: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {idx + 1}
                  </div>

                  {/* Avatar iniciais */}
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                    background: avColor, color: '#fff',
                    fontWeight: 700, fontSize: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    letterSpacing: 1,
                    boxShadow: `0 2px 8px ${avColor}50`,
                  }}>
                    {ini}
                  </div>

                  {/* Informações principais */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Nome + tipo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 14, fontWeight: 700, color: 'var(--texto-principal)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        maxWidth: '28ch',
                      }}>
                        {ag.paciente_nome}
                      </span>
                      {ag.tipo_descricao && (
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: ag.tipo_cor ?? 'var(--texto-terciario)',
                          background: (ag.tipo_cor ?? '#888780') + '18',
                          border: `1px solid ${(ag.tipo_cor ?? '#888780') + '30'}`,
                          padding: '1px 8px', borderRadius: 20,
                          whiteSpace: 'nowrap',
                        }}>
                          {ag.tipo_descricao}
                        </span>
                      )}
                      {ag.categoria_descricao && (
                        <span style={{
                          fontSize: 11, fontWeight: 500,
                          color: 'var(--texto-terciario)',
                          background: 'var(--bg-hover)',
                          padding: '1px 8px', borderRadius: 20,
                          whiteSpace: 'nowrap',
                        }}>
                          {ag.categoria_descricao}
                        </span>
                      )}
                    </div>

                    {/* Metadados */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
                      <span style={{
                        fontSize: 12, color: 'var(--texto-secundario)',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <Stethoscope size={12} style={{ opacity: 0.65, flexShrink: 0 }} />
                        {ag.profissional_nome}
                      </span>

                      <span style={{
                        fontSize: 12, color: 'var(--texto-terciario)',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <CalendarDays size={12} style={{ opacity: 0.65, flexShrink: 0 }} />
                        Agendado {format(parseISO(ag.data_hora_inicio), 'HH:mm')}
                        {' '}–{' '}
                        {format(parseISO(ag.data_hora_fim), 'HH:mm')}
                      </span>

                      {chegada && (
                        <span style={{
                          fontSize: 12, color: 'var(--texto-terciario)',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <UserCheck size={12} style={{ opacity: 0.65, flexShrink: 0 }} />
                          Chegou {format(chegada, 'HH:mm')}
                          <span style={{
                            fontSize: 10, fontWeight: 600,
                            color: diffChegada < -1 ? '#1D9E75' : diffChegada > 5 ? '#D97706' : 'var(--texto-terciario)',
                            background: diffChegada < -1 ? '#E1F5EE' : diffChegada > 5 ? '#FEF3C7' : 'var(--bg-hover)',
                            padding: '1px 5px', borderRadius: 10, marginLeft: 2,
                          }}>
                            {chegadaLabel}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badge tempo de espera */}
                  <div style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: ls.bg, color: ls.text,
                    padding: '7px 12px', borderRadius: 10,
                    flexShrink: 0, gap: 2, minWidth: 72, textAlign: 'center',
                  }}>
                    <Clock size={13} />
                    <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.1, letterSpacing: -0.5 }}>
                      {chegada ? fmtWait(waitMins) : '—'}
                    </span>
                    <span style={{
                      fontSize: 8, fontWeight: 700,
                      opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                      {ls.label}
                    </span>
                  </div>

                  {/* Botão Atendimento */}
                  <button
                    type="button"
                    onClick={() => abrirAtendimento(ag)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 700, color: '#fff',
                      background: 'var(--cor-primaria)',
                      padding: '9px 14px', borderRadius: 8,
                      border: 'none', cursor: 'pointer', flexShrink: 0,
                      whiteSpace: 'nowrap',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                  >
                    <ClipboardList size={14} /> Atendimento
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Rodapé */}
        <div style={{
          marginTop: 16, textAlign: 'center',
          fontSize: 11, color: 'var(--texto-terciario)',
        }}>
          Última atualização: {format(ultimaAt, 'HH:mm:ss')}
          {' · '}
          <Link href="/clinica/agendamento" style={{ color: 'var(--cor-primaria)', textDecoration: 'none' }}>
            Ir para agenda
          </Link>
        </div>
      </div>

      <PacienteCheckInFormModal
        open={modalPacienteOpen}
        paciente={pacienteDados}
        agendamento={agendamentoAtual}
        agendamentos={agendamentosAtuais}
        onClose={fecharModalPaciente}
        onSaved={carregar}
        ocultarRecebimento
      />
    </>
  )
}
