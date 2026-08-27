'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Search, ChevronLeft, ChevronRight, ShieldAlert, Eye, Filter, X } from 'lucide-react'
import type { LogAuditoriaItem, LogAuditoriaTabela } from '@/types/log-auditoria.types'
import DetalheAuditoriaModal from '@/components/configuracoes/DetalheAuditoriaModal'

const LABEL_TABELA: Record<LogAuditoriaTabela, string> = {
  tab_usuario:              'Usuário',
  tab_agendamento:          'Agendamento',
  tab_despesa:              'Despesa',
  tab_receita:              'Receita',
  tab_titulo_pagar:         'Título a Pagar',
  tab_titulo_receber:       'Título a Receber',
  tab_recebimento_consulta: 'Recebimento',
}

const BADGE_ACAO: Record<string, string> = {
  INSERT: 'badge-pago',
  UPDATE: 'badge-info',
  DELETE: 'badge-vencido',
}

const LABEL_ACAO: Record<string, string> = {
  INSERT: 'Criação',
  UPDATE: 'Edição',
  DELETE: 'Exclusão',
}

interface Filtros {
  busca:      string
  tabela:     string
  acao:       string
  dataInicio: string
  dataFim:    string
}

function isoData(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Padrão inicial e do botão "Limpar": últimos 7 dias — evita que a tela,
// sem nenhum filtro escolhido, tente trazer o histórico inteiro de auditoria
// (tabela só cresce, sem esse limite toda visita bateria o banco sem necessidade).
function filtrosPadrao(): Filtros {
  const hoje = new Date()
  const seteDiasAtras = new Date(hoje)
  seteDiasAtras.setDate(hoje.getDate() - 7)
  return { busca: '', tabela: '', acao: '', dataInicio: isoData(seteDiasAtras), dataFim: isoData(hoje) }
}

export default function LogAuditoriaPage() {
  const [dados,   setDados]   = useState<LogAuditoriaItem[]>([])
  const [total,   setTotal]   = useState(0)
  const [pages,   setPages]   = useState(1)
  const [loading, setLoading] = useState(false)
  const [page,    setPage]    = useState(1)

  // Rascunho: o que o usuário está digitando/selecionando, ainda não aplicado.
  const [rascunho, setRascunho] = useState<Filtros>(filtrosPadrao)
  // Aplicado: o que de fato foi buscado — só muda ao clicar em "Filtrar" (ou "Limpar"),
  // nunca a cada tecla/seleção. É disso que `carregar` depende.
  const [filtros, setFiltros] = useState<Filtros>(rascunho)

  const [meuPerfil,   setMeuPerfil]   = useState<string | null>(null)
  const [detalhe,     setDetalhe]     = useState<LogAuditoriaItem | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      setMeuPerfil(d.perfil ?? null)
    }).catch(() => {})
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp = new URLSearchParams({
        busca: filtros.busca, tabela: filtros.tabela, acao: filtros.acao,
        page: String(page), limit: '50',
      })
      if (filtros.dataInicio) sp.set('data_inicio', filtros.dataInicio)
      if (filtros.dataFim)    sp.set('data_fim',    filtros.dataFim)
      const res = await fetch(`/api/configuracoes/log-auditoria?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar log de auditoria'); return }
      const data = await res.json()
      setDados(data.dados); setTotal(data.total); setPages(data.pages)
    } finally {
      setLoading(false)
    }
  }, [filtros, page])

  useEffect(() => { if (meuPerfil === 'admin') carregar() }, [carregar, meuPerfil])

  function aplicarFiltros() {
    setFiltros(rascunho)
    setPage(1)
  }

  function limparFiltros() {
    const padrao = filtrosPadrao()
    setRascunho(padrao)
    setFiltros(padrao)
    setPage(1)
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === 'Enter') aplicarFiltros()
  }

  const filtrosAlterados = JSON.stringify(rascunho) !== JSON.stringify(filtros)

  const inicio = (page - 1) * 50 + 1
  const fim    = Math.min(page * 50, total)

  if (meuPerfil && meuPerfil !== 'admin') {
    return (
      <div className="page-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <ShieldAlert size={40} color="var(--texto-terciario)" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--texto-principal)', marginBottom: 4 }}>Acesso restrito</div>
          <div style={{ fontSize: 13, color: 'var(--texto-secundario)' }}>
            Somente administradores podem consultar o log de auditoria.
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Log de Auditoria</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            Histórico de criação, edição e exclusão de registros do sistema
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Filtros — só valem depois de clicar em "Filtrar" (evita buscar tudo a cada tecla) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input
              className="input-field"
              placeholder="Buscar por usuário..."
              value={rascunho.busca}
              onChange={e => setRascunho(r => ({ ...r, busca: e.target.value }))}
              onKeyDown={aoTeclar}
              style={{ paddingLeft: 32 }}
            />
          </div>

          <select
            className="input-field"
            value={rascunho.tabela}
            onChange={e => setRascunho(r => ({ ...r, tabela: e.target.value }))}
            style={{ width: 170 }}
          >
            <option value="">Todos os módulos</option>
            {Object.entries(LABEL_TABELA).map(([valor, label]) => (
              <option key={valor} value={valor}>{label}</option>
            ))}
          </select>

          <select
            className="input-field"
            value={rascunho.acao}
            onChange={e => setRascunho(r => ({ ...r, acao: e.target.value }))}
            style={{ width: 130 }}
          >
            <option value="">Todas as ações</option>
            <option value="INSERT">Criação</option>
            <option value="UPDATE">Edição</option>
            <option value="DELETE">Exclusão</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>De:</label>
            <input
              type="date" className="input-field" value={rascunho.dataInicio}
              onChange={e => setRascunho(r => ({ ...r, dataInicio: e.target.value }))}
              onKeyDown={aoTeclar}
              style={{ width: 140 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>até:</label>
            <input
              type="date" className="input-field" value={rascunho.dataFim}
              onChange={e => setRascunho(r => ({ ...r, dataFim: e.target.value }))}
              onKeyDown={aoTeclar}
              style={{ width: 140 }}
            />
          </div>

          <button onClick={aplicarFiltros} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={14} />
            Filtrar
          </button>
          <button onClick={limparFiltros} className="btn-ghost" title="Limpar filtros" style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <X size={14} />
            Limpar
          </button>

          {filtrosAlterados && (
            <span style={{ fontSize: 11, color: 'var(--cor-aviso)' }}>
              Há alterações não aplicadas — clique em "Filtrar"
            </span>
          )}
        </div>

        {/* Tabela */}
        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Módulo</th>
                  <th>Registro</th>
                  <th>Ação</th>
                  <th>Usuário</th>
                  <th style={{ width: 60 }}></th>
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
                      Nenhum registro encontrado para os filtros aplicados
                    </td>
                  </tr>
                )}

                {!loading && dados.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>
                      {new Date(item.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td style={{ fontSize: 13 }}>{LABEL_TABELA[item.tabela] ?? item.tabela}</td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>
                      #{item.registro_id}
                    </td>
                    <td>
                      <span className={`badge-status ${BADGE_ACAO[item.acao] ?? ''}`}>
                        {LABEL_ACAO[item.acao] ?? item.acao}
                      </span>
                    </td>
                    <td style={{ fontSize: 13 }}>{item.usuario_nome ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setDetalhe(item)}
                          className="btn-ghost"
                          title="Ver detalhes"
                          style={{ padding: '5px 8px' }}
                        >
                          <Eye size={13} />
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

      {detalhe && (
        <DetalheAuditoriaModal item={detalhe} onClose={() => setDetalhe(null)} />
      )}
    </>
  )
}
