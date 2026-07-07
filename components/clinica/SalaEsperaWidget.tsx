'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import { Clock, Users, ArrowRight, CheckCircle2 } from 'lucide-react'
import type { AgendamentoListItem } from '@/types/clinica.types'

function fmtWait(mins: number): string {
  if (mins < 1) return '< 1min'
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60), m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

function waitColor(mins: number): { text: string; bg: string } {
  if (mins < 15) return { text: '#1D9E75', bg: '#E1F5EE' }
  if (mins < 30) return { text: '#D97706', bg: '#FEF3C7' }
  return { text: '#DC2626', bg: '#FEE2E2' }
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (!p.length) return '?'
  return p.length === 1
    ? p[0][0].toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

const AVATAR_COLORS = [
  '#0F6E56', '#378ADD', '#8B5CF6', '#EC4899',
  '#14B8A6', '#F97316', '#EF9F27', '#475569',
]

function avatarBg(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export default function SalaEsperaWidget() {
  const [lista, setLista]   = useState<AgendamentoListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [agora, setAgora]   = useState(() => new Date())

  const carregar = useCallback(async () => {
    try {
      const hoje   = format(new Date(), 'yyyy-MM-dd')
      const params = new URLSearchParams({ inicio: hoje, fim: hoje, status: 'AGUARDANDO' })
      const res    = await fetch(`/api/clinica/agendamentos?${params}`)
      if (!res.ok) return
      const data   = await res.json()
      const sorted: AgendamentoListItem[] = [...(data.dados ?? [])].sort((a, b) => {
        const agA = +new Date(a.data_hora_inicio)
        const agB = +new Date(b.data_hora_inicio)
        if (agA !== agB) return agA - agB
        const chA = a.horario_chegada ? +new Date(a.horario_chegada) : Infinity
        const chB = b.horario_chegada ? +new Date(b.horario_chegada) : Infinity
        return chA - chB
      })
      setLista(sorted)
      setAgora(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  // Carrega ao montar e a cada 60s
  useEffect(() => {
    carregar()
    const id = setInterval(carregar, 60_000)
    return () => clearInterval(id)
  }, [carregar])

  // Relógio ao vivo para os tempos
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const stats = useMemo(() => {
    if (!lista.length) return null
    const waits = lista.map(ag => {
      const ch = ag.horario_chegada ? parseISO(ag.horario_chegada) : parseISO(ag.data_hora_inicio)
      return differenceInMinutes(agora, ch)
    })
    return { total: lista.length, criticos: waits.filter(w => w >= 30).length }
  }, [lista, agora])

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Cabeçalho */}
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Users size={15} style={{ color: 'var(--cor-primaria)' }} />
          <span className="card-title">Sala de Espera</span>
          {stats && stats.total > 0 && (
            <span style={{
              marginLeft: 2,
              background: stats.criticos > 0 ? '#FEE2E2' : 'var(--cor-primaria-light)',
              color:      stats.criticos > 0 ? '#DC2626' : 'var(--cor-primaria)',
              fontSize: 11, fontWeight: 700,
              padding: '1px 7px', borderRadius: 20,
            }}>
              {stats.total}
            </span>
          )}
        </div>
        <Link href="/clinica/sala-espera" style={{
          fontSize: 12, fontWeight: 500, color: 'var(--cor-primaria)',
          textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3,
        }}>
          Ver tudo <ArrowRight size={12} />
        </Link>
      </div>

      {/* Corpo */}
      <div style={{ padding: 0 }}>
        {loading ? (
          <div style={{
            height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: 'var(--texto-terciario)',
          }}>
            Carregando…
          </div>
        ) : lista.length === 0 ? (
          <div style={{
            height: 90, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <CheckCircle2 size={22} style={{ color: '#1D9E75' }} />
            <span style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>
              Nenhum paciente aguardando
            </span>
          </div>
        ) : (
          lista.slice(0, 5).map((ag, idx) => {
            const chegada  = ag.horario_chegada ? parseISO(ag.horario_chegada) : null
            const waitMins = chegada ? differenceInMinutes(agora, chegada) : 0
            const wc       = waitColor(waitMins)
            const ini      = initials(ag.paciente_nome)
            const ab       = avatarBg(ag.paciente_nome)

            return (
              <div key={ag.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 16px',
                borderBottom: idx < lista.slice(0, 5).length - 1
                  ? '0.5px solid var(--borda-suave)' : 'none',
              }}>
                {/* Posição */}
                <span style={{
                  width: 18, textAlign: 'center',
                  fontSize: 11, fontWeight: 700, color: 'var(--texto-terciario)',
                  flexShrink: 0,
                }}>
                  {idx + 1}
                </span>

                {/* Avatar */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: ab, color: '#fff',
                  fontWeight: 700, fontSize: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {ini}
                </div>

                {/* Nome */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ag.paciente_nome}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
                    {ag.profissional_nome} · {format(parseISO(ag.data_hora_inicio), 'HH:mm')}
                  </div>
                </div>

                {/* Tempo de espera */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: wc.bg, color: wc.text,
                  padding: '3px 8px', borderRadius: 6,
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                  <Clock size={11} />
                  {chegada ? fmtWait(waitMins) : '—'}
                </div>
              </div>
            )
          })
        )}

        {/* "Ver mais" se houver mais de 5 */}
        {lista.length > 5 && (
          <div style={{
            padding: '8px 16px',
            borderTop: '0.5px solid var(--borda-suave)',
            textAlign: 'center',
          }}>
            <Link href="/clinica/sala-espera" style={{
              fontSize: 12, color: 'var(--texto-terciario)', textDecoration: 'none',
            }}>
              + {lista.length - 5} mais aguardando
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
