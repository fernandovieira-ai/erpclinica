'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, PowerOff } from 'lucide-react'
import type { TipoDespesaListItem, TipoDespesaListResponse } from '@/types/cadastros.types'

const NATUREZA_LABEL: Record<string, string> = { A: 'Administrativa', F: 'Financeira', I: 'Imposto' }

export default function TiposDespesaPage() {
  const router = useRouter()
  const [dados,   setDados]   = useState<TipoDespesaListItem[]>([])
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
      const res = await fetch(`/api/cadastro/tipos-despesa?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar'); return }
      const data: TipoDespesaListResponse = await res.json()
      setDados(data.dados); setTotal(data.total); setPages(data.pages)
    } finally { setLoading(false) }
  }, [busca, ativo, page])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setPage(1) }, [busca, ativo])

  async function toggleAtivo(t: TipoDespesaListItem) {
    if (!confirm(`${t.ativo ? 'Desativar' : 'Reativar'} "${t.descricao}"?`)) return
    const res = await fetch(`/api/cadastro/tipos-despesa/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !t.ativo }),
    })
    if (res.ok) { toast.success(`Tipo ${t.ativo ? 'desativado' : 'reativado'}!`); carregar() }
    else toast.error('Erro ao alterar status')
  }

  const inicio = (page - 1) * 50 + 1
  const fim    = Math.min(page * 50, total)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tipos de Despesa</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>Classificação de despesas</div>
        </div>
        <button className="btn-primary" onClick={() => router.push('/cadastro/tipos-despesa/novo')}>
          <Plus size={15} /> Novo Tipo
        </button>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input className="input-field" placeholder="Buscar por código ou descrição..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 32 }} />
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
                  <th style={{ width: 100 }}>Código</th>
                  <th>Descrição</th>
                  <th style={{ width: 110 }}>Natureza</th>
                  <th>Conta Contábil</th>
                  <th style={{ width: 90 }}>Tipo Pai</th>
                  <th style={{ width: 80 }}>Flags</th>
                  <th style={{ width: 80 }}>Status</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--texto-terciario)' }}>Carregando...</td></tr>}
                {!loading && dados.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>Nenhum tipo de despesa encontrado</td></tr>}
                {!loading && dados.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'var(--fonte-mono)', fontWeight: 600 }}>{t.codigo}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{t.descricao}</div>
                      {t.ind_imposto && t.tipo_imposto && <div style={{ fontSize: 10, color: 'var(--texto-terciario)' }}>{t.tipo_imposto}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{NATUREZA_LABEL[t.natureza] ?? t.natureza}</td>
                    <td style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>{t.conta_desc ?? '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>{t.pai_desc ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {t.ind_pis_cofins && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#7C3AED20', color: '#7C3AED', fontWeight: 600 }}>PIS/COF</span>}
                        {t.ind_imposto    && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--cor-aviso)20', color: 'var(--cor-aviso)', fontWeight: 600 }}>IMPTO</span>}
                        {t.ind_capex      && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--cor-info)20', color: 'var(--cor-info)', fontWeight: 600 }}>CAPEX</span>}
                      </div>
                    </td>
                    <td><span className={`badge-status ${t.ativo ? 'badge-pago' : 'badge-cancelado'}`}>{t.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button onClick={() => router.push(`/cadastro/tipos-despesa/${t.id}`)} className="btn-ghost" title="Editar" style={{ padding: '5px 8px' }}><Pencil size={13} /></button>
                        <button onClick={() => toggleAtivo(t)} className="btn-ghost" title={t.ativo ? 'Desativar' : 'Reativar'} style={{ padding: '5px 8px', color: t.ativo ? 'var(--cor-erro)' : 'var(--cor-sucesso)' }}><PowerOff size={13} /></button>
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
