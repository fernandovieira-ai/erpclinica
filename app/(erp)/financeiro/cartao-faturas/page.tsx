'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, RefreshCw, Filter, X } from 'lucide-react'
import type { FaturaCartaoListItem, FaturaCartaoListResponse, VendaCartaoPendenteFatura, VendaCartaoPendenteFaturaResponse } from '@/types/cartao.types'

function fmtValor(v: string | number | null) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(d: string | null) {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}
function fmtEmissao(inicio: string | null, fim: string | null) {
  if (!inicio) return '—'
  if (!fim || fim === inicio) return fmtData(inicio)
  return `${fmtData(inicio)}–${fmtData(fim)}`
}
function hoje() {
  return new Date().toISOString().slice(0, 10)
}

const STATUS_COR: Record<string, string> = {
  ABERTA:     'var(--cor-aviso)',
  CONFIRMADA: 'var(--cor-sucesso)',
  CANCELADA:  'var(--texto-terciario)',
}

const ADQUIRENTES = ['STONE', 'CIELO', 'REDE', 'GETNET', 'SAFRAPAY', 'MERCADO PAGO', 'PAGSEGURO', 'SICREDI']
const BANDEIRAS   = ['VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD']
const MODALIDADES: Record<string, string> = { DEBITO: 'Débito', CREDITO_VISTA: 'Crédito à Vista', CREDITO_PARCELADO: 'Crédito Parcelado' }

interface FiltroGeracao {
  data_emissao_inicio:    string
  data_emissao_fim:       string
  data_vencimento_inicio: string
  data_vencimento_fim:    string
  conta_banco_id:         string
  adquirente:              string
  bandeira:                string
  modalidade:              string
  busca:                   string
}

const FILTRO_VAZIO: FiltroGeracao = {
  data_emissao_inicio: '', data_emissao_fim: '',
  data_vencimento_inicio: '', data_vencimento_fim: hoje(),
  conta_banco_id: '', adquirente: '', bandeira: '', modalidade: '', busca: '',
}

export default function CartaoFaturasPage() {
  const router = useRouter()
  const [dados,    setDados]    = useState<FaturaCartaoListItem[]>([])
  const [total,    setTotal]    = useState(0)
  const [pages,    setPages]    = useState(1)
  const [loading,  setLoading]  = useState(false)
  const [status,   setStatus]   = useState('')
  const [page,     setPage]     = useState(1)
  const [gerando,  setGerando]  = useState(false)

  const [contas, setContas] = useState<Array<{ id: number; mnemonico: string }>>([])
  const [showFiltro, setShowFiltro] = useState(false)
  const [filtro, setFiltro] = useState<FiltroGeracao>(FILTRO_VAZIO)

  const [pendentes, setPendentes] = useState<VendaCartaoPendenteFatura[]>([])
  const [pendentesLoading, setPendentesLoading] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ page: String(page), limit: '50' })
      if (status) sp.set('status', status)
      const res = await fetch(`/api/financeiro/cartao/faturas?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar'); return }
      const data: FaturaCartaoListResponse = await res.json()
      setDados(data.dados); setTotal(data.total); setPages(data.pages)
    } finally { setLoading(false) }
  }, [status, page])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setPage(1) }, [status])

  useEffect(() => {
    fetch('/api/cadastro/contas-banco?ativo=true&limit=100')
      .then(r => r.json())
      .then(d => setContas(d.dados ?? []))
      .catch(() => {})
  }, [])

  function campo<K extends keyof FiltroGeracao>(k: K, v: FiltroGeracao[K]) {
    setFiltro(f => ({ ...f, [k]: v }))
  }

  const filtroParams = useCallback(() => ({
    data_emissao_inicio:    filtro.data_emissao_inicio || '',
    data_emissao_fim:       filtro.data_emissao_fim || '',
    data_vencimento_inicio: filtro.data_vencimento_inicio || '',
    data_vencimento_fim:    filtro.data_vencimento_fim || '',
    conta_banco_id:         filtro.conta_banco_id || '',
    adquirente:             filtro.adquirente || '',
    bandeira:               filtro.bandeira || '',
    modalidade:             filtro.modalidade || '',
    busca:                  filtro.busca || '',
  }), [filtro])

  const buscarPendentes = useCallback(async () => {
    setPendentesLoading(true)
    try {
      const sp  = new URLSearchParams(filtroParams())
      const res = await fetch(`/api/financeiro/cartao/faturas/gerar?${sp}`)
      if (!res.ok) { toast.error('Erro ao buscar vendas pendentes'); return }
      const json: VendaCartaoPendenteFaturaResponse = await res.json()
      setPendentes(json.dados)
      setSelecionados(new Set(json.dados.map(p => p.parcela_id))) // seleciona tudo por padrão, usuário desmarca o que não quer
    } finally {
      setPendentesLoading(false)
    }
  }, [filtroParams])

  // Busca ao vivo: toda mudança de filtro (com debounce) re-lista as vendas
  // pendentes pra conferência, sem gravar nada — só ao clicar em "Gerar
  // Fatura" com a seleção é que o agrupamento acontece de fato.
  useEffect(() => {
    if (!showFiltro) return
    const timer = setTimeout(buscarPendentes, 350)
    return () => clearTimeout(timer)
  }, [showFiltro, buscarPendentes])

  function toggleSelecionado(parcelaId: number) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(parcelaId)) next.delete(parcelaId); else next.add(parcelaId)
      return next
    })
  }

  function toggleTodos() {
    setSelecionados(prev => prev.size === pendentes.length ? new Set() : new Set(pendentes.map(p => p.parcela_id)))
  }

  const selecionadosInfo = useMemo(() => {
    const linhas = pendentes.filter(p => selecionados.has(p.parcela_id))
    return { qtd: linhas.length, valor: linhas.reduce((acc, p) => acc + Number(p.valor_liquido), 0) }
  }, [pendentes, selecionados])

  async function gerarFaturas() {
    if (selecionados.size === 0) { toast.error('Selecione ao menos uma venda'); return }
    setGerando(true)
    try {
      const res  = await fetch('/api/financeiro/cartao/faturas/gerar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parcela_ids: Array.from(selecionados) }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.erro ?? 'Erro ao gerar faturas'); return }
      toast.success(`${json.faturas_geradas} fatura(s) atualizada(s) — ${fmtValor(json.valor_total)}`)
      carregar()
      buscarPendentes()
    } finally { setGerando(false) }
  }

  const inicio = (page - 1) * 50 + 1
  const fim    = Math.min(page * 50, total)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Faturas de Cartão</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>Recebíveis previstos do adquirente, agrupados por conta + data — confirme para gerar o movimento bancário</div>
        </div>
        <button className="btn-primary" onClick={() => setShowFiltro(s => !s)}>
          {showFiltro ? <X size={15} /> : <Filter size={15} />} {showFiltro ? 'Fechar' : 'Gerar Faturas'}
        </button>
      </div>

      <div className="page-body">
        {showFiltro && (
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginBottom: 12 }}>
              Filtre pelos dados da venda no cartão, confira a lista abaixo e desmarque o que não quer incluir — só o que estiver marcado entra na fatura ao clicar em "Gerar Fatura".
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Emissão de</label>
                <input type="date" className="input-field" value={filtro.data_emissao_inicio} onChange={e => campo('data_emissao_inicio', e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Emissão até</label>
                <input type="date" className="input-field" value={filtro.data_emissao_fim} onChange={e => campo('data_emissao_fim', e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Vencimento de</label>
                <input type="date" className="input-field" value={filtro.data_vencimento_inicio} onChange={e => campo('data_vencimento_inicio', e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Vencimento até</label>
                <input type="date" className="input-field" value={filtro.data_vencimento_fim} onChange={e => campo('data_vencimento_fim', e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Conta Bancária</label>
                <select className="input-field" value={filtro.conta_banco_id} onChange={e => campo('conta_banco_id', e.target.value)} style={{ width: '100%' }}>
                  <option value="">Todas</option>
                  {contas.map(c => <option key={c.id} value={String(c.id)}>{c.mnemonico}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Adquirente</label>
                <input list="lista-adquirentes-filtro" className="input-field" value={filtro.adquirente} onChange={e => campo('adquirente', e.target.value.toUpperCase())} style={{ width: '100%' }} placeholder="Todos" />
                <datalist id="lista-adquirentes-filtro">
                  {ADQUIRENTES.map(a => <option key={a} value={a} />)}
                </datalist>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Bandeira</label>
                <select className="input-field" value={filtro.bandeira} onChange={e => campo('bandeira', e.target.value)} style={{ width: '100%' }}>
                  <option value="">Todas</option>
                  {BANDEIRAS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Modalidade</label>
                <select className="input-field" value={filtro.modalidade} onChange={e => campo('modalidade', e.target.value)} style={{ width: '100%' }}>
                  <option value="">Todas</option>
                  {Object.entries(MODALIDADES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>NSU / Autorização</label>
                <input className="input-field" value={filtro.busca} onChange={e => campo('busca', e.target.value)} style={{ width: '100%' }} placeholder="Busca" />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="table-wrapper" style={{ maxHeight: 320, overflowY: 'auto', border: '0.5px solid var(--borda-suave)', borderRadius: 6 }}>
                <table className="table-base">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}>
                        <input type="checkbox" checked={pendentes.length > 0 && selecionados.size === pendentes.length} onChange={toggleTodos} disabled={pendentes.length === 0} />
                      </th>
                      <th style={{ width: 70 }}>Venda</th>
                      <th style={{ width: 110 }}>Conta</th>
                      <th style={{ width: 110 }}>Adquirente</th>
                      <th style={{ width: 90 }}>Bandeira</th>
                      <th style={{ width: 130 }}>NSU</th>
                      <th style={{ width: 100 }}>Emissão</th>
                      <th style={{ width: 100 }}>Vencimento</th>
                      <th style={{ textAlign: 'right', width: 110 }}>Bruto</th>
                      <th style={{ textAlign: 'right', width: 110 }}>Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendentesLoading && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 20, color: 'var(--texto-terciario)' }}>Buscando...</td></tr>}
                    {!pendentesLoading && pendentes.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)' }}>Nenhuma venda pendente para esses filtros</td></tr>}
                    {!pendentesLoading && pendentes.map(p => (
                      <tr key={p.parcela_id} style={{ cursor: 'pointer' }} onClick={() => toggleSelecionado(p.parcela_id)}>
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selecionados.has(p.parcela_id)} onChange={() => toggleSelecionado(p.parcela_id)} />
                        </td>
                        <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--cor-primaria)' }}>#{p.venda_cartao_id}{p.numero_parcela > 1 ? `.${p.numero_parcela}` : ''}</td>
                        <td>{p.conta_banco_desc}</td>
                        <td style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>{p.adquirente}</td>
                        <td style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>{p.bandeira ?? '—'}</td>
                        <td style={{ fontFamily: 'var(--fonte-mono)', fontSize: 11, color: 'var(--texto-secundario)' }}>{p.nsu ?? '—'}</td>
                        <td style={{ fontFamily: 'var(--fonte-mono)', fontSize: 12, color: 'var(--texto-secundario)' }}>{fmtData(p.data_venda)}</td>
                        <td style={{ fontFamily: 'var(--fonte-mono)', fontSize: 12, color: 'var(--texto-secundario)' }}>{fmtData(p.data_prevista)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)' }}>{fmtValor(p.valor)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600 }}>{fmtValor(p.valor_liquido)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 14, alignItems: 'center', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 12, color: selecionadosInfo.qtd > 0 ? 'var(--cor-sucesso)' : 'var(--texto-terciario)' }}>
                {selecionadosInfo.qtd > 0
                  ? `${selecionadosInfo.qtd} venda(s) selecionada(s) — ${fmtValor(selecionadosInfo.valor)}`
                  : 'Nenhuma venda selecionada'}
              </div>
              <button className="btn-ghost" onClick={() => { setFiltro(FILTRO_VAZIO); setPendentes([]); setSelecionados(new Set()) }} disabled={gerando}>Limpar filtros</button>
              <button className="btn-primary" onClick={gerarFaturas} disabled={gerando || pendentesLoading || selecionadosInfo.qtd === 0}>
                <RefreshCw size={15} className={gerando ? 'spin' : ''} /> {gerando ? 'Gerando...' : 'Gerar Fatura'}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <select className="input-field" value={status} onChange={e => setStatus(e.target.value)} style={{ width: 180 }}>
            <option value="">Todos os status</option>
            <option value="ABERTA">Aberta</option>
            <option value="CONFIRMADA">Confirmada</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>ID</th>
                  <th style={{ width: 130 }}>Conta</th>
                  <th style={{ width: 130 }}>Adquirente</th>
                  <th style={{ width: 150 }}>NSU</th>
                  <th style={{ width: 130 }}>Data Emissão</th>
                  <th style={{ width: 110 }}>Data Prevista</th>
                  <th style={{ width: 90, textAlign: 'center' }}>Parcelas</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Previsto</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Cobrado</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                  <th style={{ width: 110, textAlign: 'center' }}>Lançamento</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={11} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)' }}>Carregando...</td></tr>}
                {!loading && dados.length === 0 && <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>Nenhuma fatura gerada ainda</td></tr>}
                {!loading && dados.map(f => (
                  <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/financeiro/cartao-faturas/${f.id}`)}>
                    <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)' }}>{f.id}</td>
                    <td style={{ fontWeight: 500 }}>{f.conta_banco_desc}</td>
                    <td style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>{f.adquirente}</td>
                    <td style={{ fontFamily: 'var(--fonte-mono)', fontSize: 11, color: 'var(--texto-secundario)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.nsus ?? undefined}>{f.nsus || '—'}</td>
                    <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)', fontSize: 12 }}>{fmtEmissao(f.data_emissao_inicio, f.data_emissao_fim)}</td>
                    <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>{fmtData(f.data_prevista)}</td>
                    <td style={{ textAlign: 'center' }}>{f.qtd_parcelas}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)' }}>{fmtValor(f.valor_previsto)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600 }}>{fmtValor(f.valor_cobrado)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COR[f.status] }}>{f.status}</span>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 11, color: f.movimento_banco_id ? 'var(--cor-sucesso)' : 'var(--texto-terciario)' }}>
                      {f.movimento_banco_id ? `Banco #${f.movimento_banco_id}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 0 && (
            <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--borda-suave)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--texto-terciario)' }}>
              <span>{inicio}–{fim} de {total} registros</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost" style={{ padding: '4px 8px' }}><ChevronLeft size={14} /></button>
                <span style={{ padding: '4px 10px' }}>{page} / {pages}</span>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-ghost" style={{ padding: '4px 8px' }}><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
