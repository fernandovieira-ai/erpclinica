'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, PowerOff } from 'lucide-react'
import type { ContaBancoListItem, ContaBancoListResponse } from '@/types/cadastros.types'

export default function ContasBancoPage() {
  const router = useRouter()
  const [dados,   setDados]   = useState<ContaBancoListItem[]>([])
  const [total,   setTotal]   = useState(0)
  const [pages,   setPages]   = useState(1)
  const [loading, setLoading] = useState(false)
  const [busca,   setBusca]   = useState('')
  const [ativo,   setAtivo]   = useState('true')
  const [page,    setPage]    = useState(1)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp  = new URLSearchParams({ busca, ativo, page: String(page), limit: '20' })
      const res = await fetch(`/api/cadastro/contas-banco?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar'); return }
      const data: ContaBancoListResponse = await res.json()
      setDados(data.dados)
      setTotal(data.total)
      setPages(data.pages)
    } finally {
      setLoading(false)
    }
  }, [busca, ativo, page])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setPage(1) }, [busca, ativo])

  async function toggleAtivo(c: ContaBancoListItem) {
    const acao = c.ativo ? 'desativar' : 'reativar'
    if (!confirm(`Deseja ${acao} a conta "${c.mnemonico}"?`)) return
    const res = await fetch(`/api/cadastro/contas-banco/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !c.ativo }),
    })
    if (res.ok) { toast.success(`Conta ${c.ativo ? 'desativada' : 'reativada'}!`); carregar() }
    else toast.error('Erro ao alterar status')
  }

  const inicio = (page - 1) * 20 + 1
  const fim    = Math.min(page * 20, total)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Contas Bancárias</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            Contas bancárias da empresa
          </div>
        </div>
        <button className="btn-primary" onClick={() => router.push('/cadastro/contas-banco/novo')}>
          <Plus size={15} />
          Nova Conta
        </button>
      </div>

      <div className="page-body">

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input
              className="input-field"
              placeholder="Buscar por mnemônico, banco ou conta..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>

          <select
            className="input-field"
            value={ativo}
            onChange={e => setAtivo(e.target.value)}
            style={{ width: 120 }}
          >
            <option value="true">Ativas</option>
            <option value="false">Inativas</option>
            <option value="all">Todas</option>
          </select>
        </div>

        {/* Tabela */}
        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Mnemônico</th>
                  <th>Banco</th>
                  <th>Agência</th>
                  <th>Conta</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Saldo Atual</th>
                  <th>Status</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--texto-terciario)' }}>
                      Carregando...
                    </td>
                  </tr>
                )}

                {!loading && dados.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>
                      Nenhuma conta bancária encontrada
                    </td>
                  </tr>
                )}

                {!loading && dados.map(c => (
                  <tr key={c.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--fonte-mono)', fontWeight: 600 }}>{c.mnemonico}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{c.banco_nome || '—'}</div>
                      {c.banco_codigo && (
                        <div style={{ fontSize: 11, color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)' }}>
                          COMPE {c.banco_codigo}
                        </div>
                      )}
                    </td>
                    <td style={{ fontFamily: 'var(--fonte-mono)', fontSize: 12 }}>
                      {c.agencia || '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--fonte-mono)', fontSize: 12 }}>
                      {c.conta || '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {c.tipo === 'C' ? 'Corrente' : 'Poupança'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontSize: 12 }}>
                      {parseFloat(c.saldo_atual).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td>
                      <span className={`badge-status ${c.ativo ? 'badge-pago' : 'badge-cancelado'}`}>
                        {c.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => router.push(`/cadastro/contas-banco/${c.id}`)}
                          className="btn-ghost"
                          title="Editar"
                          style={{ padding: '5px 8px' }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => toggleAtivo(c)}
                          className="btn-ghost"
                          title={c.ativo ? 'Desativar' : 'Reativar'}
                          style={{ padding: '5px 8px', color: c.ativo ? 'var(--cor-erro)' : 'var(--cor-sucesso)' }}
                        >
                          <PowerOff size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 0 && (
            <div style={{
              padding: '12px 16px',
              borderTop: '0.5px solid var(--borda-suave)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 12, color: 'var(--texto-terciario)',
            }}>
              <span>{inicio}–{fim} de {total} registros</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost" style={{ padding: '4px 8px' }}>
                  <ChevronLeft size={14} />
                </button>
                <span style={{ padding: '4px 10px', fontSize: 12 }}>{page} / {pages}</span>
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-ghost" style={{ padding: '4px 8px' }}>
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
