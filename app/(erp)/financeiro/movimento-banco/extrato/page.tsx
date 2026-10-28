'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Printer, Download, Wallet, TrendingUp, TrendingDown,
  CheckCircle2, CircleDashed, Landmark,
} from 'lucide-react'
import type { ContaBancoListItem, ExtratoBancarioResponse, ExtratoBancarioMovimento } from '@/types/cadastros.types'

function fmtValor(v: string | number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: string) {
  return d.slice(0, 10).split('-').reverse().join('/')
}

function fmtDataLonga(d: string) {
  const [y, m, dia] = d.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, dia).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

function inicioMesISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

type Preset = 'mes_atual' | 'mes_anterior' | '30d' | 'personalizado'

function rangePreset(p: Preset): { inicio: string; fim: string } {
  const hoje = new Date()
  if (p === 'mes_atual')    return { inicio: inicioMesISO(), fim: hojeISO() }
  if (p === '30d') {
    const d = new Date(); d.setDate(d.getDate() - 29)
    return { inicio: d.toISOString().slice(0, 10), fim: hojeISO() }
  }
  if (p === 'mes_anterior') {
    const primeiroMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    const ultimoMesAnterior = new Date(primeiroMesAtual.getTime() - 86400000)
    const primeiroMesAnterior = new Date(ultimoMesAnterior.getFullYear(), ultimoMesAnterior.getMonth(), 1)
    return { inicio: primeiroMesAnterior.toISOString().slice(0, 10), fim: ultimoMesAnterior.toISOString().slice(0, 10) }
  }
  return { inicio: inicioMesISO(), fim: hojeISO() }
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

export default function ExtratoBancarioPage() {
  const router = useRouter()
  const [contas,        setContas]        = useState<ContaBancoListItem[]>([])
  const [contaBancoId,  setContaBancoId]  = useState('')
  const [preset,        setPreset]        = useState<Preset>('mes_atual')
  const [dataInicio,    setDataInicio]    = useState(inicioMesISO())
  const [dataFim,       setDataFim]       = useState(hojeISO())
  const [tipo,          setTipo]          = useState('')
  const [conciliado,    setConciliado]    = useState('')
  const [busca,         setBusca]         = useState('')
  const [dados,         setDados]         = useState<ExtratoBancarioResponse | null>(null)
  const [loading,       setLoading]       = useState(false)

  useEffect(() => {
    fetch('/api/cadastro/contas-banco?ativo=true&limit=200')
      .then(r => r.ok ? r.json() : { dados: [] })
      .then(d => {
        setContas(d.dados ?? [])
        if (!contaBancoId && d.dados?.length) setContaBancoId(String(d.dados[0].id))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const aplicarPreset = (p: Preset) => {
    setPreset(p)
    if (p !== 'personalizado') {
      const r = rangePreset(p)
      setDataInicio(r.inicio)
      setDataFim(r.fim)
    }
  }

  const carregar = useCallback(async () => {
    if (!contaBancoId || !dataInicio || !dataFim || dataInicio > dataFim) return
    setLoading(true)
    try {
      const sp = new URLSearchParams({ conta_banco_id: contaBancoId, data_inicio: dataInicio, data_fim: dataFim, tipo, conciliado, busca })
      const res = await fetch(`/api/financeiro/movimento-banco/extrato?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar extrato'); setDados(null); return }
      setDados(await res.json())
    } finally {
      setLoading(false)
    }
  }, [contaBancoId, dataInicio, dataFim, tipo, conciliado, busca])

  useEffect(() => { carregar() }, [carregar])

  const grupos = useMemo(() => {
    if (!dados) return []
    const map = new Map<string, ExtratoBancarioMovimento[]>()
    for (const m of dados.dados) {
      const arr = map.get(m.data_movimento) ?? []
      arr.push(m)
      map.set(m.data_movimento, arr)
    }
    return Array.from(map.entries()).map(([data, itens]) => {
      const entradas = itens.filter(i => i.tipo === 'E').reduce((s, i) => s + Number(i.valor), 0)
      const saidas   = itens.filter(i => i.tipo === 'S').reduce((s, i) => s + Number(i.valor), 0)
      return { data, itens, entradas, saidas }
    })
  }, [dados])

  const exportarCSV = () => {
    if (!dados) return
    // Prefixa com apóstrofo campos que começam com =, +, -, @ ou tab/CR — evita que o
    // Excel/Sheets interprete como fórmula ao abrir o CSV (CSV injection)
    const safe = (v: string) => /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
    const linhas = [
      ['Data', 'Operação', 'Documento', 'Pessoa', 'Observação', 'Entrada', 'Saída', 'Saldo Disponível', 'Conciliado', 'Saldo Conciliado'],
      ...dados.dados.map(m => [
        fmtData(m.data_movimento),
        safe(m.origem_desc ?? m.tipo_operacao_desc ?? m.origem_tipo ?? ''),
        safe(m.documento ?? ''),
        safe(m.pessoa_nome ?? ''),
        safe((m.observacao ?? '').replace(/\n/g, ' ')),
        m.tipo === 'E' ? Number(m.valor).toFixed(2).replace('.', ',') : '',
        m.tipo === 'S' ? Number(m.valor).toFixed(2).replace('.', ',') : '',
        Number(m.saldo_disponivel).toFixed(2).replace('.', ','),
        m.conciliado ? 'Sim' : 'Não',
        Number(m.saldo_conciliado).toFixed(2).replace('.', ','),
      ]),
    ]
    const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extrato_${dados.conta.mnemonico}_${dataInicio}_a_${dataFim}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const pendenteConciliacao = dados ? dados.saldoFinalDisponivel - dados.saldoFinalConciliado : 0

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-body { padding: 0 !important; overflow: visible !important; }
          .card { border: none !important; box-shadow: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="page-header no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn-ghost" onClick={() => router.push('/financeiro/movimento-banco')} style={{ padding: 8 }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="page-title">Extrato Bancário</h1>
            <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
              Movimentação detalhada por conta, com saldo disponível e conciliado
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={exportarCSV} disabled={!dados || loading}>
            <Download size={15} /> Exportar CSV
          </button>
          <button className="btn-primary" onClick={() => window.print()} disabled={!dados || loading}>
            <Printer size={15} /> Imprimir
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Filtros */}
        <div className="card no-print" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-terciario)', textTransform: 'uppercase' }}>Conta Bancária</label>
              <select className="input-field" value={contaBancoId} onChange={e => setContaBancoId(e.target.value)} style={{ width: 240 }}>
                {contas.length === 0 && <option value="">Nenhuma conta ativa</option>}
                {contas.map(c => (
                  <option key={c.id} value={String(c.id)}>
                    {c.mnemonico} — {c.banco_nome ?? ''} Ag. {c.agencia} / CC {c.conta}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-page)', padding: 3, borderRadius: 8 }}>
              {([
                { v: 'mes_atual',    label: 'Este mês' },
                { v: 'mes_anterior', label: 'Mês anterior' },
                { v: '30d',          label: '30 dias' },
              ] as { v: Preset; label: string }[]).map(p => (
                <button key={p.v} onClick={() => aplicarPreset(p.v)}
                  style={{
                    padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600,
                    background: preset === p.v ? 'var(--bg-card)' : 'transparent',
                    color: preset === p.v ? 'var(--cor-primaria)' : 'var(--texto-secundario)',
                  }}>
                  {p.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-terciario)', textTransform: 'uppercase' }}>De</label>
              <input type="date" className="input-field" value={dataInicio}
                onChange={e => { if (e.target.value) { setDataInicio(e.target.value); setPreset('personalizado') } }} style={{ width: 150 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-terciario)', textTransform: 'uppercase' }}>Até</label>
              <input type="date" className="input-field" value={dataFim}
                onChange={e => { if (e.target.value) { setDataFim(e.target.value); setPreset('personalizado') } }} style={{ width: 150 }} />
            </div>

            <select className="input-field" value={tipo} onChange={e => setTipo(e.target.value)} style={{ width: 120 }}>
              <option value="">E/S</option>
              <option value="E">Entrada</option>
              <option value="S">Saída</option>
            </select>
            <select className="input-field" value={conciliado} onChange={e => setConciliado(e.target.value)} style={{ width: 150 }}>
              <option value="">Conciliação</option>
              <option value="false">Não Conciliado</option>
              <option value="true">Conciliado</option>
            </select>
            <input className="input-field" placeholder="Buscar documento, pessoa ou observação..." value={busca}
              onChange={e => setBusca(e.target.value)} style={{ flex: '1 1 200px', minWidth: 180 }} />
          </div>
        </div>

        {dados && (
          <>
            {/* Cabeçalho da conta */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'var(--cor-primaria-light)', borderRadius: 10, padding: 8, display: 'flex' }}>
                <Landmark size={18} color="var(--cor-primaria)" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--texto-principal)' }}>
                  {dados.conta.mnemonico} — {dados.conta.banco_nome ?? 'Banco'} {dados.conta.banco_codigo ? `(${dados.conta.banco_codigo})` : ''}
                </div>
                <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>
                  Agência {dados.conta.agencia} · Conta {dados.conta.conta} · {dados.conta.tipo === 'P' ? 'Poupança' : 'Corrente'}
                  {' · '}Período de {fmtData(dados.periodo.inicio)} até {fmtData(dados.periodo.fim)}
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 16 }}>
              <StatCard
                label="Saldo Anterior"
                valor={fmtValor(dados.saldoAnteriorDisponivel)}
                icon={<Wallet size={18} color="var(--texto-secundario)" />}
                cor="var(--texto-secundario)" corBg="var(--bg-hover)"
              />
              <StatCard
                label="Entradas no Período"
                valor={fmtValor(dados.totalEntradas)}
                icon={<TrendingUp size={18} color="var(--cor-sucesso)" />}
                cor="var(--cor-sucesso)" corBg="var(--cor-sucesso-bg)"
              />
              <StatCard
                label="Saídas no Período"
                valor={fmtValor(dados.totalSaidas)}
                icon={<TrendingDown size={18} color="var(--cor-erro)" />}
                cor="var(--cor-erro)" corBg="var(--cor-erro-bg)"
              />
              <StatCard
                label="Saldo Disponível"
                valor={fmtValor(dados.saldoFinalDisponivel)}
                sub="Considera todos os lançamentos"
                icon={<Wallet size={18} color="var(--cor-primaria)" />}
                cor="var(--cor-primaria)" corBg="var(--cor-primaria-light)"
              />
              <StatCard
                label="Saldo Conciliado"
                valor={fmtValor(dados.saldoFinalConciliado)}
                sub={pendenteConciliacao !== 0 ? `${fmtValor(Math.abs(pendenteConciliacao))} pendente de conciliação` : 'Tudo conciliado'}
                icon={<CheckCircle2 size={18} color="var(--cor-info)" />}
                cor="var(--cor-info)" corBg="var(--cor-info-bg)"
              />
            </div>
          </>
        )}

        {/* Extrato */}
        <div className="card">
          <div className="table-wrapper">
            <table className="table-base" style={{ fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Hora/Seq</th>
                  <th>Operação / Descrição</th>
                  <th style={{ width: 120 }}>Documento</th>
                  <th style={{ width: 160 }}>Pessoa</th>
                  <th style={{ width: 120, textAlign: 'right' }}>Entrada</th>
                  <th style={{ width: 120, textAlign: 'right' }}>Saída</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Saldo Disp.</th>
                  <th style={{ width: 56, textAlign: 'center' }}>C</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Saldo Conc.</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Carregando...</td></tr>
                )}
                {!loading && (!dados || dados.dados.length === 0) && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Nenhum movimento no período selecionado</td></tr>
                )}
                {!loading && dados && grupos.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={6} style={{ padding: '6px 12px', fontSize: 11, color: 'var(--texto-terciario)', fontStyle: 'italic' }}>
                        Saldo anterior ao período
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontSize: 12, color: 'var(--texto-secundario)' }}>
                        {fmtValor(dados.saldoAnteriorDisponivel)}
                      </td>
                      <td />
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontSize: 12, color: 'var(--texto-secundario)' }}>
                        {fmtValor(dados.saldoAnteriorConciliado)}
                      </td>
                    </tr>
                    {grupos.map(g => (
                      <GrupoData key={g.data} data={g.data} itens={g.itens} entradas={g.entradas} saidas={g.saidas} />
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function GrupoData({
  data, itens, entradas, saidas,
}: { data: string; itens: ExtratoBancarioMovimento[]; entradas: number; saidas: number }) {
  return (
    <>
      <tr>
        <td colSpan={9} style={{
          padding: '8px 12px', background: 'var(--bg-page)', fontWeight: 700, fontSize: 12,
          color: 'var(--texto-principal)', borderTop: '1px solid var(--borda-media)', textTransform: 'capitalize',
        }}>
          {fmtDataLonga(data)}
        </td>
      </tr>
      {itens.map((m, idx) => (
        <tr key={m.id}>
          <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)', fontSize: 11 }}>{String(idx + 1).padStart(2, '0')}</td>
          <td>
            <div style={{ fontWeight: 500, color: 'var(--texto-principal)' }}>{m.origem_desc ?? m.tipo_operacao_desc ?? '—'}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              {m.origem_tipo ?? 'Manual'}
            </div>
          </td>
          <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>{m.documento ?? '—'}</td>
          <td style={{ color: 'var(--texto-secundario)' }}>{m.pessoa_nome ?? '—'}</td>
          <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600, color: 'var(--cor-sucesso)' }}>
            {m.tipo === 'E' ? fmtValor(m.valor) : ''}
          </td>
          <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600, color: 'var(--cor-erro)' }}>
            {m.tipo === 'S' ? fmtValor(m.valor) : ''}
          </td>
          <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', color: 'var(--texto-principal)' }}>
            {fmtValor(m.saldo_disponivel)}
          </td>
          <td style={{ textAlign: 'center' }}>
            {m.conciliado
              ? <CheckCircle2 size={14} color="var(--cor-sucesso)" style={{ display: 'inline-block' }} />
              : <CircleDashed size={14} color="var(--texto-terciario)" style={{ display: 'inline-block' }} />}
          </td>
          <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>
            {fmtValor(m.saldo_conciliado)}
          </td>
        </tr>
      ))}
      <tr>
        <td colSpan={4} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--texto-terciario)', textAlign: 'right' }}>
          Subtotal do dia
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 700, fontSize: 12, color: 'var(--cor-sucesso)' }}>
          {entradas > 0 ? fmtValor(entradas) : '—'}
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 700, fontSize: 12, color: 'var(--cor-erro)' }}>
          {saidas > 0 ? fmtValor(saidas) : '—'}
        </td>
        <td colSpan={3} />
      </tr>
    </>
  )
}
