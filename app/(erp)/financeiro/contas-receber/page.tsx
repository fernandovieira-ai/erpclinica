'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import type { TituloReceberListItem, TituloReceberListResponse } from '@/types/cadastros.types'

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  A: { label: 'Aberto',    cor: 'var(--cor-aviso)'        },
  L: { label: 'Liquidado', cor: 'var(--cor-sucesso)'      },
  C: { label: 'Cancelado', cor: 'var(--texto-terciario)'  },
}

function fmtValor(v: string | number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: string | null) {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}

export default function TitulosReceberPage() {
  const router = useRouter()
  const [dados,      setDados]      = useState<TituloReceberListItem[]>([])
  const [total,      setTotal]      = useState(0)
  const [pages,      setPages]      = useState(1)
  const [loading,    setLoading]    = useState(false)
  const [busca,      setBusca]      = useState('')
  const [status,     setStatus]     = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim,    setDataFim]    = useState('')
  const [page,       setPage]       = useState(1)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ busca, status, page: String(page), limit: '50' })
      if (dataInicio) sp.set('data_inicio', dataInicio)
      if (dataFim)    sp.set('data_fim',    dataFim)
      const res = await fetch(`/api/financeiro/titulos-receber?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar'); return }
      const data: TituloReceberListResponse = await res.json()
      setDados(data.dados); setTotal(data.total); setPages(data.pages)
    } finally { setLoading(false) }
  }, [busca, status, dataInicio, dataFim, page])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setPage(1) }, [busca, status, dataInicio, dataFim])

  function abrirTitulo(t: TituloReceberListItem) {
    router.push(`/financeiro/contas-receber/${t.id}`)
  }

  const inicio = (page - 1) * 50 + 1
  const fim    = Math.min(page * 50, total)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Títulos a Receber</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>Controle de contas e títulos a receber</div>
        </div>
        <button className="btn-primary" onClick={() => router.push('/financeiro/contas-receber/novo')}>
          <Plus size={15} /> Novo Título
        </button>
      </div>

      <div className="page-body">
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input className="input-field" placeholder="Buscar por título, documento ou pessoa..." value={busca}
              onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <select className="input-field" value={status} onChange={e => setStatus(e.target.value)} style={{ width: 140 }}>
            <option value="">Todos Status</option>
            <option value="A">Aberto</option>
            <option value="L">Liquidado</option>
            <option value="C">Cancelado</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Venc. de:</label>
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
                  <th style={{ width: 100 }}>Nº Título</th>
                  <th style={{ width: 120 }}>Documento</th>
                  <th>Pessoa / Cliente</th>
                  <th>Tipo de Receita</th>
                  <th>Centro de Custo</th>
                  <th>Tipo de Cobrança</th>
                  <th style={{ width: 100 }}>Emissão</th>
                  <th style={{ width: 100 }}>Vencimento</th>
                  <th style={{ width: 100 }}>Recebimento</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Valor Original</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Valor Recebido</th>
                  <th style={{ width: 90,  textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={13} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Carregando...</td></tr>
                )}
                {!loading && dados.length === 0 && (
                  <tr><td colSpan={13} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Nenhum título encontrado</td></tr>
                )}
                {dados.map(t => {
                  const st = STATUS_LABEL[t.status] ?? { label: t.status, cor: 'inherit' }
                  return (
                    <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => abrirTitulo(t)}>
                      <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)' }}>{t.id}</td>
                      <td style={{ fontFamily: 'var(--fonte-mono)' }}>{t.numero_titulo || '—'}</td>
                      <td style={{ fontFamily: 'var(--fonte-mono)' }}>{t.num_documento || '—'}</td>
                      <td style={{ fontWeight: 500 }}>{t.pessoa_nome || '—'}</td>
                      <td style={{ color: 'var(--texto-secundario)' }}>{t.tipo_receita_desc || '—'}</td>
                      <td style={{ color: 'var(--texto-secundario)' }}>{t.centro_custo_desc || '—'}</td>
                      <td style={{ color: 'var(--texto-secundario)' }}>{t.tipo_cobranca_desc || '—'}</td>
                      <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>{fmtData(t.data_emissao)}</td>
                      <td style={{ fontFamily: 'var(--fonte-mono)' }}>{fmtData(t.data_vencimento)}</td>
                      <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>{fmtData(t.data_liquidacao)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 500 }}>{fmtValor(t.valor_original)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>{fmtValor(t.valor_liquidado)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: st.cor }}>{st.label}</span>
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
              <span>{inicio}–{fim} de {total} títulos</span>
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
