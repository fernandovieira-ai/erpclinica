'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { X, CalendarClock, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { AgendamentoListItem } from '@/types/clinica.types'

interface Props {
  open:    boolean
  onClose: () => void

  // Modo "reagendar" — remarca um agendamento existente (PUT direto ao confirmar)
  onSaved?:     () => void
  agendamento?: AgendamentoListItem | null

  // Modo "selecionar" — só devolve a data/hora escolhida, sem salvar nada
  // (usado no formulário de Novo Agendamento, pra preencher os campos de data/hora)
  profissionalId?:   number
  duracaoMin?:       number
  profissionalNome?: string
  tipoDescricao?:    string
  onSelecionar?:     (data: string, hora: string) => void
}

interface DiaDisponivel {
  data:  string   // YYYY-MM-DD
  slots: string[] // HH:MM
}

function duracaoMinutosAg(ag: AgendamentoListItem): number {
  const ini = parseISO(ag.data_hora_inicio)
  const fim = parseISO(ag.data_hora_fim)
  return Math.max(Math.round((fim.getTime() - ini.getTime()) / 60000), 5)
}

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function NovoHorarioModal({
  open, onClose, onSaved, agendamento,
  profissionalId, duracaoMin, profissionalNome, tipoDescricao, onSelecionar,
}: Props) {
  const modoSelecao = !agendamento && !!onSelecionar

  const profissionalIdEfetivo = agendamento?.profissional_id ?? profissionalId ?? 0
  const duracaoMinEfetivo     = agendamento ? duracaoMinutosAg(agendamento) : (duracaoMin ?? 30)

  const [dias,          setDias]          = useState<DiaDisponivel[]>([])
  const [proximaBusca,  setProximaBusca]  = useState<string | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [loadingMore,   setLoadingMore]   = useState(false)
  const [erro,          setErro]          = useState<string | null>(null)
  const [selecionado,   setSelecionado]   = useState<{ data: string; hora: string } | null>(null)
  const [salvando,      setSalvando]      = useState(false)

  useEffect(() => {
    if (!open || !profissionalIdEfetivo) return
    setDias([])
    setProximaBusca(null)
    setSelecionado(null)
    setErro(null)
    buscar(format(new Date(), 'yyyy-MM-dd'), false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profissionalIdEfetivo, duracaoMinEfetivo])

  async function buscar(dataInicio: string, append: boolean) {
    if (!profissionalIdEfetivo) return
    if (append) setLoadingMore(true)
    else setLoading(true)
    setErro(null)

    try {
      const params = new URLSearchParams({
        data_inicio:    dataInicio,
        duracao_min:    String(duracaoMinEfetivo),
        dias_com_vaga:  '10',
      })
      const res  = await fetch(`/api/clinica/profissionais/${profissionalIdEfetivo}/horarios-disponiveis?${params}`)
      const json = await res.json()

      if (!res.ok) {
        setErro(json.erro || 'Erro ao buscar horários disponíveis')
        setProximaBusca(null)
        if (!append) setDias([])
        return
      }

      setDias(prev => append ? [...prev, ...json.dias] : json.dias)
      setProximaBusca(json.proxima_busca ?? null)
    } catch {
      setErro('Erro ao buscar horários disponíveis')
      setProximaBusca(null)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  async function handleConfirmar() {
    if (!selecionado) return

    if (modoSelecao) {
      onSelecionar!(selecionado.data, selecionado.hora)
      onClose()
      return
    }

    if (!agendamento) return
    setSalvando(true)
    try {
      const inicio = new Date(`${selecionado.data}T${selecionado.hora}:00`)
      const fim    = new Date(inicio.getTime() + duracaoMinEfetivo * 60000)

      const res = await fetch(`/api/clinica/agendamentos/${agendamento.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paciente_id:      agendamento.paciente_id,
          profissional_id:  agendamento.profissional_id,
          tipo_id:          agendamento.tipo_id,
          data_hora_inicio: inicio.toISOString(),
          data_hora_fim:    fim.toISOString(),
          status:           agendamento.status,
          motivo:           agendamento.motivo ?? null,
          observacao:       agendamento.observacao ?? null,
          categoria_id:     agendamento.categoria_id,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.erro ?? 'Erro ao remarcar agendamento')
        return
      }

      toast.success('Horário atualizado!')
      onSaved?.()
      onClose()
    } finally {
      setSalvando(false)
    }
  }

  if (!open || !profissionalIdEfetivo) return null

  const hoje = format(new Date(), 'yyyy-MM-dd')

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
        width: '100%', maxWidth: 480,
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
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {modoSelecao ? 'Selecionar horário' : `Novo horário — ${agendamento!.paciente_nome}`}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 1 }}>
              {(agendamento?.profissional_nome ?? profissionalNome) || ''}
              {(agendamento?.tipo_descricao ?? tipoDescricao) ? ` · ${agendamento?.tipo_descricao ?? tipoDescricao}` : ''}
              {` · ${duracaoMinEfetivo}min`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 4, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Atual (só faz sentido no modo reagendar) */}
        {!modoSelecao && agendamento && (
          <div style={{
            padding: '8px 16px',
            fontSize: 11.5, color: 'var(--texto-terciario)',
            borderBottom: '1px solid var(--borda-suave)',
            display: 'flex', alignItems: 'center', gap: 6,
            flexShrink: 0,
          }}>
            <CalendarClock size={12} />
            Agendado atualmente para <strong style={{ color: 'var(--texto-secundario)' }}>
              {format(parseISO(agendamento.data_hora_inicio), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </strong>
          </div>
        )}

        {/* Lista de horários */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '24px 0', color: 'var(--texto-terciario)', fontSize: 12 }}>
              <Loader2 size={14} className="spin" /> Buscando horários disponíveis...
            </div>
          )}

          {!loading && erro && (
            <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: 'var(--cor-erro)' }}>
              {erro}
            </div>
          )}

          {!loading && !erro && dias.length === 0 && (
            <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>
              Nenhum horário disponível encontrado.
            </div>
          )}

          {!loading && dias.map(dia => (
            <div key={dia.data} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6 }}>
                {dia.data === hoje ? 'Hoje · ' : ''}
                {capitalizar(format(parseISO(dia.data), "EEEE, d 'de' MMMM", { locale: ptBR }))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {dia.slots.map(hora => {
                  const isSel = selecionado?.data === dia.data && selecionado?.hora === hora
                  return (
                    <button
                      key={hora}
                      onClick={() => setSelecionado({ data: dia.data, hora })}
                      style={{
                        padding: '6px 10px', fontSize: 12, fontWeight: 600,
                        borderRadius: 6,
                        border: `1px solid ${isSel ? 'var(--cor-primaria)' : 'var(--borda-media)'}`,
                        background: isSel ? 'var(--cor-primaria)' : 'var(--bg-input)',
                        color: isSel ? '#fff' : 'var(--texto-principal)',
                        cursor: 'pointer',
                      }}
                    >
                      {hora}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {!loading && !erro && proximaBusca && (
            <button
              onClick={() => buscar(proximaBusca, true)}
              disabled={loadingMore}
              style={{
                width: '100%', marginTop: 4, padding: '8px 12px',
                fontSize: 12, fontWeight: 600,
                background: 'none', border: '1px dashed var(--borda-media)', borderRadius: 6,
                color: 'var(--texto-secundario)', cursor: loadingMore ? 'not-allowed' : 'pointer',
              }}
            >
              {loadingMore ? 'Buscando...' : 'Carregar mais horários'}
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--borda-suave)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--bg-page)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>
            {selecionado
              ? <>Horário: <strong>{capitalizar(format(parseISO(selecionado.data), "EEE, dd/MM", { locale: ptBR }))} às {selecionado.hora}</strong></>
              : 'Selecione um horário acima'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ padding: '5px 14px', fontSize: 12, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, color: 'var(--texto-secundario)', cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={!selecionado || salvando}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 18px', fontSize: 12, fontWeight: 600,
                background: !selecionado ? 'var(--borda-media)' : 'var(--cor-primaria)',
                color: '#fff', border: 'none', borderRadius: 3,
                cursor: !selecionado || salvando ? 'not-allowed' : 'pointer',
                opacity: salvando ? 0.8 : 1,
              }}
            >
              {salvando ? 'Salvando...' : modoSelecao ? 'Usar este horário' : 'Confirmar novo horário'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
