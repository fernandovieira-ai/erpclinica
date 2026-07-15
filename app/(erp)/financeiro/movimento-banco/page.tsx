'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import type { MovimentoBancoListItem, MovimentoBancoListResponse, ContaBancoListItem } from '@/types/cadastros.types'

const TIPO_LABEL: Record<string, { label: string; cor: string }> = {
  E: { label: 'Entrada', cor: 'var(--cor-sucesso)' },
  S: { label: 'Saída',   cor: 'var(--cor-erro)'    },
}

function fmtValor(v: string | number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: string | null) {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}

const ORIGEM_COR: Record<string, string> = {
  'Tít. Pagar':   'var(--cor-erro)',
  'Tít. Receber': 'var(--cor-sucesso)',
  'Despesa':      '#e07b00',
  'Receita':      'var(--cor-primaria)',
  'Cartão':       'var(--cor-sucesso)',
  'Manual':       'var(--texto-terciario)',
}

function OrigemBadge({ m }: { m: MovimentoBancoListItem }) {
  const tipo = m.origem_tipo ?? 'Manual'
  const cor  = ORIGEM_COR[tipo] ?? 'var(--texto-terciario)'
  return <span style={{ fontSize: 10, fontWeight: 700, color: cor, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{tipo}</span>
}

export default function MovimentoBancoPage() {
  const router = useRouter()
  const [dados,         setDados]         = useState<MovimentoBancoListItem[]>([])
  const [total,         setTotal]         = useState(0)
  const [pages,         setPages]         = useState(1)
  const [loading,       setLoading]       = useState(false)
  const [busca,         setBusca]         = useState('')
  const [tipo,          setTipo]          = useState('')
  const [conciliado,    setConciliado]    = useState('')
  const [contaBancoId,  setContaBancoId]  = useState('')
  const [dataInicio,    setDataInicio]    = useState('')
  const [dataFim,       setDataFim]       = useState('')
  const [page,          setPage]          = useState(1)
  const [contas,        setContas]        = useState<ContaBancoListItem[]>([])

  useEffect(() => {
    fetch('/api/cadastro/contas-banco?ativo=true&limit=200')
      .then(r => r.ok ? r.json() : { dados: [] })
      .then(d => setContas(d.dados ?? []))
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ busca, tipo, conciliado, page: String(page), limit: '50' })
      if (contaBancoId) sp.set('conta_banco_id', contaBancoId)
      if (dataInicio)   sp.set('data_inicio', dataInicio)
      if (dataFim)      sp.set('data_fim',    dataFim)
      const res = await fetch(`/api/financeiro/movimento-banco?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar'); return }
      const data: MovimentoBancoListResponse = await res.json()
      setDados(data.dados); setTotal(data.total); setPages(data.pages)
    } finally { setLoading(false) }
  }, [busca, tipo, conciliado, contaBancoId, dataInicio, dataFim, page])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setPage(1) }, [busca, tipo, conciliado, contaBancoId, dataInicio, dataFim])

  const inicio = (page - 1) * 50 + 1
  const fim    = Math.min(page * 50, total)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Movimento Banco</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>Extrato de movimentações bancárias por conta</div>
        </div>
        <button className="btn-primary" onClick={() => router.push('/financeiro/movimento-banco/novo')}>
          <Plus size={15} /> Novo Movimento
        </button>
      </div>

      <div className="page-body">
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input className="input-field" placeholder="Buscar por documento ou pessoa..." value={busca}
              onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <select className="input-field" value={contaBancoId} onChange={e => setContaBancoId(e.target.value)} style={{ width: 180 }}>
            <option value="">Todas as Contas</option>
            {contas.map(c => (
              <option key={c.id} value={String(c.id)}>{c.mnemonico}</option>
            ))}
          </select>
          <select className="input-field" value={tipo} onChange={e => setTipo(e.target.value)} style={{ width: 120 }}>
            <option value="">E/S</option>
            <option value="E">Entrada</option>
            <option value="S">Saída</option>
          </select>
          <select className="input-field" value={conciliado} onChange={e => setConciliado(e.target.value)} style={{ width: 140 }}>
            <option value="">Conciliação</option>
            <option value="false">Não Conciliado</option>
            <option value="true">Conciliado</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Data de:</label>
            <input type="date" className="input-field" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={{ width: 140 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>até:</label>
            <input type="date" className="input-field" value={dataFim} onChange={e => setDataFim(e.target.value)} style={{ width: 140 }} />
          </div>
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th style={{ width: 60  }}>ID</th>
                  <th style={{ width: 140 }}>Conta</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Tipo</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Valor</th>
                  <th style={{ width: 100 }}>Data</th>
                  <th style={{ width: 120 }}>Documento</th>
                  <th>Pessoa</th>
                  <th>Descrição</th>
                  <th style={{ width: 110 }}>Origem</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Conciliado</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Carregando...</td></tr>
                )}
                {!loading && dados.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Nenhum movimento encontrado</td></tr>
                )}
                {dados.map(m => {
                  const tp = TIPO_LABEL[m.tipo] ?? { label: m.tipo, cor: 'inherit' }
                  return (
                    <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/financeiro/movimento-banco/${m.id}`)}>
                      <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)' }}>{m.id}</td>
                      <td style={{ fontWeight: 500 }}>{m.conta_banco_desc ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: tp.cor }}>{tp.label}</span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600, color: m.tipo === 'E' ? 'var(--cor-sucesso)' : 'var(--cor-erro)' }}>
                        {m.tipo === 'S' ? '–' : '+'}{fmtValor(m.valor)}
                      </td>
                      <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>{fmtData(m.data_movimento)}</td>
                      <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>{m.documento ?? '—'}</td>
                      <td style={{ color: 'var(--texto-secundario)' }}>{m.pessoa_nome ?? '—'}</td>
                      <td style={{ color: 'var(--texto-secundario)', fontSize: 12 }}>{m.origem_desc ?? m.tipo_operacao_desc ?? '—'}</td>
                      <td><OrigemBadge m={m} /></td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: m.conciliado ? 'var(--cor-sucesso)' : 'var(--texto-terciario)' }}>
                          {m.conciliado ? 'Sim' : 'Não'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--borda-suave)', fontSize: 12, color: 'var(--texto-secundario)' }}>
              <span>{inicio}–{fim} de {total} movimentos</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ padding: '3px 8px', border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, display: 'flex', alignItems: 'center' }}>
                  <ChevronLeft size={14} />
                </button>
                <span style={{ padding: '3px 8px', lineHeight: '20px' }}>Pág. {page} / {pages}</span>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                  style={{ padding: '3px 8px', border: '1px solid var(--borda-media)', borderRadius: 3, background: 'none', cursor: page === pages ? 'default' : 'pointer', opacity: page === pages ? 0.4 : 1, display: 'flex', alignItems: 'center' }}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
