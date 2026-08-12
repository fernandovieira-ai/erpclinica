'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Lock, Unlock, CheckCircle2, ClipboardCheck,
  Wallet, Banknote, Building2, CreditCard, CalendarClock,
  Users, UserX, TrendingUp, Receipt, Loader2, Pencil,
} from 'lucide-react'
import { formatBRL, formatDateTime } from '@/lib/utils'

interface CondicaoPagamento {
  id: number
  descricao: string
  tipo_pagamento: string
  ativo: boolean
}

interface AgendamentoDia {
  id: number
  data_hora_inicio: string
  status: string
  paciente_id: number
  paciente_nome: string
  profissional_id: number
  profissional_nome: string
  tipo_descricao: string | null
  recebimento_id: number | null
  status_recebimento: string | null
  total_recebimento: number | null
  batch_agendamento_id: number | null
  condicao_pagamento_id: number | null
  tipo_pagamento: string | null
  condicao_descricao: string | null
}

interface Fechamento {
  status: 'ABERTO' | 'FECHADO'
  fechado_por: string | null
  fechado_em: string | null
  reaberto_por: string | null
  reaberto_em: string | null
  motivo_reabertura: string | null
}

interface FechamentoDiarioResponse {
  data: string
  fechamento: Fechamento | null
  agendamentos: AgendamentoDia[]
  kpis: {
    total_agendados: number
    total_atendidos: number
    total_faltas: number
    total_cancelados: number
    taxa_comparecimento: number
    total_recebido: number
    ticket_medio: number
    por_forma: { dinheiro: number; pix: number; debito: number; credito: number; a_prazo: number }
    por_profissional: Array<{
      profissional_id: number; profissional_nome: string
      total_agendados: number; atendidos: number; faltas: number; total_recebido: number
    }>
  }
}

const STATUS_LABEL: Record<string, string> = {
  AGENDADO: 'Agendado', CONFIRMADO: 'Confirmado', AGUARDANDO: 'Aguardando',
  ATENDIDO: 'Atendido', FALTOU: 'Faltou', CANCELADO: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  AGENDADO: '#378ADD', CONFIRMADO: '#7E57C2', AGUARDANDO: '#EF9F27',
  ATENDIDO: '#12857A', FALTOU: '#E24B4A', CANCELADO: '#888780',
}
const TIPO_PGTO_LABEL: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', a_prazo: 'A Prazo',
}

function hojeStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function shiftDate(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return dt.toISOString().slice(0, 10)
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function StatCard({
  label, valor, sub, icon, cor, corBg,
}: { label: string; valor: string; sub?: string; icon: React.ReactNode; cor: string; corBg: string }) {
  return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${cor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="stat-label">{label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: cor, lineHeight: 1.15, marginTop: 6, fontFamily: 'var(--fonte-mono)' }}>
            {valor}
          </div>
          {sub && <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ background: corBg, borderRadius: 10, padding: 8, flexShrink: 0 }}>
          {icon}
        </div>
      </div>
    </div>
  )
}

export default function FechamentoDiarioPage() {
  const [data, setData]         = useState(hojeStr())
  const [dados, setDados]       = useState<FechamentoDiarioResponse | null>(null)
  const [loading, setLoading]   = useState(true)
  const [perfil, setPerfil]     = useState<string | null>(null)
  const [loadingAcao, setLoadingAcao] = useState(false)
  const [condicoes, setCondicoes] = useState<CondicaoPagamento[]>([])
  const [modalAg, setModalAg]   = useState<AgendamentoDia | null>(null)
  const [novaCondicaoId, setNovaCondicaoId] = useState<string>('')
  const [motivo, setMotivo]     = useState('')

  const carregar = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/gerencial/fechamento-diario?data=${d}`)
      if (!res.ok) return
      setDados(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar(data) }, [carregar, data])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setPerfil(d.perfil ?? null)).catch(() => {})
    fetch('/api/cadastro/condicoes-pagamento?ativo=true&limit=100')
      .then(r => r.json()).then(d => setCondicoes(d.dados ?? [])).catch(() => {})
  }, [])

  const isAdmin      = perfil === 'admin'
  const diaFechado    = dados?.fechamento?.status === 'FECHADO'
  const diaFuturo     = data > hojeStr()

  async function handleFechar() {
    if (!window.confirm(`Fechar o caixa de ${data.split('-').reverse().join('/')}? Depois de fechado, as correções ficam bloqueadas até reabrir.`)) return
    setLoadingAcao(true)
    try {
      const res = await fetch('/api/gerencial/fechamento-diario/fechar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.erro ?? 'Erro ao fechar caixa do dia'); return }
      await carregar(data)
    } finally {
      setLoadingAcao(false)
    }
  }

  async function handleReabrir() {
    const motivoReabertura = window.prompt('Informe o motivo para reabrir o caixa do dia:')
    if (motivoReabertura === null) return
    setLoadingAcao(true)
    try {
      const res = await fetch('/api/gerencial/fechamento-diario/reabrir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, motivo: motivoReabertura }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.erro ?? 'Erro ao reabrir caixa do dia'); return }
      await carregar(data)
    } finally {
      setLoadingAcao(false)
    }
  }

  function abrirCorrecao(ag: AgendamentoDia) {
    setModalAg(ag)
    setNovaCondicaoId('')
    setMotivo('')
  }

  async function handleReclassificar() {
    if (!modalAg || !novaCondicaoId || !motivo.trim()) return
    setLoadingAcao(true)
    try {
      const res = await fetch('/api/gerencial/fechamento-diario/reclassificar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recebimento_id: modalAg.recebimento_id,
          nova_condicao_pagamento_id: Number(novaCondicaoId),
          motivo: motivo.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.erro ?? 'Erro ao corrigir forma de pagamento'); return }
      setModalAg(null)
      await carregar(data)
    } finally {
      setLoadingAcao(false)
    }
  }

  const kpis = dados?.kpis

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Fechamento Diário</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            Controle diário de agendamentos e recebimentos da clínica
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-ghost" onClick={() => setData(prev => shiftDate(prev, -1))} title="Dia anterior">
            <ChevronLeft size={16} />
          </button>
          <input
            type="date" className="input-field" value={data}
            onChange={e => setData(e.target.value)}
            style={{ width: 150 }}
          />
          <button
            className="btn-ghost" onClick={() => setData(prev => shiftDate(prev, 1))}
            disabled={data >= hojeStr()} title="Próximo dia"
          >
            <ChevronRight size={16} />
          </button>
          {data !== hojeStr() && (
            <button className="btn-ghost" onClick={() => setData(hojeStr())}>Hoje</button>
          )}
        </div>
      </div>

      <div className="page-body">
        {loading && !dados && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--texto-terciario)', gap: 8 }}>
            <Loader2 size={16} className="spin" /> Carregando fechamento do dia...
          </div>
        )}

        {dados && kpis && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>

            {/* Banner de status do fechamento */}
            {diaFechado ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--borda-suave)', border: '0.5px solid var(--borda-media)',
                borderRadius: 10, padding: '10px 16px',
              }}>
                <Lock size={16} style={{ color: 'var(--texto-secundario)', flexShrink: 0 }} />
                <div style={{ fontSize: 12.5, flex: 1, color: 'var(--texto-secundario)' }}>
                  Caixa <strong>FECHADO</strong>
                  {dados.fechamento?.fechado_em && <> em {formatDateTime(dados.fechamento.fechado_em)} por {dados.fechamento.fechado_por}</>}
                  {dados.fechamento?.reaberto_em && <> · Reaberto em {formatDateTime(dados.fechamento.reaberto_em)} por {dados.fechamento.reaberto_por}</>}
                </div>
                {isAdmin && (
                  <button className="btn-ghost" onClick={handleReabrir} disabled={loadingAcao} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    <Unlock size={14} /> Reabrir
                  </button>
                )}
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--cor-primaria-light)', border: '0.5px solid rgba(18,133,122,0.3)',
                borderRadius: 10, padding: '10px 16px',
              }}>
                <CheckCircle2 size={16} style={{ color: 'var(--cor-primaria)', flexShrink: 0 }} />
                <div style={{ fontSize: 12.5, flex: 1, color: 'var(--cor-primaria-text)' }}>
                  Caixa <strong>ABERTO</strong> — edições e correções permitidas
                </div>
                {isAdmin && !diaFuturo && (
                  <button className="btn-primary" onClick={handleFechar} disabled={loadingAcao} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    <ClipboardCheck size={14} /> Fechar caixa do dia
                  </button>
                )}
              </div>
            )}

            {/* KPIs financeiros */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <StatCard
                label="Total Recebido" valor={formatBRL(kpis.total_recebido)}
                icon={<Wallet size={18} style={{ color: 'var(--cor-primaria)' }} />}
                cor="var(--cor-primaria)" corBg="var(--cor-primaria-light)"
              />
              <StatCard
                label="Dinheiro" valor={formatBRL(kpis.por_forma.dinheiro)}
                icon={<Banknote size={18} style={{ color: '#2d6a2d' }} />}
                cor="#2d6a2d" corBg="#2d6a2d20"
              />
              <StatCard
                label="PIX" valor={formatBRL(kpis.por_forma.pix)}
                icon={<Building2 size={18} style={{ color: '#0F6E56' }} />}
                cor="#0F6E56" corBg="#0F6E5620"
              />
              <StatCard
                label="Cartão" valor={formatBRL(kpis.por_forma.debito + kpis.por_forma.credito)}
                sub={`Débito ${formatBRL(kpis.por_forma.debito)} · Crédito ${formatBRL(kpis.por_forma.credito)}`}
                icon={<CreditCard size={18} style={{ color: '#7E57C2' }} />}
                cor="#7E57C2" corBg="#7E57C220"
              />
              <StatCard
                label="A Prazo" valor={formatBRL(kpis.por_forma.a_prazo)}
                icon={<CalendarClock size={18} style={{ color: 'var(--cor-aviso)' }} />}
                cor="var(--cor-aviso)" corBg="var(--cor-aviso-bg)"
              />
            </div>

            {/* KPIs clínicos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <StatCard
                label="Agendamentos" valor={String(kpis.total_agendados)}
                sub={`Atendidos: ${kpis.total_atendidos}`}
                icon={<Users size={18} style={{ color: 'var(--cor-primaria)' }} />}
                cor="var(--cor-primaria)" corBg="var(--cor-primaria-light)"
              />
              <StatCard
                label="Faltas" valor={String(kpis.total_faltas)}
                sub={`Cancelados: ${kpis.total_cancelados}`}
                icon={<UserX size={18} style={{ color: 'var(--cor-erro)' }} />}
                cor="var(--cor-erro)" corBg="var(--cor-erro-bg)"
              />
              <StatCard
                label="Comparecimento" valor={`${kpis.taxa_comparecimento.toFixed(0)}%`}
                icon={<TrendingUp size={18} style={{ color: 'var(--cor-primaria)' }} />}
                cor="var(--cor-primaria)" corBg="var(--cor-primaria-light)"
              />
              <StatCard
                label="Ticket Médio" valor={formatBRL(kpis.ticket_medio)}
                icon={<Receipt size={18} style={{ color: 'var(--cor-primaria)' }} />}
                cor="var(--cor-primaria)" corBg="var(--cor-primaria-light)"
              />
            </div>

            {/* Por Profissional */}
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Users size={15} style={{ color: 'var(--cor-primaria)' }} />
                  <span className="card-title">Por Profissional</span>
                </div>
              </div>
              <div className="table-wrapper">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Profissional</th>
                      <th style={{ textAlign: 'center', width: 100 }}>Agendados</th>
                      <th style={{ textAlign: 'center', width: 90 }}>Atendidos</th>
                      <th style={{ textAlign: 'center', width: 80 }}>Faltas</th>
                      <th style={{ textAlign: 'right', width: 140 }}>Total Recebido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.por_profissional.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: 'var(--texto-terciario)', fontSize: 13 }}>Nenhum agendamento no dia</td></tr>
                    )}
                    {kpis.por_profissional.map(p => (
                      <tr key={p.profissional_id}>
                        <td>{p.profissional_nome}</td>
                        <td style={{ textAlign: 'center' }}>{p.total_agendados}</td>
                        <td style={{ textAlign: 'center', color: 'var(--cor-sucesso)', fontWeight: 600 }}>{p.atendidos}</td>
                        <td style={{ textAlign: 'center', color: p.faltas > 0 ? 'var(--cor-erro)' : 'var(--texto-terciario)' }}>{p.faltas}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600 }}>{formatBRL(p.total_recebido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Agendamentos do dia */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Agendamentos do Dia</span>
                <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>{dados.agendamentos.length} agendamento(s)</span>
              </div>
              <div className="table-wrapper">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}>Horário</th>
                      <th>Paciente</th>
                      <th>Profissional</th>
                      <th>Tipo de Atendimento</th>
                      <th style={{ width: 110 }}>Status</th>
                      <th style={{ width: 110 }}>Forma Pgto</th>
                      <th style={{ width: 110, textAlign: 'right' }}>Valor</th>
                      {isAdmin && <th style={{ width: 90 }}>Ação</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.agendamentos.length === 0 && (
                      <tr><td colSpan={isAdmin ? 8 : 7} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Nenhum agendamento neste dia</td></tr>
                    )}
                    {dados.agendamentos.map(ag => {
                      const pago      = ag.status_recebimento === 'PAGO'
                      const isLote    = ag.batch_agendamento_id != null && ag.batch_agendamento_id !== ag.id
                      const podeCorrigir = isAdmin && pago && !diaFechado && !isLote
                      return (
                        <tr key={ag.id}>
                          <td style={{ fontFamily: 'var(--fonte-mono)', fontSize: 12 }}>{fmtHora(ag.data_hora_inicio)}</td>
                          <td>{ag.paciente_nome}</td>
                          <td style={{ color: 'var(--texto-secundario)', fontSize: 12 }}>{ag.profissional_nome}</td>
                          <td style={{ color: 'var(--texto-secundario)', fontSize: 12 }}>{ag.tipo_descricao ?? '—'}</td>
                          <td>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
                              background: `${STATUS_COLOR[ag.status] ?? '#888'}20`,
                              color: STATUS_COLOR[ag.status] ?? '#888',
                            }}>
                              {STATUS_LABEL[ag.status] ?? ag.status}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>
                            {ag.tipo_pagamento ? TIPO_PGTO_LABEL[ag.tipo_pagamento] ?? ag.tipo_pagamento : '—'}
                            {isLote && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--texto-terciario)' }}>(lote)</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600, color: pago ? 'var(--cor-sucesso)' : 'var(--texto-terciario)' }}>
                            {pago ? formatBRL(ag.total_recebimento ?? 0) : '—'}
                          </td>
                          {isAdmin && (
                            <td onClick={e => e.stopPropagation()}>
                              {podeCorrigir && (
                                <button
                                  className="btn-ghost" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}
                                  onClick={() => abrirCorrecao(ag)}
                                  title="Corrigir forma de pagamento"
                                >
                                  <Pencil size={12} /> Corrigir
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal de correção de forma de pagamento */}
      {modalAg && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => setModalAg(null)}
        >
          <div
            className="card"
            style={{ width: 420, maxWidth: '92vw', padding: 20 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Corrigir Forma de Pagamento</div>
            <div style={{ fontSize: 12.5, color: 'var(--texto-secundario)', marginBottom: 14 }}>
              Paciente: <strong>{modalAg.paciente_nome}</strong><br />
              Forma atual: <strong>{modalAg.tipo_pagamento ? TIPO_PGTO_LABEL[modalAg.tipo_pagamento] ?? modalAg.tipo_pagamento : '—'}</strong>
              {modalAg.condicao_descricao && <> ({modalAg.condicao_descricao})</>}
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Nova forma de pagamento</label>
              <select className="input-field" value={novaCondicaoId} onChange={e => setNovaCondicaoId(e.target.value)} style={{ width: '100%' }}>
                <option value="">Selecione...</option>
                {condicoes
                  .filter(c => c.id !== modalAg.condicao_pagamento_id)
                  .map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Motivo da correção</label>
              <textarea
                className="input-field" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Ex: Pagamento foi feito em PIX, nao em dinheiro"
                style={{ width: '100%', resize: 'vertical' }}
              />
              <div style={{ fontSize: 10.5, color: 'var(--texto-terciario)', marginTop: 3 }}>
                Evite acentos e caracteres especiais no texto.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setModalAg(null)} disabled={loadingAcao}>Cancelar</button>
              <button
                className="btn-primary" onClick={handleReclassificar}
                disabled={!novaCondicaoId || !motivo.trim() || loadingAcao}
              >
                {loadingAcao ? 'Processando...' : 'Confirmar Correção'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
