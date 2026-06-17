'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReceitaListItem, ReceitaListResponse } from '@/types/cadastros.types'

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  A: { label: 'Aprovada', cor: 'var(--cor-sucesso)'      },
  P: { label: 'Pendente', cor: 'var(--cor-aviso)'        },
  C: { label: 'Cancelado', cor: 'var(--texto-terciario)' },
}

function fmtValor(v: string | number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: string) {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}

export default function ReceitasPage() {
  const router = useRouter()
  const [dados,       setDados]       = useState<ReceitaListItem[]>([])
  const [total,       setTotal]       = useState(0)
  const [pages,       setPages]       = useState(1)
  const [loading,     setLoading]     = useState(false)
  const [busca,       setBusca]       = useState('')
  const [status,      setStatus]      = useState('')
  const [dataInicio,  setDataInicio]  = useState('')
  const [dataFim,     setDataFim]     = useState('')
  const [page,        setPage]        = useState(1)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ busca, status, page: String(page), limit: '50' })
      if (dataInicio) sp.set('data_inicio', dataInicio)
      if (dataFim)    sp.set('data_fim',    dataFim)
      const res = await fetch(`/api/financeiro/receitas?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar'); return }
      const data: ReceitaListResponse = await res.json()
      setDados(data.dados); setTotal(data.total); setPages(data.pages)
    } finally { setLoading(false) }
  }, [busca, status, dataInicio, dataFim, page])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setPage(1) }, [busca, status, dataInicio, dataFim])

  const inicio = (page - 1) * 50 + 1
  const fim    = Math.min(page * 50, total)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Receitas</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>Lançamento de receitas operacionais</div>
        </div>
        <button className="btn-primary" onClick={() => router.push('/financeiro/receitas/novo')}>
          <Plus size={15} /> Nova Receita
        </button>
      </div>

      <div className="page-body">
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input className="input-field" placeholder="Buscar por documento ou pessoa..." value={busca}
              onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <select className="input-field" value={status} onChange={e => setStatus(e.target.value)} style={{ width: 130 }}>
            <option value="">Todos Status</option>
            <option value="A">Aprovada</option>
            <option value="P">Pendente</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>De:</label>
            <input type="date" className="input-field" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={{ width: 140 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Até:</label>
            <input type="date" className="input-field" value={dataFim} onChange={e => setDataFim(e.target.value)} style={{ width: 140 }} />
          </div>
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th style={{ width: 60  }}>ID</th>
                  <th style={{ width: 100 }}>Data</th>
                  <th style={{ width: 120 }}>Documento</th>
                  <th>Pessoa</th>
                  <th>Tipo de Receita</th>
                  <th style={{ width: 130 }}>Tipo Cobr.</th>
                  <th style={{ width: 120, textAlign: 'right' }}>Valor</th>
                  <th style={{ width: 70,  textAlign: 'center' }}>Parc.</th>
                  <th style={{ width: 90,  textAlign: 'center' }}>Status</th>
                  <th style={{ width: 40  }} />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Carregando...</td></tr>
                )}
                {!loading && dados.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Nenhuma receita encontrada</td></tr>
                )}
                {dados.map(r => {
                  const st = STATUS_LABEL[r.status] ?? { label: r.status, cor: 'inherit' }
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/financeiro/receitas/${r.id}`)}>
                      <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)' }}>{r.id}</td>
                      <td style={{ fontFamily: 'var(--fonte-mono)' }}>{fmtData(r.data_receita)}</td>
                      <td style={{ fontFamily: 'var(--fonte-mono)' }}>{r.documento || '—'}</td>
                      <td>{r.pessoa_nome || '—'}</td>
                      <td style={{ color: 'var(--texto-secundario)' }}>{r.tipo_receita_desc || '—'}</td>
                      <td style={{ color: 'var(--texto-secundario)' }}>{r.tipo_cobranca_desc || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600 }}>{fmtValor(r.valor)}</td>
                      <td style={{ textAlign: 'center', color: 'var(--texto-terciario)' }}>{r.num_parcelas}x</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: st.cor, padding: '2px 6px', borderRadius: 10, border: `1px solid ${st.cor}` }}>{st.label}</span>
                      </td>
                      <td />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid var(--borda-suave)', fontSize: 12, color: 'var(--texto-terciario)' }}>
              <span>Exibindo {inicio}–{fim} de {total}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="btn-icon" style={{ padding: '3px 8px', fontSize: 12 }}><ChevronLeft size={14} /></button>
                <span style={{ padding: '3px 8px' }}>Pág. {page}/{pages}</span>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                  className="btn-icon" style={{ padding: '3px 8px', fontSize: 12 }}><ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
