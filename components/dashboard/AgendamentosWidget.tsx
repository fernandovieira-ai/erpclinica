'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import {
  Calendar, Clock, CheckCircle2, Users,
  TrendingUp, CalendarDays, ArrowRight, Activity, CalendarCheck,
} from 'lucide-react'

interface HojeStats {
  total: number
  agendado: number
  confirmado: number
  aguardando: number
  atendido: number
  faltou: number
  cancelado: number
}

interface ProximoAgendamento {
  id: number
  data_hora_inicio: string
  data_hora_fim: string
  status: string
  paciente_nome: string
  profissional_nome: string
  tipo_descricao?: string | null
}

interface DashboardData {
  hoje: HojeStats
  amanha: number
  semana: number
  proximos: ProximoAgendamento[]
}

type StatusKey = 'AGENDADO' | 'CONFIRMADO' | 'AGUARDANDO' | 'ATENDIDO' | 'FALTOU'

const STATUS_CFG: Record<StatusKey, { label: string; cor: string; bg: string }> = {
  AGUARDANDO: { label: 'Em Espera',  cor: '#D97706', bg: '#FEF3C7' },
  CONFIRMADO: { label: 'Confirmado', cor: '#0F6E56', bg: '#E1F5EE' },
  AGENDADO:   { label: 'Agendado',   cor: '#378ADD', bg: '#EBF4FF' },
  ATENDIDO:   { label: 'Atendido',   cor: '#1D9E75', bg: '#DCFCE7' },
  FALTOU:     { label: 'Faltou',     cor: '#E24B4A', bg: '#FEE2E2' },
}

const STATUS_ORDER: StatusKey[] = ['AGUARDANDO', 'CONFIRMADO', 'AGENDADO', 'ATENDIDO', 'FALTOU']

const AVATAR_COLORS = [
  '#0F6E56', '#378ADD', '#8B5CF6', '#EC4899',
  '#14B8A6', '#F97316', '#EF9F27', '#475569',
]

function avatarBg(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

export default function AgendamentosWidget() {
  const [data, setData]         = useState<DashboardData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [lastUpdate, setUpdate] = useState<Date | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/agendamentos')
      if (!res.ok) return
      setData(await res.json())
      setUpdate(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar()
    const id = setInterval(carregar, 60_000)
    return () => clearInterval(id)
  }, [carregar])

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="stat-card" style={{ height: 90, opacity: 0.35, background: 'var(--borda-suave)' }} />
        ))}
      </div>
    )
  }

  if (!data) return null

  const { hoje, amanha, semana, proximos } = data
  const totalNaoCancelado = Math.max(hoje.total - hoje.cancelado, 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>

        <div className="stat-card" style={{ borderLeft: '3px solid var(--cor-primaria)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="stat-label">Hoje</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--cor-primaria)', lineHeight: 1, marginTop: 6 }}>
                {hoje.total}
              </div>
              <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 4 }}>
                agendamentos
              </div>
            </div>
            <div style={{ background: 'var(--cor-primaria-light)', borderRadius: 10, padding: 8 }}>
              <Calendar size={18} style={{ color: 'var(--cor-primaria)' }} />
            </div>
          </div>
        </div>

        <div className="stat-card" style={{
          borderLeft: `3px solid ${hoje.aguardando > 0 ? '#D97706' : 'var(--borda-suave)'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="stat-label">Em Espera</div>
              <div style={{
                fontSize: 32, fontWeight: 700, lineHeight: 1, marginTop: 6,
                color: hoje.aguardando > 0 ? '#D97706' : 'var(--texto-terciario)',
              }}>
                {hoje.aguardando}
              </div>
              <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 4 }}>
                {hoje.aguardando === 1 ? 'paciente aguardando' : 'pacientes aguardando'}
              </div>
            </div>
            <div style={{ background: hoje.aguardando > 0 ? '#FEF3C7' : '#F1F5F9', borderRadius: 10, padding: 8 }}>
              <Clock size={18} style={{ color: hoje.aguardando > 0 ? '#D97706' : '#CBD5E1' }} />
            </div>
          </div>
        </div>

        <div className="stat-card" style={{
          borderLeft: `3px solid ${hoje.atendido > 0 ? '#1D9E75' : 'var(--borda-suave)'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="stat-label">Atendidos</div>
              <div style={{
                fontSize: 32, fontWeight: 700, lineHeight: 1, marginTop: 6,
                color: hoje.atendido > 0 ? '#1D9E75' : 'var(--texto-terciario)',
              }}>
                {hoje.atendido}
              </div>
              <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 4 }}>
                concluídos hoje
              </div>
            </div>
            <div style={{ background: hoje.atendido > 0 ? '#DCFCE7' : '#F1F5F9', borderRadius: 10, padding: 8 }}>
              <CheckCircle2 size={18} style={{ color: hoje.atendido > 0 ? '#1D9E75' : '#CBD5E1' }} />
            </div>
          </div>
        </div>

        <div className="stat-card" style={{
          borderLeft: `3px solid ${amanha > 0 ? '#8B5CF6' : 'var(--borda-suave)'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="stat-label">Amanhã</div>
              <div style={{
                fontSize: 32, fontWeight: 700, lineHeight: 1, marginTop: 6,
                color: amanha > 0 ? '#8B5CF6' : 'var(--texto-terciario)',
              }}>
                {amanha}
              </div>
              <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 4 }}>
                agendamentos
              </div>
            </div>
            <div style={{ background: amanha > 0 ? '#EDE9FE' : '#F1F5F9', borderRadius: 10, padding: 8 }}>
              <CalendarDays size={18} style={{ color: amanha > 0 ? '#8B5CF6' : '#CBD5E1' }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Painel + Próximos ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 12 }}>

        {/* Status do Dia */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Activity size={15} style={{ color: 'var(--cor-primaria)' }} />
              <span className="card-title">Painel do Dia</span>
            </div>
            {lastUpdate && (
              <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
                Atualizado {format(lastUpdate, 'HH:mm')}
              </span>
            )}
          </div>

          <div style={{ padding: '8px 0 4px' }}>
            {STATUS_ORDER.map(status => {
              const cfg   = STATUS_CFG[status]
              const key   = status.toLowerCase() as keyof HojeStats
              const count = (hoje[key] ?? 0) as number
              const pct   = (count / totalNaoCancelado) * 100
              return (
                <div key={status} style={{ padding: '5px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: cfg.cor, display: 'inline-block', flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 12, color: 'var(--texto-secundario)', fontWeight: 500 }}>
                        {cfg.label}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 13, fontWeight: 700,
                      color: count > 0 ? cfg.cor : 'var(--texto-terciario)',
                    }}>
                      {count}
                    </span>
                  </div>
                  <div style={{ height: 5, borderRadius: 4, background: 'var(--borda-suave)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.min(pct, 100)}%`,
                      background: cfg.cor, borderRadius: 4,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              )
            })}

            {hoje.cancelado > 0 && (
              <div style={{
                margin: '6px 16px 0',
                padding: '6px 0 0',
                borderTop: '0.5px solid var(--borda-suave)',
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>Cancelados</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#888780' }}>{hoje.cancelado}</span>
              </div>
            )}

            <div style={{
              margin: '12px 16px 4px',
              padding: '10px 12px',
              background: 'var(--cor-primaria-light)',
              borderRadius: 8,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={13} style={{ color: 'var(--cor-primaria)' }} />
                <span style={{ fontSize: 12, color: 'var(--cor-primaria)', fontWeight: 500 }}>
                  Próximos 7 dias
                </span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cor-primaria)' }}>
                {semana}
              </span>
            </div>

            <div style={{ padding: '6px 16px 8px' }}>
              <Link href="/clinica/sala-espera" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px',
                border: '1px solid var(--borda-suave)',
                borderRadius: 8,
                textDecoration: 'none',
                fontSize: 12, color: 'var(--texto-secundario)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={13} style={{ color: 'var(--texto-terciario)' }} />
                  <span>Ver sala de espera</span>
                </div>
                <ArrowRight size={12} style={{ color: 'var(--texto-terciario)' }} />
              </Link>
            </div>
          </div>
        </div>

        {/* Próximos Atendimentos */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <CalendarCheck size={15} style={{ color: 'var(--cor-primaria)' }} />
              <span className="card-title">Próximos Atendimentos</span>
              {proximos.length > 0 && (
                <span style={{
                  background: 'var(--cor-primaria-light)', color: 'var(--cor-primaria)',
                  fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                }}>
                  {proximos.length}
                </span>
              )}
            </div>
            <Link href="/clinica/agendamento" style={{
              fontSize: 12, fontWeight: 500, color: 'var(--cor-primaria)',
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3,
            }}>
              Ver agenda <ArrowRight size={12} />
            </Link>
          </div>

          <div>
            {proximos.length === 0 ? (
              <div style={{
                height: 150, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <CheckCircle2 size={28} style={{ color: '#1D9E75' }} />
                <span style={{ fontSize: 13, color: 'var(--texto-terciario)' }}>
                  Sem atendimentos pendentes hoje
                </span>
              </div>
            ) : (
              proximos.map((ag, idx) => {
                const hora    = format(parseISO(ag.data_hora_inicio), 'HH:mm')
                const horaFim = format(parseISO(ag.data_hora_fim), 'HH:mm')
                const ini     = initials(ag.paciente_nome)
                const bg      = avatarBg(ag.paciente_nome)
                const cfg     = STATUS_CFG[ag.status as StatusKey]
                const isLast  = idx === proximos.length - 1

                return (
                  <div key={ag.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px',
                    borderBottom: !isLast ? '0.5px solid var(--borda-suave)' : 'none',
                  }}>
                    {/* Horário */}
                    <div style={{ flexShrink: 0, minWidth: 42 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--texto-principal)' }}>
                        {hora}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--texto-terciario)', marginTop: 1 }}>
                        {horaFim}
                      </div>
                    </div>

                    {/* Barra colorida vertical */}
                    <div style={{
                      width: 3, height: 34, borderRadius: 2, flexShrink: 0,
                      background: cfg?.cor ?? 'var(--borda-suave)',
                    }} />

                    {/* Avatar */}
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: bg, color: '#fff',
                      fontWeight: 700, fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {ini}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {ag.paciente_nome}
                      </div>
                      <div style={{
                        fontSize: 11, color: 'var(--texto-terciario)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {ag.profissional_nome}{ag.tipo_descricao ? ` · ${ag.tipo_descricao}` : ''}
                      </div>
                    </div>

                    {/* Status Badge */}
                    {cfg && (
                      <span style={{
                        background: cfg.bg, color: cfg.cor,
                        fontSize: 10, fontWeight: 700,
                        padding: '3px 8px', borderRadius: 20,
                        flexShrink: 0, whiteSpace: 'nowrap',
                      }}>
                        {cfg.label}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
