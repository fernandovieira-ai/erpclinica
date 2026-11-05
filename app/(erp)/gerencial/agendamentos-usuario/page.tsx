'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ChevronDown, ChevronRight, Printer, FileSpreadsheet, Search, Loader2 } from 'lucide-react'
import {
  gerarHtmlRelatorioAgendamentosUsuario, STATUS_ORDEM, STATUS_LABEL,
  type UsuarioRelatorioAgendamento, type StatusAgendamento,
} from '@/components/gerencial/relatorioAgendamentosUsuarioPrint'

interface Resumo {
  qtd_usuarios:        number
  qtd_agendamentos:    number
  por_status:          Record<StatusAgendamento, number>
  taxa_comparecimento: number | null
}

interface RespostaRelatorio {
  resumo:       Resumo
  usuarios:     UsuarioRelatorioAgendamento[]
  empresa_nome: string
  empresa_logo: string | null
  emitido_por:  string
  erro?:        string
}

const STATUS_COR: Record<StatusAgendamento, string> = {
  AGENDADO: '#378ADD', CONFIRMADO: '#7E57C2', AGUARDANDO: '#EF9F27',
  ATENDIDO: '#1D9E75', FALTOU: '#E24B4A', CANCELADO: '#888780',
}

const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)', display: 'block', marginBottom: 4 } as const

function contagemZerada(): Record<StatusAgendamento, number> {
  return { AGENDADO: 0, CONFIRMADO: 0, AGUARDANDO: 0, ATENDIDO: 0, FALTOU: 0, CANCELADO: 0 }
}

function SkeletonBar({ width, height = 22 }: { width: number; height?: number }) {
  return <div className="skeleton-bar" style={{ width, height, marginTop: 2 }} />
}

function CardResumo({ titulo, valor }: { titulo: string; valor: string | null }) {
  return (
    <div className="card" style={{ padding: '12px 16px', flex: '1 1 160px' }}>
      <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>{titulo}</div>
      {valor === null ? <SkeletonBar width={70} /> : <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{valor}</div>}
    </div>
  )
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function primeiroDiaMesAtual() {
  const hoje = new Date()
  return toISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
}
function ultimoDiaMesAtual() {
  const hoje = new Date()
  return toISO(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))
}

export default function RelatorioAgendamentosUsuarioPage() {
  const router = useRouter()
  const [inicio, setInicio]       = useState(primeiroDiaMesAtual)
  const [fim, setFim]             = useState(ultimoDiaMesAtual)
  const [busca, setBusca]         = useState('')
  const [usuarioSel, setUsuarioSel] = useState('')
  const [tipoSel, setTipoSel]     = useState('')
  const [dados, setDados]         = useState<RespostaRelatorio | null>(null)
  const [loading, setLoading]     = useState(true)
  const [imprimindo, setImprimindo] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [abertos, setAbertos]     = useState<Set<string>>(new Set())

  // Só o período (data de lançamento) vai pro servidor — usuário/tipo/busca filtram em memória o
  // período já carregado, mesmo critério usado no Relatório de Receitas (host do banco fora da
  // rede privada do Railway: cada ida e volta custa latência).
  const carregar = useCallback(async () => {
    if ((inicio && !fim) || (fim && !inicio)) return
    setLoading(true)
    try {
      const sp = new URLSearchParams()
      if (inicio && fim) { sp.set('inicio', inicio); sp.set('fim', fim) }
      const res  = await fetch(`/api/gerencial/agendamentos-usuario?${sp}`)
      const json: RespostaRelatorio = await res.json()
      if (!res.ok) { toast.error(json.erro || 'Erro ao carregar relatório'); return }
      setDados(json)
      setAbertos(new Set())
    } finally {
      setLoading(false)
    }
  }, [inicio, fim])

  useEffect(() => { carregar() }, [carregar])

  const usuariosDisponiveis = useMemo(
    () => (dados ? dados.usuarios.map((u) => u.usuario) : []),
    [dados],
  )
  const tiposDisponiveis = useMemo(() => {
    if (!dados) return []
    const nomes = new Set<string>()
    for (const u of dados.usuarios) for (const t of u.tipos) nomes.add(t.tipo_descricao)
    return [...nomes].sort((a, b) => a.localeCompare(b))
  }, [dados])

  const usuariosFiltrados = useMemo<UsuarioRelatorioAgendamento[]>(() => {
    if (!dados) return []
    const termo = busca.trim().toLowerCase()
    return dados.usuarios
      .filter((u) => !usuarioSel || u.usuario === usuarioSel)
      .filter((u) => !termo || u.usuario.toLowerCase().includes(termo))
      .map((u) => {
        const tipos = tipoSel ? u.tipos.filter((t) => t.tipo_descricao === tipoSel) : u.tipos
        const contagem = contagemZerada()
        for (const t of tipos) for (const s of STATUS_ORDEM) contagem[s] += t.contagem[s]
        const total = STATUS_ORDEM.reduce((acc, s) => acc + contagem[s], 0)
        return { ...u, tipos, contagem, total }
      })
      .filter((u) => u.total > 0)
  }, [dados, busca, usuarioSel, tipoSel])

  const resumoFiltrado = useMemo<Resumo>(() => {
    const por_status = contagemZerada()
    for (const u of usuariosFiltrados) for (const s of STATUS_ORDEM) por_status[s] += u.contagem[s]
    const qtd_agendamentos = STATUS_ORDEM.reduce((acc, s) => acc + por_status[s], 0)
    const base = por_status.ATENDIDO + por_status.FALTOU
    return {
      qtd_usuarios: usuariosFiltrados.length,
      qtd_agendamentos,
      por_status,
      taxa_comparecimento: base > 0 ? (por_status.ATENDIDO / base) * 100 : null,
    }
  }, [usuariosFiltrados])

  function alternar(usuario: string) {
    setAbertos((prev) => {
      const novo = new Set(prev)
      if (novo.has(usuario)) novo.delete(usuario); else novo.add(usuario)
      return novo
    })
  }

  async function imprimir() {
    if (!dados || usuariosFiltrados.length === 0) return
    setImprimindo(true)
    const win = window.open('', '_blank', 'width=1100,height=750')
    if (!win) {
      toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.')
      setImprimindo(false)
      return
    }
    win.document.write('<title>Gerando relatório...</title><body style="font-family:sans-serif;padding:24px;color:#555">Gerando relatório...</body>')
    try {
      const html = gerarHtmlRelatorioAgendamentosUsuario(usuariosFiltrados, {
        inicio: inicio || null,
        fim:    fim    || null,
        usuarioTexto: usuarioSel || null,
        tipoTexto:    tipoSel || null,
        empresaNome:  dados.empresa_nome,
        empresaLogo:  dados.empresa_logo,
        emitidoPor:   dados.emitido_por,
      })
      win.document.open()
      win.document.write(html)
      win.document.close()
    } catch {
      win.close()
      toast.error('Erro ao gerar o relatório')
    } finally {
      setImprimindo(false)
    }
  }

  async function exportarExcel() {
    if (!dados || usuariosFiltrados.length === 0) return
    setExportando(true)
    try {
      const XLSX = await import('xlsx')
      const linhas: Record<string, string | number>[] = []
      for (const u of usuariosFiltrados) {
        for (const t of u.tipos) {
          const linha: Record<string, string | number> = { 'Usuário': u.usuario, 'Tipo de Atendimento': t.tipo_descricao }
          for (const s of STATUS_ORDEM) linha[STATUS_LABEL[s]] = t.contagem[s]
          linha['Total'] = t.total
          linhas.push(linha)
        }
      }
      const totalLinha: Record<string, string | number> = { 'Usuário': 'TOTAL GERAL', 'Tipo de Atendimento': '' }
      for (const s of STATUS_ORDEM) totalLinha[STATUS_LABEL[s]] = resumoFiltrado.por_status[s]
      totalLinha['Total'] = resumoFiltrado.qtd_agendamentos
      linhas.push(totalLinha)

      const planilha = XLSX.utils.json_to_sheet(linhas)
      planilha['!cols'] = [{ wch: 26 }, { wch: 24 }, { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 10 }, { wch: 11 }, { wch: 9 }]
      const livro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(livro, planilha, 'Agendamentos por Usuário')
      const sufixoPeriodo = inicio && fim ? `${inicio}_a_${fim}` : 'todos'
      XLSX.writeFile(livro, `agendamentos_por_usuario_${sufixoPeriodo}.xlsx`)
    } catch {
      toast.error('Erro ao exportar para Excel')
    } finally {
      setExportando(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn-ghost" onClick={() => router.push('/clinica/agendamento')} style={{ padding: '5px 8px', marginBottom: 6 }}>
            <ArrowLeft size={14} /> Voltar para Agendamento
          </button>
          <h1 className="page-title">Agendamentos por Usuário</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            Produtividade de cadastro: quem lançou, por tipo de atendimento e status — filtro pela data de lançamento
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={exportarExcel} disabled={exportando || !usuariosFiltrados.length}>
            {exportando ? <Loader2 size={15} className="spin" /> : <FileSpreadsheet size={15} />}
            Exportar Excel
          </button>
          <button className="btn-primary" onClick={imprimir} disabled={imprimindo || !usuariosFiltrados.length}>
            {imprimindo ? <Loader2 size={15} className="spin" /> : <Printer size={15} />}
            Imprimir
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Lançado de</label>
            <input type="date" className="input-field" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>até</label>
            <input type="date" className="input-field" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <label style={labelStyle}>Buscar usuário</label>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 29, color: 'var(--texto-terciario)' }} />
            <input
              className="input-field"
              placeholder="Nome de quem lançou..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ paddingLeft: 32, width: '100%' }}
            />
          </div>
          <div style={{ minWidth: 200 }}>
            <label style={labelStyle}>Usuário</label>
            <select className="input-field" value={usuarioSel} onChange={(e) => setUsuarioSel(e.target.value)} style={{ width: '100%' }}>
              <option value="">Todos os usuários</option>
              {usuariosDisponiveis.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 200 }}>
            <label style={labelStyle}>Tipo de atendimento</label>
            <select className="input-field" value={tipoSel} onChange={(e) => setTipoSel(e.target.value)} style={{ width: '100%' }}>
              <option value="">Todos os tipos</option>
              {tiposDisponiveis.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {(inicio || fim) && (
            <button className="btn-ghost" onClick={() => { setInicio(''); setFim('') }} style={{ padding: '7px 10px', fontSize: 12 }}>
              Limpar período
            </button>
          )}
        </div>

        {/* Resumo */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <CardResumo titulo="Usuários" valor={dados ? String(resumoFiltrado.qtd_usuarios) : null} />
          <CardResumo titulo="Agendamentos" valor={dados ? String(resumoFiltrado.qtd_agendamentos) : null} />
          <CardResumo titulo="Atendidos" valor={dados ? String(resumoFiltrado.por_status.ATENDIDO) : null} />
          <CardResumo titulo="Faltas" valor={dados ? String(resumoFiltrado.por_status.FALTOU) : null} />
          <CardResumo titulo="Cancelados" valor={dados ? String(resumoFiltrado.por_status.CANCELADO) : null} />
          <CardResumo
            titulo="Taxa de comparecimento"
            valor={dados ? (resumoFiltrado.taxa_comparecimento != null ? `${resumoFiltrado.taxa_comparecimento.toFixed(1)}%` : '—') : null}
          />
        </div>

        {/* Resumo por status */}
        {(!dados || resumoFiltrado.qtd_agendamentos > 0) && (
          <div className="card" style={{ padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--texto-secundario)' }}>Por status</div>
            {!dados ? (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <SkeletonBar width={100} height={16} />
                <SkeletonBar width={100} height={16} />
                <SkeletonBar width={100} height={16} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {STATUS_ORDEM.map((s) => (
                  <div key={s} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COR[s], display: 'inline-block' }} />
                    <strong>{STATUS_LABEL[s]}</strong>: {resumoFiltrado.por_status[s]}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tabela */}
        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Usuário / Tipo de Atendimento</th>
                  {STATUS_ORDEM.map((s) => <th key={s} style={{ textAlign: 'right' }}>{STATUS_LABEL[s]}</th>)}
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--texto-terciario)' }}>Carregando...</td></tr>
                )}

                {!loading && (!dados || usuariosFiltrados.length === 0) && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>Nenhum agendamento encontrado para o filtro informado</td></tr>
                )}

                {!loading && usuariosFiltrados.map((u) => {
                  const aberto = abertos.has(u.usuario)
                  return (
                    <Fragment key={u.usuario}>
                      <tr style={{ cursor: 'pointer', background: 'var(--bg-hover)' }} onClick={() => alternar(u.usuario)}>
                        <td>{aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td style={{ fontWeight: 700, color: 'var(--texto-primario)' }}>{u.usuario}</td>
                        {STATUS_ORDEM.map((s) => (
                          <td key={s} style={{ textAlign: 'right', fontWeight: 600 }}>{u.contagem[s] || '—'}</td>
                        ))}
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{u.total}</td>
                      </tr>

                      {aberto && u.tipos.map((t) => (
                        <tr key={`${u.usuario}:${t.tipo_id ?? 'null'}`}>
                          <td></td>
                          <td style={{ paddingLeft: 24, fontSize: 12 }}>{t.tipo_descricao}</td>
                          {STATUS_ORDEM.map((s) => (
                            <td key={s} style={{ textAlign: 'right', fontSize: 12 }}>{t.contagem[s] || '—'}</td>
                          ))}
                          <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>{t.total}</td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
              {usuariosFiltrados.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--cor-primaria)' }}>
                    <td colSpan={2} style={{ fontWeight: 700, color: '#fff', padding: '8px 10px' }}>TOTAL GERAL</td>
                    {STATUS_ORDEM.map((s) => (
                      <td key={s} style={{ textAlign: 'right', fontWeight: 700, color: '#fff' }}>{resumoFiltrado.por_status[s]}</td>
                    ))}
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#fff' }}>{resumoFiltrado.qtd_agendamentos}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
