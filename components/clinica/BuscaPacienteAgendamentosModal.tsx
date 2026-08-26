'use client'

import { useEffect, useState } from 'react'
import { X, Search, CalendarClock, Loader2 } from 'lucide-react'
import { format, parseISO, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { AgendamentoListItem } from '@/types/clinica.types'

interface Paciente {
  id:       number
  nome:     string
  cpf_cnpj: string | null
  celular:  string | null
  telefone: string | null
  cidade:   string | null
  uf:       string | null
  email:    string | null
}

interface Props {
  open:               boolean
  onClose:            () => void
  onAbrirAgendamento: (ag: AgendamentoListItem) => void
}

const STATUS_COLOR: Record<string, string> = {
  AGENDADO:   '#378ADD',
  CONFIRMADO: '#7E57C2',
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

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function BuscaPacienteAgendamentosModal({ open, onClose, onAbrirAgendamento }: Props) {
  const [busca,         setBusca]         = useState('')
  const [pacientes,     setPacientes]     = useState<Paciente[]>([])
  const [loadingBusca,  setLoadingBusca]  = useState(false)
  const [pacienteSel,   setPacienteSel]   = useState<Paciente | null>(null)
  const [agendamentos,  setAgendamentos]  = useState<AgendamentoListItem[]>([])
  const [loadingAgs,    setLoadingAgs]    = useState(false)

  useEffect(() => {
    if (!open) {
      setBusca('')
      setPacientes([])
      setPacienteSel(null)
      setAgendamentos([])
    }
  }, [open])

  useEffect(() => {
    if (pacienteSel) return
    if (busca.trim().length < 2) { setPacientes([]); return }
    setLoadingBusca(true)
    const t = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/clinica/pacientes?busca=${encodeURIComponent(busca)}`)
        const data = await res.json()
        setPacientes(data.dados ?? [])
      } catch {
        setPacientes([])
      } finally {
        setLoadingBusca(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [busca, pacienteSel])

  async function selecionarPaciente(p: Paciente) {
    setPacienteSel(p)
    setBusca(p.nome)
    setPacientes([])
    setLoadingAgs(true)
    try {
      const hoje = format(new Date(), 'yyyy-MM-dd')
      const res  = await fetch(`/api/clinica/agendamentos?paciente_id=${p.id}&inicio=${hoje}&order=asc&limit=200`)
      const data = await res.json()
      setAgendamentos(data.dados ?? [])
    } catch {
      setAgendamentos([])
    } finally {
      setLoadingAgs(false)
    }
  }

  function trocarPaciente() {
    setPacienteSel(null)
    setBusca('')
    setPacientes([])
    setAgendamentos([])
  }

  if (!open) return null

  const porDia = new Map<string, AgendamentoListItem[]>()
  for (const ag of agendamentos) {
    const key = format(parseISO(ag.data_hora_inicio), 'yyyy-MM-dd')
    if (!porDia.has(key)) porDia.set(key, [])
    porDia.get(key)!.push(ag)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 8,
        width: '100%', maxWidth: 540,
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        border: '1px solid var(--borda-media)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 16px',
          background: 'var(--cor-primaria)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
            Consultar agendamentos do paciente
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 4, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Busca */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--borda-suave)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)', pointerEvents: 'none' }} />
            <input
              autoFocus
              value={busca}
              onChange={e => {
                setBusca(e.target.value)
                if (pacienteSel) { setPacienteSel(null); setAgendamentos([]) }
              }}
              placeholder="Buscar paciente por nome ou CPF..."
              style={{
                width: '100%', padding: '6px 28px 6px 26px', fontSize: 12,
                backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                border: '1px solid var(--borda-media)', borderRadius: 3,
                boxSizing: 'border-box',
              }}
            />
            {pacienteSel && (
              <button
                onClick={trocarPaciente}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', padding: 2 }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {loadingBusca && <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 4 }}>Buscando...</div>}

          {!pacienteSel && pacientes.length > 0 && (
            <div style={{ border: '1px solid var(--borda-media)', borderRadius: 4, marginTop: 6, maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {pacientes.map(p => (
                <button
                  key={p.id}
                  onClick={() => selecionarPaciente(p)}
                  style={{ width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--borda-suave)', background: 'transparent', color: 'var(--texto-principal)' }}
                >
                  <span style={{ fontWeight: 500 }}>{p.nome}</span>
                  <span style={{ fontSize: 11, color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)' }}>{p.cpf_cnpj ?? ''}</span>
                </button>
              ))}
            </div>
          )}

          {!loadingBusca && !pacienteSel && busca.trim().length >= 2 && pacientes.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 4 }}>Nenhum paciente encontrado.</div>
          )}
        </div>

        {/* Lista de agendamentos */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {!pacienteSel && (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>
              Busque um paciente acima para ver os agendamentos dele.
            </div>
          )}

          {pacienteSel && loadingAgs && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '24px 0', color: 'var(--texto-terciario)', fontSize: 12 }}>
              <Loader2 size={14} className="spin" /> Carregando agendamentos...
            </div>
          )}

          {pacienteSel && !loadingAgs && agendamentos.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>
              Nenhum agendamento atual ou futuro para <strong>{pacienteSel.nome}</strong>.
            </div>
          )}

          {pacienteSel && !loadingAgs && agendamentos.length > 0 && (
            <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--texto-terciario)' }}>
              {agendamentos.length} agendamento{agendamentos.length > 1 ? 's' : ''} de hoje em diante para <strong style={{ color: 'var(--texto-secundario)' }}>{pacienteSel.nome}</strong>
            </div>
          )}

          {pacienteSel && !loadingAgs && Array.from(porDia.entries()).map(([dia, ags]) => (
            <div key={dia}>
              <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {isToday(parseISO(dia)) ? 'Hoje · ' : ''}
                {capitalizar(format(parseISO(dia), "EEEE, d 'de' MMMM", { locale: ptBR }))}
              </div>
              {ags.map(ag => {
                const statusColor = STATUS_COLOR[ag.status] ?? '#378ADD'
                return (
                  <div
                    key={ag.id}
                    onClick={() => onAbrirAgendamento(ag)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: statusColor + '12',
                      border: `0.5px solid ${statusColor}35`,
                      borderLeft: `3px solid ${statusColor}`,
                      borderRadius: 6,
                      padding: '7px 10px',
                      marginBottom: 4,
                      marginLeft: 16,
                      marginRight: 16,
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = statusColor + '22' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = statusColor + '12' }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: statusColor, width: 36, flexShrink: 0 }}>
                      {format(parseISO(ag.data_hora_inicio), 'HH:mm')}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-principal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ag.profissional_nome}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
                        {ag.tipo_descricao ?? 'Sem tipo definido'}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: statusColor,
                      background: statusColor + '18',
                      padding: '2px 9px', borderRadius: 20,
                      flexShrink: 0,
                    }}>
                      {STATUS_LABEL[ag.status] ?? ag.status}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--borda-suave)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-page)',
          flexShrink: 0,
          fontSize: 11, color: 'var(--texto-terciario)',
        }}>
          <CalendarClock size={12} />
          Clique num agendamento da lista para abrir e editar.
        </div>
      </div>
    </div>
  )
}
