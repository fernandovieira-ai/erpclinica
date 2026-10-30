'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Printer, FileSpreadsheet, Search, Loader2 } from 'lucide-react'
import { gerarHtmlRelatorioReceitas, type ItemRelatorioReceita, type ResumoPorFormaReceita } from '@/components/gerencial/relatorioReceitasPrint'

interface ProfissionalOpcao {
  id:   number
  nome: string
}

interface TipoProcedimentoOpcao {
  id:        number
  descricao: string
}

interface Resumo {
  qtd_atendimentos:   number
  valor_bruto:        number
  valor_taxas:        number
  valor_liquido:       number
  valor_profissional: number
  valor_clinica:      number
}

interface RespostaRelatorio {
  resumo:       Resumo
  itens:        ItemRelatorioReceita[]
  por_forma:    ResumoPorFormaReceita[]
  empresa_nome: string
  empresa_logo: string | null
  emitido_por:  string
  erro?:        string
}

const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)', display: 'block', marginBottom: 4 } as const

function fmtValor(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(d: string) {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}

function CardResumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="card" style={{ padding: '12px 16px', flex: '1 1 160px' }}>
      <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{valor}</div>
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

export default function RelatorioReceitasPage() {
  const router = useRouter()
  const [inicio, setInicio]           = useState(primeiroDiaMesAtual)
  const [fim, setFim]                 = useState(ultimoDiaMesAtual)
  const [busca, setBusca]             = useState('')
  const [profissionalId, setProfissionalId] = useState(0)
  const [profissionais, setProfissionais]   = useState<ProfissionalOpcao[]>([])
  const [tipoId, setTipoId]           = useState(0)
  const [tipos, setTipos]             = useState<TipoProcedimentoOpcao[]>([])
  const [dados, setDados]             = useState<RespostaRelatorio | null>(null)
  const [loading, setLoading]         = useState(false)
  const [imprimindo, setImprimindo]   = useState(false)
  const [exportando, setExportando]   = useState(false)

  // Só o período vai pro servidor — médico/tipo/busca filtram em memória o
  // período já carregado, pra não bater no banco (host fora da rede privada
  // do Railway, cada ida e volta custa latência) a cada troca de seleção.
  const carregar = useCallback(async () => {
    if ((inicio && !fim) || (fim && !inicio)) return
    setLoading(true)
    try {
      const sp = new URLSearchParams()
      if (inicio && fim) { sp.set('inicio', inicio); sp.set('fim', fim) }
      const res  = await fetch(`/api/gerencial/receitas?${sp}`)
      const json: RespostaRelatorio = await res.json()
      if (!res.ok) { toast.error(json.erro || 'Erro ao carregar relatório'); return }
      setDados(json)
    } finally {
      setLoading(false)
    }
  }, [inicio, fim])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    fetch('/api/clinica/profissionais')
      .then((r) => r.json())
      .then((d) => setProfissionais((d.dados ?? []).map((p: { id: number; nome: string }) => ({ id: p.id, nome: p.nome }))))
      .catch(() => {})
    fetch('/api/clinica/tipos-agendamento?ativo=true&limit=100')
      .then((r) => r.json())
      .then((d) => setTipos((d.dados ?? []).map((t: { id: number; descricao: string }) => ({ id: t.id, descricao: t.descricao }))))
      .catch(() => {})
  }, [])

  const itensFiltrados = useMemo(() => {
    if (!dados) return []
    const termo = busca.trim().toLowerCase()
    return dados.itens.filter((i) => {
      if (profissionalId && i.executante_id !== profissionalId) return false
      if (tipoId && i.tipo_id !== tipoId) return false
      if (termo) {
        const alvo = `${i.paciente_nome ?? ''} ${i.procedimento ?? ''}`.toLowerCase()
        if (!alvo.includes(termo)) return false
      }
      return true
    })
  }, [dados, busca, profissionalId, tipoId])

  const resumoFiltrado = useMemo<Resumo>(() => ({
    qtd_atendimentos:   itensFiltrados.length,
    valor_bruto:        itensFiltrados.reduce((acc, i) => acc + i.valor_bruto, 0),
    valor_taxas:        itensFiltrados.reduce((acc, i) => acc + i.valor_taxa, 0),
    valor_liquido:      itensFiltrados.reduce((acc, i) => acc + i.valor_liquido, 0),
    valor_profissional: itensFiltrados.reduce((acc, i) => acc + i.valor_profissional, 0),
    valor_clinica:      itensFiltrados.reduce((acc, i) => acc + i.valor_clinica, 0),
  }), [itensFiltrados])

  const porFormaFiltrado = useMemo<ResumoPorFormaReceita[]>(() => {
    const mapa = new Map<string, ResumoPorFormaReceita>()
    for (const i of itensFiltrados) {
      const chave = i.forma_pagamento ?? '—'
      const atual = mapa.get(chave) ?? { forma_pagamento: chave, qtd: 0, valor_bruto: 0 }
      atual.qtd += 1
      atual.valor_bruto += i.valor_bruto
      mapa.set(chave, atual)
    }
    return [...mapa.values()].sort((a, b) => b.valor_bruto - a.valor_bruto)
  }, [itensFiltrados])

  async function imprimir() {
    if (!dados || itensFiltrados.length === 0) return
    setImprimindo(true)
    const win = window.open('', '_blank', 'width=1100,height=750')
    if (!win) {
      toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.')
      setImprimindo(false)
      return
    }
    win.document.write('<title>Gerando relatório...</title><body style="font-family:sans-serif;padding:24px;color:#555">Gerando relatório...</body>')
    try {
      const html = gerarHtmlRelatorioReceitas(itensFiltrados, porFormaFiltrado, {
        inicio: inicio || null,
        fim:    fim    || null,
        buscaTexto:  busca.trim() || null,
        medicoTexto: profissionais.find((p) => p.id === profissionalId)?.nome || null,
        tipoTexto:   tipos.find((t) => t.id === tipoId)?.descricao || null,
        empresaNome: dados.empresa_nome,
        empresaLogo: dados.empresa_logo,
        emitidoPor:  dados.emitido_por,
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
    if (!dados || itensFiltrados.length === 0) return
    setExportando(true)
    try {
      const XLSX = await import('xlsx')
      const linhas = itensFiltrados.map((i) => ({
        'Data':                       fmtData(i.data_recebimento),
        'Paciente':                   i.paciente_nome ?? '',
        'Procedimento':               i.procedimento ?? '',
        'Executante':                 i.executante_nome ?? '',
        'Solicitante':                i.solicitante_nome ?? '',
        'Forma de Pagamento':         i.qtd_parcelas && i.qtd_parcelas > 1 ? `${i.forma_pagamento ?? ''} ${i.qtd_parcelas}x` : (i.forma_pagamento ?? ''),
        'Taxa (R$)':                  i.valor_taxa,
        'Valor Bruto (R$)':           i.valor_bruto,
        'Repasse Profissional (R$)':  i.valor_profissional,
        'Valor Clínica (R$)':         i.valor_clinica,
      }))
      linhas.push({
        'Data': '', 'Paciente': '', 'Procedimento': '', 'Executante': '', 'Solicitante': '',
        'Forma de Pagamento':        'TOTAL GERAL',
        'Taxa (R$)':                 resumoFiltrado.valor_taxas,
        'Valor Bruto (R$)':          resumoFiltrado.valor_bruto,
        'Repasse Profissional (R$)': resumoFiltrado.valor_profissional,
        'Valor Clínica (R$)':        resumoFiltrado.valor_clinica,
      })
      const planilha = XLSX.utils.json_to_sheet(linhas)
      planilha['!cols'] = [
        { wch: 11 }, { wch: 32 }, { wch: 26 }, { wch: 24 }, { wch: 24 },
        { wch: 22 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 15 },
      ]
      const livro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(livro, planilha, 'Receitas')
      const sufixoPeriodo = inicio && fim ? `${inicio}_a_${fim}` : 'todos'
      XLSX.writeFile(livro, `receitas_${sufixoPeriodo}.xlsx`)
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
          <button className="btn-ghost" onClick={() => router.push('/gerencial/fechamento-diario')} style={{ padding: '5px 8px', marginBottom: 6 }}>
            <ArrowLeft size={14} /> Voltar para Gerencial
          </button>
          <h1 className="page-title">Receitas</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            Lançamento a lançamento, com repasse profissional x clínica
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={exportarExcel} disabled={exportando || !itensFiltrados.length}>
            {exportando ? <Loader2 size={15} className="spin" /> : <FileSpreadsheet size={15} />}
            Exportar Excel
          </button>
          <button className="btn-primary" onClick={imprimir} disabled={imprimindo || !itensFiltrados.length}>
            {imprimindo ? <Loader2 size={15} className="spin" /> : <Printer size={15} />}
            Imprimir
          </button>
        </div>
      </div>

      <div className="page-body">
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Recebido de</label>
            <input type="date" className="input-field" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>até</label>
            <input type="date" className="input-field" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <label style={labelStyle}>Buscar paciente ou procedimento</label>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 29, color: 'var(--texto-terciario)' }} />
            <input
              className="input-field"
              placeholder="Nome do paciente ou procedimento..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ paddingLeft: 32, width: '100%' }}
            />
          </div>
          <div style={{ minWidth: 200 }}>
            <label style={labelStyle}>Médico (executante)</label>
            <select
              className="input-field"
              value={profissionalId}
              onChange={(e) => setProfissionalId(Number(e.target.value))}
              style={{ width: '100%' }}
            >
              <option value={0}>Todos os médicos</option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 200 }}>
            <label style={labelStyle}>Tipo de procedimento</label>
            <select
              className="input-field"
              value={tipoId}
              onChange={(e) => setTipoId(Number(e.target.value))}
              style={{ width: '100%' }}
            >
              <option value={0}>Todos os tipos</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>{t.descricao}</option>
              ))}
            </select>
          </div>
          {(inicio || fim) && (
            <button className="btn-ghost" onClick={() => { setInicio(''); setFim('') }} style={{ padding: '7px 10px', fontSize: 12 }}>
              Limpar período
            </button>
          )}
        </div>

        {/* Resumo */}
        {dados && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <CardResumo titulo="Atendimentos" valor={String(resumoFiltrado.qtd_atendimentos)} />
            <CardResumo titulo="Valor bruto" valor={fmtValor(resumoFiltrado.valor_bruto)} />
            <CardResumo titulo="Taxas de cartão" valor={fmtValor(resumoFiltrado.valor_taxas)} />
            <CardResumo titulo="Valor líquido" valor={fmtValor(resumoFiltrado.valor_liquido)} />
            <CardResumo titulo="Repasse profissionais" valor={fmtValor(resumoFiltrado.valor_profissional)} />
            <CardResumo titulo="Valor clínica" valor={fmtValor(resumoFiltrado.valor_clinica)} />
          </div>
        )}

        {/* Resumo por forma de pagamento */}
        {dados && porFormaFiltrado.length > 0 && (
          <div className="card" style={{ padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--texto-secundario)' }}>Por forma de pagamento</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {porFormaFiltrado.map((f) => (
                <div key={f.forma_pagamento} style={{ fontSize: 12 }}>
                  <strong>{f.forma_pagamento}</strong>: {f.qtd} · {fmtValor(f.valor_bruto)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabela */}
        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Paciente</th>
                  <th>Procedimento</th>
                  <th>Executante</th>
                  <th>Solicitante</th>
                  <th>Forma pagto.</th>
                  <th style={{ textAlign: 'right' }}>Taxa</th>
                  <th style={{ textAlign: 'right' }}>Bruto</th>
                  <th style={{ textAlign: 'right' }}>Repasse</th>
                  <th style={{ textAlign: 'right' }}>Clínica</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32, color: 'var(--texto-terciario)' }}>Carregando...</td></tr>
                )}

                {!loading && (!dados || itensFiltrados.length === 0) && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>Nenhum recebimento encontrado para o filtro informado</td></tr>
                )}

                {!loading && itensFiltrados.map((i) => (
                  <tr key={i.id}>
                    <td style={{ fontSize: 12 }}>{fmtData(i.data_recebimento)}</td>
                    <td style={{ fontWeight: 600 }}>{i.paciente_nome || '—'}</td>
                    <td style={{ fontSize: 12 }}>{i.procedimento || '—'}</td>
                    <td style={{ fontSize: 12 }}>{i.executante_nome || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>{i.solicitante_nome || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {i.forma_pagamento || '—'}{i.qtd_parcelas && i.qtd_parcelas > 1 ? ` ${i.qtd_parcelas}x` : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{i.valor_taxa > 0 ? fmtValor(i.valor_taxa) : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtValor(i.valor_bruto)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmtValor(i.valor_profissional)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmtValor(i.valor_clinica)}</td>
                  </tr>
                ))}
              </tbody>
              {itensFiltrados.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--cor-primaria)' }}>
                    <td colSpan={6} style={{ fontWeight: 700, color: '#fff', padding: '8px 10px' }}>TOTAL GERAL</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#fff' }}>{fmtValor(resumoFiltrado.valor_taxas)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#fff' }}>{fmtValor(resumoFiltrado.valor_bruto)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#fff' }}>{fmtValor(resumoFiltrado.valor_profissional)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#fff' }}>{fmtValor(resumoFiltrado.valor_clinica)}</td>
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
