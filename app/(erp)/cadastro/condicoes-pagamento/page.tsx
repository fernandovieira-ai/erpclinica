'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, PowerOff } from 'lucide-react'
import type { CondicaoPagamentoListItem, CondicaoPagamentoListResponse } from '@/types/cadastros.types'

const TIPO_LABEL: Record<string, string> = { V: 'À Vista', P: 'A Prazo' }

export default function CondicoesPagamentoPage() {
  const router = useRouter()
  const [dados,   setDados]   = useState<CondicaoPagamentoListItem[]>([])
  const [total,   setTotal]   = useState(0)
  const [pages,   setPages]   = useState(1)
  const [loading, setLoading] = useState(false)
  const [busca,   setBusca]   = useState('')
  const [ativo,   setAtivo]   = useState('true')
  const [page,    setPage]    = useState(1)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp  = new URLSearchParams({ busca, ativo, page: String(page), limit: '50' })
      const res = await fetch(`/api/cadastro/condicoes-pagamento?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar'); return }
      const data: CondicaoPagamentoListResponse = await res.json()
      setDados(data.dados); setTotal(data.total); setPages(data.pages)
    } finally { setLoading(false) }
  }, [busca, ativo, page])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setPage(1) }, [busca, ativo])

  async function toggleAtivo(c: CondicaoPagamentoListItem) {
    if (!confirm(`${c.ativo ? 'Desativar' : 'Reativar'} "${c.descricao}"?`)) return
    const res = await fetch(`/api/cadastro/condicoes-pagamento/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !c.ativo }),
    })
    if (res.ok) { toast.success(`Condição ${c.ativo ? 'desativada' : 'reativada'}!`); carregar() }
    else toast.error('Erro ao alterar status')
  }

  const inicio = (page - 1) * 50 + 1
  const fim    = Math.min(page * 50, total)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Condições de Pagamento</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>Cadastro de condições de pagamento</div>
        </div>
        <button className="btn-primary" onClick={() => router.push('/cadastro/condicoes-pagamento/novo')}>
          <Plus size={15} /> Nova Condição
        </button>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input className="input-field" placeholder="Buscar por descrição..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <select className="input-field" value={ativo} onChange={e => setAtivo(e.target.value)} style={{ width: 120 }}>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
            <option value="all">Todos</option>
          </select>
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>ID</th>
                  <th>Descrição</th>
                  <th style={{ width: 100 }}>Tipo</th>
                  <th style={{ width: 90 }}>Parcelas</th>
                  <th style={{ width: 110 }}>Intervalo (dias)</th>
                  <th style={{ width: 100 }}>Entrada (%)</th>
                  <th style={{ width: 80 }}>Status</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--texto-terciario)' }}>Carregando...</td></tr>}
                {!loading && dados.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>Nenhuma condição de pagamento encontrada</td></tr>}
                {!loading && dados.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)', fontSize: 12 }}>{c.id}</td>
                    <td style={{ fontWeight: 500 }}>{c.descricao}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 3, background: c.tipo === 'V' ? 'var(--cor-sucesso)20' : 'var(--cor-primaria)20', color: c.tipo === 'V' ? 'var(--cor-sucesso)' : 'var(--cor-primaria)', fontWeight: 600 }}>
                        {TIPO_LABEL[c.tipo] ?? c.tipo}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, textAlign: 'center' }}>{c.num_parcelas}x</td>
                    <td style={{ fontSize: 12, textAlign: 'center', color: 'var(--texto-secundario)' }}>{c.tipo === 'V' ? '—' : `${c.intervalo_dias}d`}</td>
                    <td style={{ fontSize: 12, textAlign: 'center', color: 'var(--texto-secundario)' }}>
                      {Number(c.entrada_pct) > 0 ? `${Number(c.entrada_pct).toFixed(2)}%` : '—'}
                    </td>
                    <td><span className={`badge-status ${c.ativo ? 'badge-pago' : 'badge-cancelado'}`}>{c.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button onClick={() => router.push(`/cadastro/condicoes-pagamento/${c.id}`)} className="btn-ghost" title="Editar" style={{ padding: '5px 8px' }}><Pencil size={13} /></button>
                        <button onClick={() => toggleAtivo(c)} className="btn-ghost" title={c.ativo ? 'Desativar' : 'Reativar'} style={{ padding: '5px 8px', color: c.ativo ? 'var(--cor-erro)' : 'var(--cor-sucesso)' }}><PowerOff size={13} /></button>
                      </div>
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
