'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ChevronDown, ChevronRight, Printer, Search, Loader2 } from 'lucide-react'
import { gerarHtmlRelatorioDespesasTipo, type SinteticoRelatorioDespesa } from '@/components/financeiro/relatorioDespesasTipoPrint'

interface Resumo {
  qtd_despesas:         number
  valor_total:          number
  qtd_tipos_sinteticos: number
  qtd_tipos_analiticos: number
}

interface RespostaRelatorio {
  resumo:       Resumo
  grupos:       SinteticoRelatorioDespesa[]
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
    <div className="card" style={{ padding: '12px 16px', flex: '1 1 180px' }}>
      <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{valor}</div>
    </div>
  )
}

export default function RelatorioDespesasTipoPage() {
  const router = useRouter()
  const [inicio, setInicio]           = useState('')
  const [fim, setFim]                 = useState('')
  const [busca, setBusca]             = useState('')
  const [dados, setDados]             = useState<RespostaRelatorio | null>(null)
  const [loading, setLoading]         = useState(false)
  const [imprimindo, setImprimindo]   = useState(false)
  const [sinteticosAbertos, setSinteticosAbertos] = useState<Set<number>>(new Set())
  const [analiticosAbertos, setAnaliticosAbertos] = useState<Set<string>>(new Set())

  const carregar = useCallback(async () => {
    if ((inicio && !fim) || (fim && !inicio)) return
    setLoading(true)
    try {
      const sp = new URLSearchParams()
      if (inicio && fim) { sp.set('inicio', inicio); sp.set('fim', fim) }
      if (busca.trim())  sp.set('busca', busca.trim())
      const res  = await fetch(`/api/financeiro/despesas/relatorio-tipo?${sp}`)
      const json: RespostaRelatorio = await res.json()
      if (!res.ok) { toast.error(json.erro || 'Erro ao carregar relatório'); return }
      setDados(json)
      setSinteticosAbertos(new Set())
      setAnaliticosAbertos(new Set())
    } finally {
      setLoading(false)
    }
  }, [inicio, fim, busca])

  useEffect(() => { carregar() }, [carregar])

  function alternarSintetico(id: number) {
    setSinteticosAbertos((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }
  function alternarAnalitico(chave: string) {
    setAnaliticosAbertos((prev) => {
      const novo = new Set(prev)
      if (novo.has(chave)) novo.delete(chave); else novo.add(chave)
      return novo
    })
  }

  async function imprimir() {
    if (!dados || dados.grupos.length === 0) return
    setImprimindo(true)
    const win = window.open('', '_blank', 'width=900,height=1100')
    if (!win) {
      toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.')
      setImprimindo(false)
      return
    }
    win.document.write('<title>Gerando relatório...</title><body style="font-family:sans-serif;padding:24px;color:#555">Gerando relatório...</body>')
    try {
      const html = gerarHtmlRelatorioDespesasTipo(dados.grupos, {
        inicio: inicio || null,
        fim:    fim    || null,
        buscaTexto:  busca.trim() || null,
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

  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn-ghost" onClick={() => router.push('/financeiro/despesas')} style={{ padding: '5px 8px', marginBottom: 6 }}>
            <ArrowLeft size={14} /> Voltar para Despesas
          </button>
          <h1 className="page-title">Despesas por Tipo</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            Agrupado pelo plano de contas — sintético e analítico
          </div>
        </div>
        <button className="btn-primary" onClick={imprimir} disabled={imprimindo || !dados?.grupos.length}>
          {imprimindo ? <Loader2 size={15} className="spin" /> : <Printer size={15} />}
          Imprimir
        </button>
      </div>

      <div className="page-body">
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Despesa de</label>
            <input type="date" className="input-field" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>até</label>
            <input type="date" className="input-field" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <label style={labelStyle}>Buscar fornecedor ou documento</label>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 29, color: 'var(--texto-terciario)' }} />
            <input
              className="input-field"
              placeholder="Nome do fornecedor ou nº documento..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ paddingLeft: 32, width: '100%' }}
            />
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
            <CardResumo titulo="Lançamentos" valor={String(dados.resumo.qtd_despesas)} />
            <CardResumo titulo="Valor total" valor={fmtValor(dados.resumo.valor_total)} />
            <CardResumo titulo="Tipos sintéticos" valor={String(dados.resumo.qtd_tipos_sinteticos)} />
            <CardResumo titulo="Tipos analíticos" valor={String(dados.resumo.qtd_tipos_analiticos)} />
          </div>
        )}

        {/* Tabela */}
        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Tipo de despesa</th>
                  <th>Fornecedor / Documento</th>
                  <th style={{ textAlign: 'right' }}>Lançamentos</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--texto-terciario)' }}>Carregando...</td></tr>
                )}

                {!loading && (!dados || dados.grupos.length === 0) && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>Nenhuma despesa encontrada para o filtro informado</td></tr>
                )}

                {!loading && dados?.grupos.map((s) => {
                  const sintAberto = sinteticosAbertos.has(s.id)
                  return (
                    <Fragment key={s.id}>
                      <tr style={{ cursor: 'pointer', background: 'var(--bg-hover)' }} onClick={() => alternarSintetico(s.id)}>
                        <td>{sintAberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td colSpan={2} style={{ fontWeight: 700, color: 'var(--texto-primario)' }}>
                          {s.codigo} — {s.descricao}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.qtd}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtValor(s.total)}</td>
                      </tr>

                      {sintAberto && s.analiticos.map((a) => {
                        const chave = `${s.id}:${a.id}`
                        const analAberto = analiticosAbertos.has(chave)
                        return (
                          <Fragment key={chave}>
                            <tr style={{ cursor: 'pointer' }} onClick={() => alternarAnalitico(chave)}>
                              <td></td>
                              <td colSpan={2} style={{ paddingLeft: 24, fontWeight: 500 }}>
                                {analAberto ? <ChevronDown size={12} style={{ marginRight: 4 }} /> : <ChevronRight size={12} style={{ marginRight: 4 }} />}
                                {a.codigo} — {a.descricao}
                              </td>
                              <td style={{ textAlign: 'right' }}>{a.qtd}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtValor(a.total)}</td>
                            </tr>

                            {analAberto && a.itens.map((i) => (
                              <tr key={i.id} style={{ background: 'var(--bg-hover)' }}>
                                <td></td>
                                <td style={{ paddingLeft: 40, fontSize: 12 }}>{fmtData(i.data_despesa)}</td>
                                <td style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>
                                  {i.pessoa_nome || '—'}
                                  {i.documento && <span style={{ color: 'var(--texto-terciario)' }}> · {i.documento}</span>}
                                  {i.observacao && <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>{i.observacao}</div>}
                                </td>
                                <td></td>
                                <td style={{ textAlign: 'right', fontSize: 12 }}>{fmtValor(i.valor)}</td>
                              </tr>
                            ))}
                          </Fragment>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
              {dados && dados.grupos.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'var(--cor-primaria)' }}>
                    <td colSpan={3} style={{ fontWeight: 700, color: '#fff', padding: '8px 10px' }}>TOTAL GERAL</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#fff' }}>{dados.resumo.qtd_despesas}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#fff' }}>{fmtValor(dados.resumo.valor_total)}</td>
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
