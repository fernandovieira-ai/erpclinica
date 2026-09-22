'use client'

import { useEffect, useState } from 'react'
import {
  X, Search, Loader2, User, Phone, MapPin, Mail, IdCard, Cake, ExternalLink,
  CalendarClock, CalendarCheck2, History, AlertTriangle, ChevronDown, ChevronUp,
  Stethoscope, FileText, Users, Activity, ClipboardList, Scale, HeartPulse,
  FlaskConical, Pill, ListChecks,
} from 'lucide-react'
import { format, parseISO, isToday, differenceInYears } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { AgendamentoListItem, Prontuario } from '@/types/clinica.types'

interface Paciente {
  id:              number
  nome:            string
  cpf_cnpj:        string | null
  celular:         string | null
  telefone:        string | null
  cidade:          string | null
  uf:              string | null
  email:           string | null
  data_nascimento: string | null
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

const STATUS_FUTURO = new Set(['AGENDADO', 'CONFIRMADO', 'AGUARDANDO'])

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  const a = partes[0]?.[0] ?? ''
  const b = partes.length > 1 ? partes[partes.length - 1][0] : ''
  return (a + b).toUpperCase()
}

function formatarCpf(cpf: string | null) {
  return cpf ?? null
}

// Campo somente-leitura do prontuário (rótulo + valor) — some se vazio
function Campo({ icone: Icone, label, valor, destaque }: {
  icone: React.ElementType; label: string; valor: string | null; destaque?: boolean
}) {
  if (!valor) return null
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '7px 9px',
      backgroundColor: destaque ? 'var(--cor-primaria-light)' : 'var(--bg-input)',
      borderRadius: 5, border: destaque ? '1px solid var(--cor-primaria)' : '1px solid transparent',
    }}>
      <Icone size={13} style={{ color: destaque ? 'var(--cor-primaria)' : 'var(--texto-terciario)', flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
          color: destaque ? 'var(--cor-primaria)' : 'var(--texto-terciario)', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--texto-principal)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
          {valor}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, valor, sub, cor }: { label: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: '9px 12px', borderRadius: 7,
      backgroundColor: 'var(--bg-input)', border: '1px solid var(--borda-suave)',
    }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--texto-terciario)' }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: cor ?? 'var(--texto-principal)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {valor}
      </div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--texto-terciario)', marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

export default function FichaPacienteModal({ open, onClose, onAbrirAgendamento }: Props) {
  const [busca,        setBusca]        = useState('')
  const [pacientes,    setPacientes]    = useState<Paciente[]>([])
  const [loadingBusca, setLoadingBusca] = useState(false)
  const [pacienteSel,  setPacienteSel]  = useState<Paciente | null>(null)
  const [agendamentos, setAgendamentos] = useState<AgendamentoListItem[]>([])
  const [prontuarios,  setProntuarios]  = useState<Record<number, Prontuario>>({})
  const [loadingFicha, setLoadingFicha] = useState(false)
  const [abertoId,     setAbertoId]     = useState<number | null>(null)

  useEffect(() => {
    if (!open) {
      setBusca('')
      setPacientes([])
      setPacienteSel(null)
      setAgendamentos([])
      setProntuarios({})
      setAbertoId(null)
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
    setAbertoId(null)
    setLoadingFicha(true)
    try {
      // Histórico completo: sem filtro de status/data — passado e futuro, mesma fonte
      // de dados da agenda (AGENDAMENTO_LISTA_COLUNAS), então já traz tipo/categoria/profissional.
      const [resAg, resPr] = await Promise.all([
        fetch(`/api/clinica/agendamentos?${new URLSearchParams({ paciente_id: String(p.id), order: 'desc', limit: '500' })}`),
        fetch(`/api/clinica/prontuarios?${new URLSearchParams({ paciente_id: String(p.id) })}`),
      ])
      const dataAg = resAg.ok ? await resAg.json() : { dados: [] }
      const dataPr = resPr.ok ? await resPr.json() : { dados: [] }
      setAgendamentos(dataAg.dados ?? [])
      const mapa: Record<number, Prontuario> = {}
      for (const pr of (dataPr.dados ?? []) as Prontuario[]) mapa[pr.agendamento_id] = pr
      setProntuarios(mapa)
    } catch {
      setAgendamentos([])
      setProntuarios({})
    } finally {
      setLoadingFicha(false)
    }
  }

  function trocarPaciente() {
    setPacienteSel(null)
    setBusca('')
    setPacientes([])
    setAgendamentos([])
    setProntuarios({})
    setAbertoId(null)
  }

  if (!open) return null

  const agora = new Date()
  const proximos = agendamentos
    .filter(ag => STATUS_FUTURO.has(ag.status) && parseISO(ag.data_hora_inicio) >= agora)
    .sort((a, b) => +parseISO(a.data_hora_inicio) - +parseISO(b.data_hora_inicio))
  const idsProximos = new Set(proximos.map(a => a.id))
  const historico = agendamentos.filter(ag => !idsProximos.has(ag.id)) // já vem desc da API

  const atendidos       = agendamentos.filter(ag => ag.status === 'ATENDIDO')
  const ultimaAtendida   = historico.find(ag => ag.status === 'ATENDIDO') ?? null
  const proximoAg        = proximos[0] ?? null

  const alergiasUnicas = Array.from(new Set(
    Object.values(prontuarios).map(p => p.alergias?.trim()).filter((v): v is string => !!v)
  ))

  const idade = pacienteSel?.data_nascimento
    ? differenceInYears(agora, parseISO(pacienteSel.data_nascimento))
    : null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(15,23,22,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 12,
        width: '100%', maxWidth: pacienteSel ? 760 : 520,
        maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        border: '1px solid var(--borda-media)',
        transition: 'max-width 0.15s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          background: 'linear-gradient(135deg, var(--cor-primaria) 0%, var(--cor-primaria-hover) 100%)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              {pacienteSel && (
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(255,255,255,0.22)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, fontWeight: 700, letterSpacing: '0.02em',
                }}>
                  {iniciais(pacienteSel.nome)}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {pacienteSel ? pacienteSel.nome : 'Consultar paciente'}
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                  {pacienteSel
                    ? `${idade != null ? `${idade} anos · ` : ''}Ficha e histórico completo do paciente`
                    : 'Busque por nome ou CPF para ver a ficha completa'}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 5, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Busca */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--borda-suave)', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)', pointerEvents: 'none' }} />
            <input
              autoFocus
              value={busca}
              onChange={e => {
                setBusca(e.target.value)
                if (pacienteSel) { setPacienteSel(null); setAgendamentos([]); setProntuarios({}) }
              }}
              placeholder="Buscar paciente por nome ou CPF..."
              style={{
                width: '100%', padding: '7px 28px 7px 28px', fontSize: 12.5,
                backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                border: '1px solid var(--borda-media)', borderRadius: 5,
                boxSizing: 'border-box',
              }}
            />
            {pacienteSel && (
              <button
                onClick={trocarPaciente}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', padding: 2 }}
                title="Trocar paciente"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {loadingBusca && <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 4 }}>Buscando...</div>}

          {!pacienteSel && pacientes.length > 0 && (
            <div style={{ border: '1px solid var(--borda-media)', borderRadius: 5, marginTop: 6, maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {pacientes.map(p => (
                <button
                  key={p.id}
                  onClick={() => selecionarPaciente(p)}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--borda-suave)', background: 'transparent', color: 'var(--texto-principal)' }}
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

        {/* Corpo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: pacienteSel ? '14px 18px' : 0 }}>
          {!pacienteSel && (
            <div style={{ padding: '36px 16px', textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>
              <User size={28} style={{ opacity: 0.35, marginBottom: 8 }} />
              <div>Busque um paciente acima para ver a ficha completa: dados cadastrais,<br />agendamentos e histórico clínico.</div>
            </div>
          )}

          {pacienteSel && loadingFicha && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '32px 0', color: 'var(--texto-terciario)', fontSize: 12 }}>
              <Loader2 size={14} className="spin" /> Carregando ficha do paciente...
            </div>
          )}

          {pacienteSel && !loadingFicha && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Dados cadastrais */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                {pacienteSel.cpf_cnpj && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--texto-secundario)' }}>
                    <IdCard size={12} style={{ color: 'var(--texto-terciario)' }} /> {formatarCpf(pacienteSel.cpf_cnpj)}
                  </span>
                )}
                {(pacienteSel.celular || pacienteSel.telefone) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--texto-secundario)' }}>
                    <Phone size={12} style={{ color: 'var(--texto-terciario)' }} /> {pacienteSel.celular ?? pacienteSel.telefone}
                  </span>
                )}
                {pacienteSel.data_nascimento && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--texto-secundario)' }}>
                    <Cake size={12} style={{ color: 'var(--texto-terciario)' }} /> {format(parseISO(pacienteSel.data_nascimento), 'dd/MM/yyyy')}
                  </span>
                )}
                {(pacienteSel.cidade || pacienteSel.uf) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--texto-secundario)' }}>
                    <MapPin size={12} style={{ color: 'var(--texto-terciario)' }} /> {[pacienteSel.cidade, pacienteSel.uf].filter(Boolean).join('/')}
                  </span>
                )}
                {pacienteSel.email && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--texto-secundario)' }}>
                    <Mail size={12} style={{ color: 'var(--texto-terciario)' }} /> {pacienteSel.email}
                  </span>
                )}
                <a
                  href={`/cadastro/pessoas/${pacienteSel.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--cor-primaria)', fontWeight: 600, marginLeft: 'auto' }}
                >
                  Ver cadastro completo <ExternalLink size={11} />
                </a>
              </div>

              {/* Alerta de alergias — informação clínica mais crítica, sempre visível no topo */}
              {alergiasUnicas.length > 0 && (
                <div style={{
                  display: 'flex', gap: 8, padding: '9px 12px',
                  backgroundColor: 'var(--cor-erro-bg, #FEECEC)', border: '1px solid var(--cor-erro, #E24B4A)',
                  borderRadius: 7,
                }}>
                  <AlertTriangle size={15} style={{ color: 'var(--cor-erro, #E24B4A)', flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12, color: 'var(--texto-principal)' }}>
                    <strong style={{ color: 'var(--cor-erro, #E24B4A)' }}>Alergias registradas:</strong> {alergiasUnicas.join(' · ')}
                  </div>
                </div>
              )}

              {/* KPIs */}
              <div style={{ display: 'flex', gap: 8 }}>
                <StatCard label="Consultas Atendidas" valor={String(atendidos.length)} />
                <StatCard
                  label="Última Consulta"
                  valor={ultimaAtendida ? format(parseISO(ultimaAtendida.data_hora_inicio), 'dd/MM/yyyy') : '—'}
                  sub={ultimaAtendida?.profissional_nome}
                />
                <StatCard
                  label="Próximo Agendamento"
                  valor={proximoAg ? format(parseISO(proximoAg.data_hora_inicio), 'dd/MM/yyyy') : '—'}
                  sub={proximoAg ? `${format(parseISO(proximoAg.data_hora_inicio), 'HH:mm')} · ${proximoAg.profissional_nome}` : 'Nenhum agendamento futuro'}
                  cor={proximoAg ? 'var(--cor-primaria)' : undefined}
                />
              </div>

              {/* Próximos agendamentos */}
              {proximos.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                    <CalendarClock size={12} /> Próximos agendamentos
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {proximos.map(ag => {
                      const cor = STATUS_COLOR[ag.status] ?? '#378ADD'
                      return (
                        <div
                          key={ag.id}
                          onClick={() => onAbrirAgendamento(ag)}
                          title="Clique para abrir e editar este agendamento"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: cor + '12', border: `0.5px solid ${cor}35`, borderLeft: `3px solid ${cor}`,
                            borderRadius: 6, padding: '7px 10px', cursor: 'pointer', transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = cor + '22' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = cor + '12' }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: cor, width: 90, flexShrink: 0 }}>
                            {isToday(parseISO(ag.data_hora_inicio)) ? 'Hoje' : format(parseISO(ag.data_hora_inicio), 'dd/MM/yyyy')} · {format(parseISO(ag.data_hora_inicio), 'HH:mm')}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-principal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ag.profissional_nome}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
                              {ag.tipo_descricao ?? 'Sem tipo definido'}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: cor, background: cor + '18', padding: '2px 9px', borderRadius: 20, flexShrink: 0 }}>
                            {STATUS_LABEL[ag.status] ?? ag.status}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Histórico completo */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                  <History size={12} /> Histórico de atendimentos ({historico.length})
                </div>

                {historico.length === 0 && (
                  <div style={{ padding: '16px 4px', textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)', fontStyle: 'italic' }}>
                    Nenhum atendimento anterior registrado para este paciente.
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {historico.map((ag, idx) => {
                    const prontuario = prontuarios[ag.id]
                    const cor        = STATUS_COLOR[ag.status] ?? '#888780'
                    const aberto     = abertoId === ag.id
                    const resumo     = prontuario?.diagnostico || prontuario?.queixas
                    const ultimo     = idx === historico.length - 1

                    return (
                      <div key={ag.id} style={{ display: 'flex', gap: 10 }}>
                        {/* Linha do tempo */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0 }}>
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%', marginTop: 13,
                            backgroundColor: cor, border: '2px solid var(--bg-card)', boxShadow: `0 0 0 2px ${cor}`, flexShrink: 0,
                          }} />
                          {!ultimo && <div style={{ width: 2, flex: 1, backgroundColor: 'var(--borda-suave)', marginTop: 2 }} />}
                        </div>

                        <div style={{ flex: 1, paddingBottom: 10, minWidth: 0 }}>
                          <div style={{ border: '1px solid var(--borda-media)', borderRadius: 6, overflow: 'hidden', backgroundColor: 'var(--bg-card)' }}>
                            <button
                              type="button"
                              onClick={() => setAbertoId(aberto ? null : ag.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                padding: '8px 10px', background: 'none', border: 'none',
                                cursor: prontuario ? 'pointer' : 'default', textAlign: 'left',
                              }}
                            >
                              <div style={{ minWidth: 66 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--texto-principal)' }}>
                                  {format(parseISO(ag.data_hora_inicio), 'dd/MM/yyyy')}
                                </div>
                                <div style={{ fontSize: 10.5, color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)' }}>
                                  {format(parseISO(ag.data_hora_inicio), 'HH:mm')}
                                </div>
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-principal)' }}>
                                  {ag.profissional_nome}
                                  {(ag.tipo_descricao || ag.especialidade_descricao) && (
                                    <span style={{ fontWeight: 400, color: 'var(--texto-secundario)' }}>
                                      {' '}· {ag.tipo_descricao ?? ag.especialidade_descricao}
                                    </span>
                                  )}
                                </div>
                                {!aberto && (
                                  <div style={{
                                    fontSize: 11, color: 'var(--texto-terciario)', marginTop: 1,
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    fontStyle: resumo ? 'normal' : 'italic',
                                  }}>
                                    {resumo ?? (ag.status === 'ATENDIDO' ? 'Prontuário não preenchido' : STATUS_LABEL[ag.status])}
                                  </div>
                                )}
                              </div>

                              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: cor, backgroundColor: `${cor}1E`, flexShrink: 0 }}>
                                {STATUS_LABEL[ag.status] ?? ag.status}
                              </span>

                              {prontuario && (
                                aberto ? <ChevronUp size={14} style={{ color: 'var(--texto-terciario)', flexShrink: 0 }} />
                                       : <ChevronDown size={14} style={{ color: 'var(--texto-terciario)', flexShrink: 0 }} />
                              )}
                            </button>

                            {aberto && prontuario && (
                              <div style={{ borderTop: '1px solid var(--borda-suave)', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <Campo icone={Stethoscope}   label="Queixas"                valor={prontuario.queixas} />
                                <Campo icone={FileText}      label="HDA"                     valor={prontuario.hda} />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                  <Campo icone={Users}       label="Antecedentes Familiares" valor={prontuario.antecedentes_familiares} />
                                  <Campo icone={AlertTriangle} label="Alergias"              valor={prontuario.alergias} />
                                </div>
                                <Campo icone={ClipboardList} label="Exame Físico"            valor={prontuario.exame_fisico} />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                  <Campo icone={Scale}       label="Peso"                    valor={prontuario.peso != null ? `${prontuario.peso} kg` : null} />
                                  <Campo icone={Activity}    label="IMC"                     valor={prontuario.imc != null ? String(prontuario.imc) : null} />
                                  <Campo icone={HeartPulse}  label="Pressão"                 valor={prontuario.pressao} />
                                </div>
                                <Campo icone={FlaskConical}  label="Exames"                  valor={prontuario.exames} />
                                <Campo icone={FileText}      label="Diagnóstico"             valor={prontuario.diagnostico} destaque />
                                <Campo icone={Pill}          label="Medicação"               valor={prontuario.medicacao} />
                                <Campo icone={ListChecks}    label="Outras Condutas"         valor={prontuario.outras_condutas} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '9px 18px',
          borderTop: '1px solid var(--borda-suave)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--bg-page)',
          flexShrink: 0,
          fontSize: 11, color: 'var(--texto-terciario)',
        }}>
          <CalendarCheck2 size={12} />
          {pacienteSel
            ? 'Consulta somente leitura — clique num agendamento futuro para abrir e editar.'
            : 'Busque um paciente para ver agendamentos, prontuários e histórico completo.'}
        </div>
      </div>
    </div>
  )
}
