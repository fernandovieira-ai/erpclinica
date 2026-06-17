'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Search, ChevronLeft, ChevronRight, Pencil, PowerOff } from 'lucide-react'
import type { PessoaListItem, PessoaListResponse } from '@/types/cadastros.types'
import { formatCpfCnpj } from '@/lib/utils'

const PAPEIS = [
  { value: '',               label: 'Todos' },
  { value: 'cliente',       label: 'Clientes' },
  { value: 'fornecedor',    label: 'Fornecedores' },
  { value: 'banco',         label: 'Banco/Fin.' },
  { value: 'transportador', label: 'Transportadores' },
  { value: 'paciente',      label: 'Pacientes' },
  { value: 'profissional',  label: 'Profissionais' },
]

const CLINICA_CONFIG: Record<string, { title: string; subtitle: string; btnLabel: string }> = {
  paciente:     { title: 'Pacientes',     subtitle: 'Cadastro de pacientes da clínica',                btnLabel: 'Novo Paciente'     },
  profissional: { title: 'Profissionais', subtitle: 'Médicos, dentistas e demais profissionais', btnLabel: 'Novo Profissional' },
}

function PapelBadges({ p }: { p: PessoaListItem }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {p.ind_cliente       && <span className="badge-papel badge-cliente">Cliente</span>}
      {p.ind_fornecedor    && <span className="badge-papel badge-fornecedor">Fornecedor</span>}
      {p.ind_banco         && <span className="badge-papel badge-banco">Banco</span>}
      {p.ind_transportador && <span className="badge-papel badge-transportador">Transport.</span>}
      {p.ind_paciente      && <span className="badge-papel badge-paciente">Paciente</span>}
      {p.ind_profissional  && <span className="badge-papel badge-profissional">Profissional</span>}
    </div>
  )
}

export default function PessoasPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [dados,   setDados]   = useState<PessoaListItem[]>([])
  const [total,   setTotal]   = useState(0)
  const [pages,   setPages]   = useState(1)
  const [loading, setLoading] = useState(false)
  const [busca,   setBusca]   = useState('')
  const [papel,   setPapel]   = useState(() => searchParams.get('papel') ?? '')
  const [ativo,   setAtivo]   = useState('true')
  const [page,    setPage]    = useState(1)

  // Sincroniza filtro quando navega via sidebar (client-side navigation)
  useEffect(() => {
    setPapel(searchParams.get('papel') ?? '')
  }, [searchParams])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const sp  = new URLSearchParams({ busca, papel, ativo, page: String(page), limit: '20' })
      const res = await fetch(`/api/cadastro/pessoas?${sp}`)
      if (!res.ok) { toast.error('Erro ao carregar'); return }
      const data: PessoaListResponse = await res.json()
      setDados(data.dados)
      setTotal(data.total)
      setPages(data.pages)
    } finally {
      setLoading(false)
    }
  }, [busca, papel, ativo, page])

  useEffect(() => { carregar() }, [carregar])

  // reset page on filter change
  useEffect(() => { setPage(1) }, [busca, papel, ativo])

  async function toggleAtivo(p: PessoaListItem) {
    const acao = p.ativo ? 'desativar' : 'reativar'
    if (!confirm(`Deseja ${acao} "${p.nome}"?`)) return
    const res = await fetch(`/api/cadastro/pessoas/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !p.ativo }),
    })
    if (res.ok) { toast.success(`Pessoa ${p.ativo ? 'desativada' : 'reativada'}!`); carregar() }
    else toast.error('Erro ao alterar status')
  }

  const clinica   = CLINICA_CONFIG[papel]
  const pageTitle = clinica?.title    ?? 'Pessoas'
  const subtitle  = clinica?.subtitle ?? 'Clientes, fornecedores, pacientes, profissionais e outros'
  const btnLabel  = clinica?.btnLabel ?? 'Nova Pessoa'

  const novoHref  = clinica ? `/cadastro/pessoas/novo?papel=${papel}` : '/cadastro/pessoas/novo'

  const inicio = (page - 1) * 20 + 1
  const fim    = Math.min(page * 20, total)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{pageTitle}</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            {subtitle}
          </div>
        </div>
        <button className="btn-primary" onClick={() => router.push(novoHref)}>
          <Plus size={15} />
          {btnLabel}
        </button>
      </div>

      <div className="page-body">

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
            <input
              className="input-field"
              placeholder={`Buscar ${clinica ? clinica.title.toLowerCase() : 'pessoas'} por nome ou CPF/CNPJ...`}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ paddingLeft: 32 }}
            />
          </div>

          {/* Botões de papel — ocultos quando contexto clínica (paciente/profissional) */}
          {!clinica && (
            <div style={{ display: 'flex', gap: 4 }}>
              {PAPEIS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPapel(p.value)}
                  className={papel === p.value ? 'btn-primary' : 'btn-ghost'}
                  style={{ padding: '7px 12px', fontSize: 12 }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <select
            className="input-field"
            value={ativo}
            onChange={e => setAtivo(e.target.value)}
            style={{ width: 120 }}
          >
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
            <option value="all">Todos</option>
          </select>
        </div>

        {/* Tabela */}
        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF/CNPJ</th>
                  {!clinica && <th>Papéis</th>}
                  <th>Cidade / UF</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={clinica ? 6 : 7} style={{ textAlign: 'center', padding: 32, color: 'var(--texto-terciario)' }}>
                      Carregando...
                    </td>
                  </tr>
                )}

                {!loading && dados.length === 0 && (
                  <tr>
                    <td colSpan={clinica ? 6 : 7} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>
                      {clinica ? `Nenhum ${papel === 'paciente' ? 'paciente' : 'profissional'} encontrado` : 'Nenhuma pessoa encontrada'}
                    </td>
                  </tr>
                )}

                {!loading && dados.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{p.nome}</div>
                      {p.nome_fantasia && (
                        <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>{p.nome_fantasia}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--fonte-mono)', fontSize: 12 }}>
                        {formatCpfCnpj(p.cpf_cnpj)}
                      </span>
                    </td>
                    {!clinica && <td><PapelBadges p={p} /></td>}
                    <td style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>
                      {p.cidade ? `${p.cidade.toUpperCase()}${p.uf ? ` / ${p.uf.toUpperCase()}` : ''}` : '—'}
                    </td>
                    <td style={{ fontSize: 12, fontFamily: 'var(--fonte-mono)' }}>
                      {p.telefone || p.celular || '—'}
                    </td>
                    <td>
                      <span className={`badge-status ${p.ativo ? 'badge-pago' : 'badge-cancelado'}`}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => router.push(`/cadastro/pessoas/${p.id}`)}
                          className="btn-ghost"
                          title="Editar"
                          style={{ padding: '5px 8px' }}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => toggleAtivo(p)}
                          className="btn-ghost"
                          title={p.ativo ? 'Desativar' : 'Reativar'}
                          style={{ padding: '5px 8px', color: p.ativo ? 'var(--cor-erro)' : 'var(--cor-sucesso)' }}
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

          {/* Paginação */}
          {total > 0 && (
            <div style={{
              padding: '12px 16px',
              borderTop: '0.5px solid var(--borda-suave)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 12, color: 'var(--texto-terciario)',
            }}>
              <span>{inicio}–{fim} de {total} registros</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-ghost"
                  style={{ padding: '4px 8px' }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ padding: '4px 10px', fontSize: 12 }}>
                  {page} / {pages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(pages, p + 1))}
                  disabled={page === pages}
                  className="btn-ghost"
                  style={{ padding: '4px 8px' }}
                >
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
