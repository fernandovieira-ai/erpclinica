'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, PowerOff } from 'lucide-react'
import type { EmpresaListItem, EmpresaListResponse } from '@/types/cadastros.types'

export default function EmpresasPage() {
  const router = useRouter()
  const [dados,   setDados]   = useState<EmpresaListItem[]>([])
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
      const res = await fetch(`/api/cadastro/empresas?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar'); return }
      const data: EmpresaListResponse = await res.json()
      setDados(data.dados)
      setTotal(data.total)
      setPages(data.pages)
    } finally {
      setLoading(false)
    }
  }, [busca, ativo, page])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setPage(1) }, [busca, ativo])

  async function toggleAtivo(e: EmpresaListItem) {
    const acao = e.ativo ? 'desativar' : 'reativar'
    if (!confirm(`Deseja ${acao} "${e.razao_social}"?`)) return
    const res = await fetch(`/api/cadastro/empresas/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !e.ativo }),
    })
    if (res.ok) { toast.success(`Empresa ${e.ativo ? 'desativada' : 'reativada'}!`); carregar() }
    else toast.error('Erro ao alterar status')
  }

  const inicio = (page - 1) * 20 + 1
  const fim    = Math.min(page * 20, total)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Empresas</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            Cadastro de empresas do sistema
          </div>
        </div>
        <button className="btn-primary" onClick={() => router.push('/configuracoes/empresas/novo')}>
          <Plus size={15} />
          Nova Empresa
        </button>
      </div>

      <div className="page-body">

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input
              className="input-field"
              placeholder="Buscar por razão social ou CNPJ..."
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
                  <th>Razão Social</th>
                  <th>CNPJ</th>
                  <th>Cidade / UF</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--texto-terciario)' }}>
                      Carregando...
                    </td>
                  </tr>
                )}

                {!loading && dados.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>
                      Nenhuma empresa encontrada
                    </td>
                  </tr>
                )}

                {!loading && dados.map(e => (
                  <tr key={e.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{e.razao_social}</div>
                      {e.nome_fantasia && (
                        <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>{e.nome_fantasia}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--fonte-mono)', fontSize: 12 }}>
                        {e.cnpj || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>
                      {e.cidade ? `${e.cidade}${e.uf ? ` / ${e.uf}` : ''}` : '—'}
                    </td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--fonte-mono)' }}>
                      {e.telefone || '—'}
                    </td>
                    <td>
                      <span className={`badge-status ${e.ativo ? 'badge-pago' : 'badge-cancelado'}`}>
                        {e.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => router.push(`/configuracoes/empresas/${e.id}`)}
                          className="btn-ghost"
                          title="Editar"
                          style={{ padding: '5px 8px' }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => toggleAtivo(e)}
                          className="btn-ghost"
                          title={e.ativo ? 'Desativar' : 'Reativar'}
                          style={{ padding: '5px 8px', color: e.ativo ? 'var(--cor-erro)' : 'var(--cor-sucesso)' }}
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
