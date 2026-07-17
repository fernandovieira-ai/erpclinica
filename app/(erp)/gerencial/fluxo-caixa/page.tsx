'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Wallet, Banknote, Building2, TrendingUp, TrendingDown, Scale,
  AlertTriangle, ArrowRight, Loader2, ListTree, CalendarClock, CreditCard,
} from 'lucide-react'
import type { FluxoCaixaResponse } from '@/types/cadastros.types'
import FluxoCaixaChart from '@/components/gerencial/FluxoCaixaChart'

const PERIODOS = [
  { valor: 7,  label: '7 dias'  },
  { valor: 30, label: '30 dias' },
  { valor: 90, label: '90 dias' },
]

const ORIGEM_ICONE_COR: Record<string, string> = {
  'Clínica':          'var(--cor-primaria)',
  'Título a Receber': 'var(--cor-primaria)',
  'Receita':          'var(--cor-primaria)',
  'Cartão':           '#7E57C2',
  'Título a Pagar':   'var(--cor-erro)',
  'Despesa':          '#e07b00',
  'Manual':           'var(--texto-terciario)',
}

function fmtValor(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: string) {
  return d.slice(0, 10).split('-').reverse().join('/')
}

function StatCard({
  label, valor, sub, icon, cor, corBg,
}: { label: string; valor: string; sub?: string; icon: React.ReactNode; cor: string; corBg: string }) {
  return (
    <div className="stat-card" style={{ borderLeft: `3px solid ${cor}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="stat-label">{label}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: cor, lineHeight: 1.15, marginTop: 6, fontFamily: 'var(--fonte-mono)' }}>
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

export default function FluxoCaixaPage() {
  const [periodo, setPeriodo] = useState(30)
  const [dados, setDados]     = useState<FluxoCaixaResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/gerencial/fluxo-caixa?periodo=${p}`)
      if (!res.ok) return
      setDados(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar(periodo) }, [carregar, periodo])

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Fluxo de Caixa</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            Visão consolidada de caixa e contas bancárias
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-page)', padding: 3, borderRadius: 8 }}>
          {PERIODOS.map(p => (
            <button
              key={p.valor}
              onClick={() => setPeriodo(p.valor)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                background: periodo === p.valor ? 'var(--bg-card)' : 'transparent',
                color: periodo === p.valor ? 'var(--cor-primaria)' : 'var(--texto-secundario)',
                boxShadow: periodo === p.valor ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {loading && !dados && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--texto-terciario)', gap: 8 }}>
            <Loader2 size={16} className="spin" /> Carregando fluxo de caixa...
          </div>
        )}

        {dados && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>

            {/* ── Alertas: vencidos e cartão em atraso ── */}
            {(dados.kpis.nReceberVencido > 0 || dados.kpis.nPagarVencido > 0) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--cor-aviso-bg)', border: '0.5px solid rgba(239,159,39,0.3)',
                borderRadius: 10, padding: '10px 16px',
              }}>
                <AlertTriangle size={16} style={{ color: 'var(--cor-aviso)', flexShrink: 0 }} />
                <div style={{ fontSize: 12.5, color: 'var(--cor-primaria-text)', flex: 1 }}>
                  <strong>{dados.kpis.nReceberVencido + dados.kpis.nPagarVencido} título(s) vencido(s)</strong>
                  {dados.kpis.nReceberVencido > 0 && (
                    <> · {fmtValor(dados.kpis.aReceberVencido)} a receber</>
                  )}
                  {dados.kpis.nPagarVencido > 0 && (
                    <> · {fmtValor(dados.kpis.aPagarVencido)} a pagar</>
                  )}
                </div>
                <Link href="/financeiro/contas-receber" style={{ fontSize: 12, fontWeight: 600, color: 'var(--cor-primaria)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                  Ver títulos <ArrowRight size={12} />
                </Link>
              </div>
            )}

            {dados.kpis.nCartaoAtrasado > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'var(--cor-aviso-bg)', border: '0.5px solid rgba(239,159,39,0.3)',
                borderRadius: 10, padding: '10px 16px',
              }}>
                <AlertTriangle size={16} style={{ color: 'var(--cor-aviso)', flexShrink: 0 }} />
                <div style={{ fontSize: 12.5, color: 'var(--cor-primaria-text)', flex: 1 }}>
                  <strong>{dados.kpis.nCartaoAtrasado} parcela(s) de cartão em atraso</strong>
                  {' '}· {fmtValor(dados.kpis.aReceberCartaoAtrasado)} sem fatura gerada
                </div>
                <Link href="/financeiro/cartao-faturas" style={{ fontSize: 12, fontWeight: 600, color: 'var(--cor-primaria)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                  Gerar faturas <ArrowRight size={12} />
                </Link>
              </div>
            )}

            {/* ── KPI Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <StatCard
                label="Saldo Total"
                valor={fmtValor(dados.kpis.saldoTotal)}
                sub={`Caixa ${fmtValor(dados.kpis.saldoCaixa)} · Banco ${fmtValor(dados.kpis.saldoBanco)}`}
                icon={<Wallet size={18} style={{ color: 'var(--cor-primaria)' }} />}
                cor="var(--cor-primaria)"
                corBg="var(--cor-primaria-light)"
              />
              <StatCard
                label="Entradas Hoje"
                valor={fmtValor(dados.kpis.entradasHoje)}
                sub={`${fmtValor(dados.kpis.entradasPeriodo)} nos últimos ${dados.periodoDias}d`}
                icon={<TrendingUp size={18} style={{ color: 'var(--cor-primaria)' }} />}
                cor="var(--cor-primaria)"
                corBg="var(--cor-primaria-light)"
              />
              <StatCard
                label="Saídas Hoje"
                valor={fmtValor(dados.kpis.saidasHoje)}
                sub={`${fmtValor(dados.kpis.saidasPeriodo)} nos últimos ${dados.periodoDias}d`}
                icon={<TrendingDown size={18} style={{ color: 'var(--cor-erro)' }} />}
                cor="var(--cor-erro)"
                corBg="var(--cor-erro-bg)"
              />
              <StatCard
                label="Resultado do Dia"
                valor={`${dados.kpis.resultadoHoje < 0 ? '−' : ''}${fmtValor(Math.abs(dados.kpis.resultadoHoje))}`}
                sub="entradas − saídas de hoje"
                icon={<Scale size={18} style={{ color: dados.kpis.resultadoHoje >= 0 ? 'var(--cor-primaria)' : 'var(--cor-erro)' }} />}
                cor={dados.kpis.resultadoHoje >= 0 ? 'var(--cor-primaria)' : 'var(--cor-erro)'}
                corBg={dados.kpis.resultadoHoje >= 0 ? 'var(--cor-primaria-light)' : 'var(--cor-erro-bg)'}
              />
              <Link href="/financeiro/cartao-vendas" style={{ textDecoration: 'none' }}>
                <StatCard
                  label="A Receber (Cartão)"
                  valor={fmtValor(dados.kpis.aReceberCartao)}
                  sub={
                    dados.kpis.nCartaoAtrasado > 0
                      ? `${fmtValor(dados.kpis.aReceberCartaoAtrasado)} em atraso (${dados.kpis.nCartaoAtrasado})`
                      : 'vendas no cartão ainda não confirmadas'
                  }
                  icon={<CreditCard size={18} style={{ color: dados.kpis.nCartaoAtrasado > 0 ? 'var(--cor-aviso)' : '#7E57C2' }} />}
                  cor={dados.kpis.nCartaoAtrasado > 0 ? 'var(--cor-aviso)' : '#7E57C2'}
                  corBg={dados.kpis.nCartaoAtrasado > 0 ? 'var(--cor-aviso-bg)' : '#7E57C220'}
                />
              </Link>
            </div>

            {/* ── Gráfico principal ── */}
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Banknote size={15} style={{ color: 'var(--cor-primaria)' }} />
                  <span className="card-title">Evolução do Fluxo de Caixa</span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--texto-terciario)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: '#12857A', display: 'inline-block' }} /> Entradas
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: '#E24B4A', display: 'inline-block' }} /> Saídas
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#378ADD', display: 'inline-block' }} /> Saldo
                  </span>
                </div>
              </div>
              <div className="card-body">
                <FluxoCaixaChart serie={dados.serie} />
              </div>
            </div>

            {/* ── Origem + Projeção ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              {/* Composição por Origem */}
              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <ListTree size={15} style={{ color: 'var(--cor-primaria)' }} />
                    <span className="card-title">Composição por Origem</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>últimos {dados.periodoDias}d</span>
                </div>
                <div style={{ padding: '10px 16px 16px' }}>
                  {dados.origem.length === 0 && (
                    <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--texto-terciario)' }}>
                      Nenhum movimento no período
                    </div>
                  )}
                  {(() => {
                    const max = Math.max(...dados.origem.map(o => o.entradas + o.saidas), 1)
                    return dados.origem.map(o => {
                      const total = o.entradas + o.saidas
                      const pctEntradas = (o.entradas / max) * 100
                      const pctSaidas   = (o.saidas / max) * 100
                      return (
                        <div key={o.origem} style={{ padding: '7px 0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--texto-secundario)', fontWeight: 500 }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: ORIGEM_ICONE_COR[o.origem] ?? 'var(--texto-terciario)', display: 'inline-block', flexShrink: 0 }} />
                              {o.origem}
                            </span>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--texto-principal)', fontFamily: 'var(--fonte-mono)' }}>
                              {fmtValor(total)}
                            </span>
                          </div>
                          <div style={{ height: 6, borderRadius: 4, background: 'var(--borda-suave)', overflow: 'hidden', display: 'flex' }}>
                            {pctEntradas > 0 && <div style={{ height: '100%', width: `${pctEntradas}%`, background: '#12857A' }} />}
                            {pctSaidas > 0 && <div style={{ height: '100%', width: `${pctSaidas}%`, background: '#E24B4A', marginLeft: 1 }} />}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              {/* Projeção de vencimentos */}
              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <CalendarClock size={15} style={{ color: 'var(--cor-primaria)' }} />
                    <span className="card-title">Projeção — Próximos 30 dias</span>
                  </div>
                </div>
                <div style={{ padding: '10px 16px 8px' }}>
                  {(() => {
                    const max = Math.max(...dados.projecao.flatMap(b => [b.aReceber, b.aPagar]), 1)
                    return dados.projecao.map(b => (
                      <div key={b.label} style={{ padding: '7px 0' }}>
                        <div style={{ fontSize: 11.5, color: 'var(--texto-terciario)', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          {b.label}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ width: 46, fontSize: 11, color: 'var(--texto-terciario)', flexShrink: 0 }}>Receber</span>
                          <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--borda-suave)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(b.aReceber / max) * 100}%`, background: '#12857A', borderRadius: 4 }} />
                          </div>
                          <span style={{ width: 78, fontSize: 11.5, fontWeight: 600, color: 'var(--texto-principal)', textAlign: 'right', fontFamily: 'var(--fonte-mono)' }}>
                            {fmtValor(b.aReceber)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 46, fontSize: 11, color: 'var(--texto-terciario)', flexShrink: 0 }}>Pagar</span>
                          <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--borda-suave)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(b.aPagar / max) * 100}%`, background: '#E24B4A', borderRadius: 4 }} />
                          </div>
                          <span style={{ width: 78, fontSize: 11.5, fontWeight: 600, color: 'var(--texto-principal)', textAlign: 'right', fontFamily: 'var(--fonte-mono)' }}>
                            {fmtValor(b.aPagar)}
                          </span>
                        </div>
                      </div>
                    ))
                  })()}
                </div>
                <div style={{
                  margin: '4px 16px 14px', padding: '10px 12px', background: 'var(--cor-primaria-light)',
                  borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--cor-primaria-text)', fontWeight: 500 }}>Saldo projetado (30d)</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cor-primaria)', fontFamily: 'var(--fonte-mono)' }}>
                    {fmtValor(
                      dados.kpis.saldoTotal
                      + dados.projecao.reduce((s, b) => s + b.aReceber - b.aPagar, 0),
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Últimos movimentos ── */}
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Building2 size={15} style={{ color: 'var(--cor-primaria)' }} />
                  <span className="card-title">Últimos Movimentos</span>
                </div>
                <Link href="/financeiro/movimento-caixa" style={{ fontSize: 12, fontWeight: 500, color: 'var(--cor-primaria)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                  Ver extrato completo <ArrowRight size={12} />
                </Link>
              </div>
              <div className="table-wrapper">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Data</th>
                      <th style={{ width: 90 }}>Conta</th>
                      <th style={{ width: 130, textAlign: 'right' }}>Valor</th>
                      <th>Descrição</th>
                      <th style={{ width: 130 }}>Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.movimentos.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Nenhum movimento registrado ainda</td></tr>
                    )}
                    {dados.movimentos.map(m => (
                      <tr key={`${m.conta}-${m.id}`}>
                        <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>{fmtData(m.data_movimento)}</td>
                        <td style={{ color: 'var(--texto-secundario)' }}>{m.conta}</td>
                        <td style={{
                          textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600,
                          color: m.tipo === 'E' ? 'var(--cor-sucesso)' : 'var(--cor-erro)',
                        }}>
                          {m.tipo === 'S' ? '–' : '+'}{fmtValor(m.valor)}
                        </td>
                        <td style={{ color: 'var(--texto-secundario)', fontSize: 12 }}>
                          {m.observacao || m.documento || '—'}
                        </td>
                        <td>
                          <span style={{
                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em',
                            color: ORIGEM_ICONE_COR[m.origem] ?? 'var(--texto-terciario)',
                          }}>
                            {m.origem}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
