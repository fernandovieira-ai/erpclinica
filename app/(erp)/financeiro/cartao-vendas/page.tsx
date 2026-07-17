'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import type { VendaCartaoListItem, VendaCartaoListResponse } from '@/types/cartao.types'

function fmtValor(v: string | number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDataSimples(d: string | null) {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}

const STATUS_COR: Record<string, string> = {
  PENDENTE:   'var(--cor-aviso)',
  PARCIAL:    'var(--cor-aviso)',
  FATURADA:   'var(--cor-primaria)',
  CONCILIADA: 'var(--cor-sucesso)',
  CANCELADO:  'var(--texto-terciario)',
}
const STATUS_LABEL: Record<string, string> = {
  PENDENTE:   'Pendente',
  PARCIAL:    'Parcial',
  FATURADA:   'Faturada',
  CONCILIADA: 'Conciliada',
  CANCELADO:  'Cancelada',
}

const MODALIDADE_LABEL: Record<string, string> = {
  DEBITO: 'Débito', CREDITO_VISTA: 'Crédito à Vista', CREDITO_PARCELADO: 'Crédito Parcelado',
}

export default function CartaoVendasPage() {
  const router = useRouter()
  const [dados,   setDados]   = useState<VendaCartaoListItem[]>([])
  const [total,   setTotal]   = useState(0)
  const [pages,   setPages]   = useState(1)
  const [loading, setLoading] = useState(false)
  const [busca,   setBusca]   = useState('')
  const [status,  setStatus]  = useState('')
  const [page,    setPage]    = useState(1)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp  = new URLSearchParams({ busca, status, page: String(page), limit: '50' })
      const res = await fetch(`/api/financeiro/cartao/vendas?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar'); return }
      const data: VendaCartaoListResponse = await res.json()
      setDados(data.dados); setTotal(data.total); setPages(data.pages)
    } finally { setLoading(false) }
  }, [busca, status, page])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setPage(1) }, [busca, status])

  const inicio = (page - 1) * 50 + 1
  const fim    = Math.min(page * 50, total)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Vendas no Cartão</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>Gerado automaticamente pelo recebimento de consulta, receita ou baixa de título com condição débito/crédito</div>
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input className="input-field" placeholder="Buscar por NSU ou autorização..." value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <select className="input-field" value={status} onChange={e => setStatus(e.target.value)} style={{ width: 160 }}>
            <option value="">Todos os status</option>
            <option value="PENDENTE">Pendente</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>ID</th>
                  <th style={{ width: 130 }}>Conta</th>
                  <th>Condição</th>
                  <th>Pessoa</th>
                  <th style={{ width: 130 }}>Adquirente</th>
                  <th style={{ width: 130 }}>NSU</th>
                  <th style={{ width: 150 }}>Modalidade</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Parc.</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Valor Bruto</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Taxa</th>
                  <th style={{ width: 130, textAlign: 'right' }}>Valor Líquido</th>
                  <th style={{ width: 150 }}>Data</th>
                  <th style={{ width: 110 }}>Vencimento</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={14} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)' }}>Carregando...</td></tr>}
                {!loading && dados.length === 0 && <tr><td colSpan={14} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>Nenhuma venda no cartão encontrada</td></tr>}
                {!loading && dados.map(v => (
                  <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/financeiro/cartao-vendas/${v.id}`)}>
                    <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-terciario)' }}>{v.id}</td>
                    <td style={{ fontWeight: 500 }}>{v.conta_banco_desc}</td>
                    <td style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>{v.condicao_descricao}</td>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{v.pessoa_nome ?? '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>{v.adquirente} · {v.bandeira}</td>
                    <td style={{ fontFamily: 'var(--fonte-mono)', fontSize: 12, color: 'var(--texto-secundario)' }}>{v.nsu ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{v.modalidade ? MODALIDADE_LABEL[v.modalidade] ?? v.modalidade : '—'}</td>
                    <td style={{ textAlign: 'center' }}>{v.qtd_parcelas}x</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600 }}>{fmtValor(v.valor_bruto)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontSize: 12, color: 'var(--texto-secundario)' }}>{v.percentual_mdr_aplicado ? `${Number(v.percentual_mdr_aplicado).toFixed(2)}%` : '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600, color: 'var(--cor-sucesso)' }}>{fmtValor(v.valor_liquido)}</td>
                    <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)', fontSize: 12 }}>{fmtDataSimples(v.data_venda)}</td>
                    <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)', fontSize: 12 }}>{fmtDataSimples(v.proximo_vencimento)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COR[v.status_parcelas] }}>{STATUS_LABEL[v.status_parcelas] ?? v.status_parcelas}</span>
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
