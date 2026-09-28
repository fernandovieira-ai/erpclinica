'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { X, Ban, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { AgendamentoListItem, ProfissionalListItem } from '@/types/clinica.types'

// Montado só enquanto aberto (a página renderiza `{aberto && <BloqueioAgendaModal/>}`): assim o
// estado inicial vem direto das props e a primeira carga nunca usa dados da abertura anterior.
interface Props {
  onClose:             () => void
  // Chamado após criar ou remover qualquer bloqueio — a agenda recarrega o que exibe
  onChanged:           () => void
  profissionais:       ProfissionalListItem[]
  profissionalInicial: number  // 0 = nenhum (usuário escolhe)
  dataInicial:         Date
}

type Modo = 'dia' | 'horario'

interface Excecao      { id: number; data: string; descricao: string | null; nao_atende: boolean; hora_inicio: string | null; hora_fim: string | null; intervalo_min: number | null }
interface Bloqueio     { id: number; data: string; hora_inicio: string; hora_fim: string; motivo: string | null }
interface GradeSemana  { dia_semana: number; ativo: boolean; hora_inicio: string; hora_fim: string; intervalo_min: number }
interface Slot         { inicio: string; fim: string }

const pad2 = (n: number) => String(n).padStart(2, '0')
const toMin  = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const toHHMM = (min: number)  => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)', marginBottom: 4,
}

export default function BloqueioAgendaModal({
  onClose, onChanged, profissionais, profissionalInicial, dataInicial,
}: Props) {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const dataInicialStr = format(dataInicial, 'yyyy-MM-dd')

  const [profissionalId, setProfissionalId] = useState(profissionalInicial)
  const [data,           setData]           = useState(dataInicialStr < hoje ? hoje : dataInicialStr)
  const [modo,           setModo]           = useState<Modo>('dia')
  const [horaInicio,     setHoraInicio]     = useState('')
  const [horaFim,        setHoraFim]        = useState('')
  const [motivo,         setMotivo]         = useState('')
  const [salvando,       setSalvando]       = useState(false)

  const [carregando,    setCarregando]    = useState(false)
  const [excecao,       setExcecao]       = useState<Excecao | null>(null)
  const [bloqueios,     setBloqueios]     = useState<Bloqueio[]>([])
  const [agsDia,        setAgsDia]        = useState<AgendamentoListItem[]>([])
  const [agendaSemana,  setAgendaSemana]  = useState<GradeSemana[]>([])

  // O que já existe no dia (exceção, faixas bloqueadas, grade semanal) + agendamentos afetados
  const carregarDia = useCallback(async () => {
    if (!profissionalId || !data) {
      setExcecao(null); setBloqueios([]); setAgsDia([]); setAgendaSemana([])
      return
    }
    setCarregando(true)
    try {
      const [rExc, rBlq, rAg, rGrade] = await Promise.all([
        fetch(`/api/clinica/agenda-profissional-excecao?profissional_id=${profissionalId}`),
        fetch(`/api/clinica/agenda-profissional-bloqueio?profissional_id=${profissionalId}&inicio=${data}&fim=${data}`),
        fetch(`/api/clinica/agendamentos?inicio=${data}&fim=${data}&profissional_id=${profissionalId}`),
        fetch(`/api/clinica/agenda-profissional?profissional_id=${profissionalId}`),
      ])
      const jExc   = rExc.ok   ? await rExc.json()   : { dados: [] }
      const jBlq   = rBlq.ok   ? await rBlq.json()   : { dados: [] }
      const jAg    = rAg.ok    ? await rAg.json()    : { dados: [] }
      const jGrade = rGrade.ok ? await rGrade.json() : { dados: [] }

      const exc = (jExc.dados ?? []).find((e: Excecao) => String(e.data).slice(0, 10) === data) ?? null
      setExcecao(exc)
      setBloqueios(jBlq.dados ?? [])
      setAgsDia((jAg.dados ?? []).filter((a: AgendamentoListItem) => a.status !== 'CANCELADO' && a.status !== 'FALTOU'))
      setAgendaSemana(jGrade.dados ?? [])
    } catch {
      setExcecao(null); setBloqueios([]); setAgsDia([]); setAgendaSemana([])
    } finally {
      setCarregando(false)
    }
  }, [profissionalId, data])

  useEffect(() => { carregarDia() }, [carregarDia])

  // Troca de profissional/data invalida a seleção de horário anterior (slots de outra grade)
  useEffect(() => { setHoraInicio(''); setHoraFim('') }, [profissionalId, data])

  // Agendamentos que ficam dentro do que está sendo bloqueado (não são cancelados — só avisa)
  const afetados = useMemo(() => {
    if (modo === 'dia') return agsDia
    if (!horaInicio || !horaFim || horaFim <= horaInicio) return []
    return agsDia.filter(a => {
      const ini = format(parseISO(a.data_hora_inicio), 'HH:mm')
      const fim = format(parseISO(a.data_hora_fim),    'HH:mm')
      return ini < horaFim && fim > horaInicio
    })
  }, [modo, agsDia, horaInicio, horaFim])

  const diaJaBloqueado   = !!excecao?.nao_atende
  const horarioEspecial  = !!excecao && !excecao.nao_atende && !!excecao.hora_inicio
  const horarioInvalido  = modo === 'horario' && (!horaInicio || !horaFim || horaFim <= horaInicio)
  const podeSalvar       = !!profissionalId && !!data && data >= hoje && !salvando
    && (modo === 'dia' ? !diaJaBloqueado : !horarioInvalido)

  // Grade de horários do dia: exceção com horário especial > grade semanal do dia da semana.
  // Dia bloqueado inteiro (diaJaBloqueado) não tem grade — a faixa de horário fica sem sentido.
  const gradeDia = useMemo<{ hora_inicio: string; hora_fim: string; intervalo_min: number } | null>(() => {
    if (!data || diaJaBloqueado) return null
    if (excecao && excecao.hora_inicio && excecao.hora_fim) {
      return { hora_inicio: excecao.hora_inicio, hora_fim: excecao.hora_fim, intervalo_min: excecao.intervalo_min || 30 }
    }
    const diaSemana = parseISO(data).getDay()
    const g = agendaSemana.find(a => Number(a.dia_semana) === diaSemana && a.ativo)
    return g ? { hora_inicio: g.hora_inicio, hora_fim: g.hora_fim, intervalo_min: g.intervalo_min || 30 } : null
  }, [data, diaJaBloqueado, excecao, agendaSemana])

  // Botões de horário (um por slot do intervalo configurado) pra clicar/arrastar e escolher a faixa
  const slots = useMemo<Slot[]>(() => {
    if (!gradeDia) return []
    const passo = gradeDia.intervalo_min > 0 ? gradeDia.intervalo_min : 30
    const iniMin = toMin(gradeDia.hora_inicio)
    const fimMin = toMin(gradeDia.hora_fim)
    const arr: Slot[] = []
    for (let cur = iniMin; cur + passo <= fimMin; cur += passo) {
      arr.push({ inicio: toHHMM(cur), fim: toHHMM(cur + passo) })
    }
    return arr
  }, [gradeDia])

  const agoraHHMM = format(new Date(), 'HH:mm')
  function statusSlot(s: Slot) {
    const passado     = data === hoje && s.inicio <= agoraHHMM
    const jaBloqueado = bloqueios.some(b => s.inicio < b.hora_fim && s.fim > b.hora_inicio)
    const temAg       = agsDia.some(a => {
      const ini = format(parseISO(a.data_hora_inicio), 'HH:mm')
      const fim = format(parseISO(a.data_hora_fim),    'HH:mm')
      return s.inicio < fim && s.fim > ini
    })
    return { passado, jaBloqueado, temAg, disabled: passado || jaBloqueado }
  }

  // Seleção por clique (1 slot) ou arraste (vários slots contíguos), no estilo do calendário de
  // horários do "Novo horário": mousedown define o início do arrasto, mouseenter vai estendendo
  // a ponta solta até o slot sob o cursor, parando antes de qualquer slot desabilitado.
  const [arrastando,    setArrastando]    = useState(false)
  const [dragInicioIdx, setDragInicioIdx] = useState<number | null>(null)

  useEffect(() => {
    function soltar() { setArrastando(false); setDragInicioIdx(null) }
    window.addEventListener('mouseup', soltar)
    return () => window.removeEventListener('mouseup', soltar)
  }, [])

  function iniciarSelecao(idx: number) {
    const s = slots[idx]
    if (statusSlot(s).disabled) return
    setArrastando(true)
    setDragInicioIdx(idx)
    setHoraInicio(s.inicio)
    setHoraFim(s.fim)
  }

  function estenderSelecao(idx: number) {
    if (!arrastando || dragInicioIdx == null) return
    let lo = Math.min(dragInicioIdx, idx)
    let hi = Math.max(dragInicioIdx, idx)
    if (idx >= dragInicioIdx) {
      for (let i = dragInicioIdx; i <= hi; i++) { if (statusSlot(slots[i]).disabled) { hi = i - 1; break } }
    } else {
      for (let i = dragInicioIdx; i >= lo; i--) { if (statusSlot(slots[i]).disabled) { lo = i + 1; break } }
    }
    if (hi < lo) return
    setHoraInicio(slots[lo].inicio)
    setHoraFim(slots[hi].fim)
  }

  async function salvar() {
    if (!podeSalvar) return
    setSalvando(true)
    try {
      const res = modo === 'dia'
        ? await fetch('/api/clinica/agenda-profissional-excecao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profissional_id: profissionalId, data, descricao: motivo.trim() || null, nao_atende: true,
            }),
          })
        : await fetch('/api/clinica/agenda-profissional-bloqueio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profissional_id: profissionalId, data,
              hora_inicio: horaInicio, hora_fim: horaFim, motivo: motivo.trim() || null,
            }),
          })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.erro ?? 'Erro ao bloquear'); return }

      toast.success(modo === 'dia' ? 'Dia bloqueado' : 'Horário bloqueado')
      setMotivo('')
      setHoraInicio('')
      setHoraFim('')
      await carregarDia()
      onChanged()
    } finally {
      setSalvando(false)
    }
  }

  async function remover(tipo: 'excecao' | 'bloqueio', id: number) {
    const rota = tipo === 'excecao' ? 'agenda-profissional-excecao' : 'agenda-profissional-bloqueio'
    const res = await fetch(`/api/clinica/${rota}/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Erro ao remover bloqueio'); return }
    toast.success('Bloqueio removido')
    await carregarDia()
    onChanged()
  }

  const tituloData = data ? format(parseISO(data), "EEEE, d 'de' MMMM", { locale: ptBR }) : ''
  const temExistentes = !!excecao || bloqueios.length > 0

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 8, width: '100%', maxWidth: 480, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)', border: '1px solid var(--borda-media)',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 16px', background: 'var(--cor-primaria)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
            <Ban size={15} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Bloquear agenda</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', textTransform: 'capitalize' }}>{tituloData}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 4, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Profissional + data */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 10 }}>
            <div>
              <label style={labelStyle}>Profissional</label>
              <select
                className="input-field" style={{ width: '100%', fontSize: 12 }}
                value={profissionalId} onChange={e => setProfissionalId(Number(e.target.value))}
              >
                <option value={0}>Selecione...</option>
                {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Data</label>
              <input
                type="date" className="input-field" style={{ width: '100%', fontSize: 12 }}
                min={hoje} value={data} onChange={e => setData(e.target.value)}
              />
            </div>
          </div>

          {/* Modo */}
          <div>
            <label style={labelStyle}>O que bloquear</label>
            <div style={{ display: 'flex', gap: 2, background: 'var(--bg-page)', border: '0.5px solid var(--borda-suave)', borderRadius: 6, padding: 2 }}>
              {([['dia', 'Dia todo'], ['horario', 'Faixa de horário']] as const).map(([k, l]) => (
                <button
                  key={k} type="button" onClick={() => setModo(k)}
                  className={modo === k ? 'btn-primary' : 'btn-ghost'}
                  style={{ flex: 1, padding: '6px 10px', fontSize: 12, borderRadius: 4, border: 'none' }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {modo === 'horario' && (
            <div>
              <label style={labelStyle}>Horário a bloquear</label>
              {!profissionalId || !data ? (
                <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>
                  Selecione o profissional e a data.
                </div>
              ) : carregando ? (
                <div style={{ fontSize: 12, color: 'var(--texto-terciario)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 size={12} className="spin" /> Carregando grade do dia...
                </div>
              ) : diaJaBloqueado ? (
                <div style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>
                  Este dia já está bloqueado inteiro — remova o bloqueio abaixo antes de escolher uma faixa.
                </div>
              ) : slots.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>
                  Profissional sem grade cadastrada para este dia.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, userSelect: 'none' }}>
                    {slots.map((s, idx) => {
                      const st          = statusSlot(s)
                      const selecionado = !!horaInicio && !!horaFim && s.inicio >= horaInicio && s.fim <= horaFim
                      return (
                        <button
                          key={s.inicio}
                          type="button"
                          disabled={st.disabled}
                          onMouseDown={() => iniciarSelecao(idx)}
                          onMouseEnter={() => estenderSelecao(idx)}
                          title={
                            st.jaBloqueado ? `Já bloqueado (${s.inicio}-${s.fim})`
                            : st.passado   ? 'Horário já passou'
                            : st.temAg     ? 'Já há agendamento neste horário'
                            : undefined
                          }
                          style={{
                            padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                            border: `1px solid ${selecionado ? 'var(--cor-primaria)' : st.temAg && !st.disabled ? '#EF9F27' : 'var(--borda-media)'}`,
                            background: selecionado ? 'var(--cor-primaria)' : st.disabled ? 'var(--bg-page)' : st.temAg ? '#EF9F2712' : 'var(--bg-input)',
                            color: selecionado ? '#fff' : st.disabled ? 'var(--texto-terciario)' : 'var(--texto-principal)',
                            cursor: st.disabled ? 'not-allowed' : 'pointer',
                            opacity: st.disabled ? 0.55 : 1,
                            textDecoration: st.jaBloqueado ? 'line-through' : undefined,
                          }}
                        >
                          {s.inicio}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--texto-secundario)', marginTop: 6 }}>
                    {horaInicio && horaFim
                      ? <>Selecionado: <strong>{horaInicio} às {horaFim}</strong></>
                      : 'Clique em um horário ou arraste para selecionar uma faixa.'}
                  </div>
                </>
              )}
            </div>
          )}

          <div>
            <label style={labelStyle}>Motivo (opcional)</label>
            <input
              className="input-field" style={{ width: '100%', fontSize: 12 }} maxLength={100}
              placeholder={modo === 'dia' ? 'Ex.: congresso, doença' : 'Ex.: reunião, saída antecipada'}
              value={motivo} onChange={e => setMotivo(e.target.value)}
            />
          </div>

          {/* Avisos */}
          {modo === 'dia' && diaJaBloqueado && (
            <div style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>
              Este dia já está bloqueado para o profissional.
            </div>
          )}
          {modo === 'dia' && horarioEspecial && (
            <div style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--texto-secundario)' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, color: '#EF9F27', marginTop: 1 }} />
              Este dia tem horário especial ({excecao!.hora_inicio}–{excecao!.hora_fim}). Bloquear o dia todo substitui essa configuração.
            </div>
          )}
          {afetados.length > 0 && (
            <div style={{ border: '1px solid #EF9F27', background: '#EF9F2712', borderRadius: 6, padding: '8px 10px' }}>
              <div style={{ display: 'flex', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--texto-principal)' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, color: '#EF9F27', marginTop: 1 }} />
                {afetados.length} agendamento{afetados.length > 1 ? 's' : ''} já marcado{afetados.length > 1 ? 's' : ''} neste período
              </div>
              <div style={{ fontSize: 11, color: 'var(--texto-terciario)', margin: '2px 0 6px 20px' }}>
                Eles não são cancelados — reagende ou avise os pacientes.
              </div>
              <div style={{ marginLeft: 20, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 110, overflowY: 'auto' }}>
                {afetados.map(a => (
                  <div key={a.id} style={{ fontSize: 11.5, color: 'var(--texto-secundario)' }}>
                    <strong>{format(parseISO(a.data_hora_inicio), 'HH:mm')}</strong> · {a.paciente_nome}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bloqueios existentes no dia */}
          {(carregando || temExistentes) && (
            <div>
              <div style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--texto-terciario)' }}>
                Já cadastrado neste dia
              </div>
              {carregando && !temExistentes && (
                <div style={{ fontSize: 12, color: 'var(--texto-terciario)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 size={12} className="spin" /> Carregando...
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {excecao && (
                  <LinhaExistente
                    titulo={excecao.nao_atende ? 'Dia todo bloqueado' : `Horário especial ${excecao.hora_inicio}–${excecao.hora_fim}`}
                    detalhe={excecao.descricao}
                    onRemover={() => remover('excecao', excecao.id)}
                  />
                )}
                {bloqueios.map(b => (
                  <LinhaExistente
                    key={b.id}
                    titulo={`Bloqueado ${b.hora_inicio}–${b.hora_fim}`}
                    detalhe={b.motivo}
                    onRemover={() => remover('bloqueio', b.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid var(--borda-suave)', background: 'var(--bg-page)',
          display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{ padding: '5px 14px', fontSize: 12, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, color: 'var(--texto-secundario)', cursor: 'pointer' }}
          >
            Fechar
          </button>
          <button
            onClick={salvar}
            disabled={!podeSalvar}
            style={{
              padding: '5px 18px', fontSize: 12, fontWeight: 600, color: '#fff', border: 'none', borderRadius: 3,
              background: podeSalvar ? 'var(--cor-primaria)' : 'var(--borda-media)',
              cursor: podeSalvar ? 'pointer' : 'not-allowed',
            }}
          >
            {salvando ? 'Salvando...' : modo === 'dia' ? 'Bloquear dia' : 'Bloquear horário'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LinhaExistente({ titulo, detalhe, onRemover }: { titulo: string; detalhe: string | null; onRemover: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '6px 10px', border: '0.5px solid var(--borda-suave)', borderRadius: 6, background: 'var(--bg-input)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-principal)' }}>{titulo}</div>
        {detalhe && <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>{detalhe}</div>}
      </div>
      <button
        onClick={onRemover} title="Remover bloqueio"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cor-erro)', padding: 4, display: 'flex' }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
