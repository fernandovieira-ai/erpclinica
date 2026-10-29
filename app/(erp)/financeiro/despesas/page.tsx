'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, ChevronLeft, ChevronRight, BarChart3, ExternalLink, Copy } from 'lucide-react'
import type { DespesaListItem, DespesaListResponse, Despesa } from '@/types/cadastros.types'
import ReplicarDespesaModal from '@/components/financeiro/ReplicarDespesaModal'

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

export default function DespesasPage() {
  const router = useRouter()
  const [dados,       setDados]       = useState<DespesaListItem[]>([])
  const [total,       setTotal]       = useState(0)
  const [pages,       setPages]       = useState(1)
  const [loading,     setLoading]     = useState(false)
  const [busca,       setBusca]       = useState('')
  const [status,      setStatus]      = useState('')
  const [dataInicio,  setDataInicio]  = useState('')
  const [dataFim,     setDataFim]     = useState('')
  const [page,        setPage]        = useState(1)
  const [menu,         setMenu]         = useState<{ x: number; y: number; despesa: DespesaListItem } | null>(null)
  const [replicando,   setReplicando]   = useState<Despesa | null>(null)
  const [replicandoId, setReplicandoId] = useState<number | null>(null)
  const [carregandoReplica, setCarregandoReplica] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({ busca, status, page: String(page), limit: '50' })
      if (dataInicio) sp.set('data_inicio', dataInicio)
      if (dataFim)    sp.set('data_fim',    dataFim)
      const res = await fetch(`/api/financeiro/despesas?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar'); return }
      const data: DespesaListResponse = await res.json()
      setDados(data.dados); setTotal(data.total); setPages(data.pages)
    } finally { setLoading(false) }
  }, [busca, status, dataInicio, dataFim, page])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setPage(1) }, [busca, status, dataInicio, dataFim])

  // Fecha o menu de contexto ao clicar fora, rolar ou apertar Esc
  useEffect(() => {
    if (!menu) return
    const fechar = () => setMenu(null)
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('click', fechar)
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('click', fechar)
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  async function abrirReplicar(d: DespesaListItem) {
    setMenu(null)
    setReplicandoId(d.id)
    setCarregandoReplica(true)
    try {
      const res = await fetch(`/api/financeiro/despesas/${d.id}`)
      if (!res.ok) { toast.error('Erro ao carregar despesa'); setReplicandoId(null); return }
      const data: Despesa = await res.json()
      setReplicando(data)
    } catch {
      toast.error('Erro ao carregar despesa — verifique sua conexão e tente novamente.')
      setReplicandoId(null)
    } finally { setCarregandoReplica(false) }
  }

  const inicio = (page - 1) * 50 + 1
  const fim    = Math.min(page * 50, total)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Despesas</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>Lançamento de despesas operacionais</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => router.push('/financeiro/despesas/relatorio-tipo')}>
            <BarChart3 size={15} /> Relatório por Tipo
          </button>
          <button className="btn-primary" onClick={() => router.push('/financeiro/despesas/novo')}>
            <Plus size={15} /> Nova Despesa
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input className="input-field" placeholder="Buscar por documento, pessoa ou tipo de despesa..." value={busca}
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
                  <th>Favorecido</th>
                  <th>Tipo de Despesa</th>
                  <th style={{ width: 130 }}>Tipo Cobr.</th>
                  <th style={{ width: 120, textAlign: 'right' }}>Valor</th>
                  <th style={{ width: 70,  textAlign: 'center' }}>Parc.</th>
                  <th style={{ width: 90,  textAlign: 'center' }}>Status</th>
                  <th style={{ width: 90  }} />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Carregando...</td></tr>
                )}
                {!loading && dados.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>Nenhuma despesa encontrada</td></tr>
                )}
                {dados.map(d => {
                  const st = STATUS_LABEL[d.status] ?? { label: d.status, cor: 'inherit' }
                  const emReplicacao = d.id === replicandoId
                  return (
                    <tr key={d.id} style={{ cursor: 'pointer', backgroundColor: emReplicacao ? 'var(--cor-primaria)18' : undefined, outline: emReplicacao ? '1px solid var(--cor-primaria)' : undefined, outlineOffset: -1 }}
                      onClick={() => router.push(`/financeiro/despesas/${d.id}`)}
                      onContextMenu={e => {
                        e.preventDefault()
                        const MENU_W = 190, MENU_H = 84
                        const x = Math.min(e.clientX, window.innerWidth  - MENU_W - 8)
                        const y = Math.min(e.clientY, window.innerHeight - MENU_H - 8)
                        setMenu({ x: Math.max(8, x), y: Math.max(8, y), despesa: d })
                      }}>
                      <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)' }}>{d.id}</td>
                      <td style={{ fontFamily: 'var(--fonte-mono)' }}>{fmtData(d.data_despesa)}</td>
                      <td style={{ fontFamily: 'var(--fonte-mono)' }}>{d.documento || '—'}</td>
                      <td>{d.pessoa_nome || '—'}</td>
                      <td style={{ color: 'var(--texto-secundario)' }}>{d.tipo_despesa_desc || '—'}</td>
                      <td style={{ color: 'var(--texto-secundario)' }}>{d.tipo_cobranca_desc || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600 }}>{fmtValor(d.valor)}</td>
                      <td style={{ textAlign: 'center', color: 'var(--texto-terciario)' }}>{d.num_parcelas}x</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: st.cor, padding: '2px 6px', borderRadius: 10, border: `1px solid ${st.cor}` }}>{st.label}</span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--cor-primaria)', fontWeight: 600, whiteSpace: 'nowrap' }}>{emReplicacao ? 'Replicando...' : ''}</td>
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

      {menu && (() => {
        const podeReplicar = (menu.despesa.destino === 'B' || menu.despesa.destino === 'C') && menu.despesa.status !== 'C'
        return (
          <div
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.preventDefault()}
            style={{
              position: 'fixed', top: menu.y, left: menu.x, zIndex: 200,
              backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda-media)', borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)', minWidth: 190, overflow: 'hidden', fontSize: 12,
            }}>
            <button type="button" onClick={() => { setMenu(null); router.push(`/financeiro/despesas/${menu.despesa.id}`) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-principal)', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <ExternalLink size={13} /> Abrir
            </button>
            <button type="button" disabled={!podeReplicar || carregandoReplica}
              title={podeReplicar ? undefined : (menu.despesa.status === 'C' ? 'Despesa cancelada não pode ser replicada' : 'Só disponível para despesas com pagamento em Caixa ou Banco')}
              onClick={() => podeReplicar && abrirReplicar(menu.despesa)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderTop: '1px solid var(--borda-suave)', cursor: podeReplicar ? 'pointer' : 'not-allowed', color: podeReplicar ? 'var(--texto-principal)' : 'var(--texto-terciario)', textAlign: 'left', opacity: podeReplicar ? 1 : 0.6 }}
              onMouseEnter={e => { if (podeReplicar) e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <Copy size={13} /> {carregandoReplica ? 'Carregando...' : 'Replicar'}
            </button>
          </div>
        )
      })()}

      {replicando && (
        <ReplicarDespesaModal
          despesa={replicando}
          onClose={() => { setReplicando(null); setReplicandoId(null) }}
          onReplicado={() => { setReplicando(null); setReplicandoId(null); carregar() }}
        />
      )}
    </>
  )
}
