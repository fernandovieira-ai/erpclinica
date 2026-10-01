'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ChevronDown, ChevronRight, Printer, Search, Loader2 } from 'lucide-react'
import { gerarHtmlRelatorioIndicacoes, type ItemRelatorioIndicacao } from '@/components/cadastro/relatorioIndicacoesPrint'

interface Resumo {
  total_pacientes:   number
  com_indicacao:     number
  sem_indicacao:     number
  total_indicadores: number
}

interface RespostaRelatorio {
  resumo:       Resumo
  indicadores:  ItemRelatorioIndicacao[]
  empresa_nome: string
  empresa_logo: string | null
  emitido_por:  string
  erro?:        string
}

const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)', display: 'block', marginBottom: 4 } as const

function CardResumo({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="card" style={{ padding: '12px 16px', flex: '1 1 160px' }}>
      <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{valor}</div>
    </div>
  )
}

export default function RelatorioIndicacoesPage() {
  const router = useRouter()
  const [inicio, setInicio]       = useState('')
  const [fim, setFim]             = useState('')
  const [busca, setBusca]         = useState('')
  const [dados, setDados]         = useState<RespostaRelatorio | null>(null)
  const [loading, setLoading]     = useState(false)
  const [imprimindo, setImprimindo] = useState(false)
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())

  const carregar = useCallback(async () => {
    if ((inicio && !fim) || (fim && !inicio)) return
    setLoading(true)
    try {
      const sp = new URLSearchParams()
      if (inicio && fim) { sp.set('inicio', inicio); sp.set('fim', fim) }
      if (busca.trim())  sp.set('busca', busca.trim())
      const res  = await fetch(`/api/cadastro/pessoas/relatorio-indicacoes?${sp}`)
      const json: RespostaRelatorio = await res.json()
      if (!res.ok) { toast.error(json.erro || 'Erro ao carregar relatório'); return }
      setDados(json)
      setExpandidos(new Set())
    } finally {
      setLoading(false)
    }
  }, [inicio, fim, busca])

  useEffect(() => { carregar() }, [carregar])

  function alternarExpandido(idx: number) {
    setExpandidos(prev => {
      const novo = new Set(prev)
      if (novo.has(idx)) novo.delete(idx); else novo.add(idx)
      return novo
    })
  }

  async function imprimir() {
    if (!dados || dados.indicadores.length === 0) return
    setImprimindo(true)
    const win = window.open('', '_blank', 'width=900,height=1100')
    if (!win) {
      toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.')
      setImprimindo(false)
      return
    }
    win.document.write('<title>Gerando relatório...</title><body style="font-family:sans-serif;padding:24px;color:#555">Gerando relatório...</body>')
    try {
      const html = gerarHtmlRelatorioIndicacoes(dados.indicadores, {
        inicio, fim,
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
          <button className="btn-ghost" onClick={() => router.push('/cadastro/pessoas?papel=paciente')} style={{ padding: '5px 8px', marginBottom: 6 }}>
            <ArrowLeft size={14} /> Voltar para Pacientes
          </button>
          <h1 className="page-title">Relatório de Indicações</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            Pacientes agrupados por quem os indicou, conforme o cadastro de cada um
          </div>
        </div>
        <button className="btn-primary" onClick={imprimir} disabled={imprimindo || !dados?.indicadores.length}>
          {imprimindo ? <Loader2 size={15} className="spin" /> : <Printer size={15} />}
          Imprimir
        </button>
      </div>

      <div className="page-body">
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Cadastrado de</label>
            <input type="date" className="input-field" value={inicio} onChange={e => setInicio(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>até</label>
            <input type="date" className="input-field" value={fim} onChange={e => setFim(e.target.value)} />
          </div>
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <label style={labelStyle}>Buscar indicador</label>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 29, color: 'var(--texto-terciario)' }} />
            <input
              className="input-field"
              placeholder="Nome de quem indicou..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
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
            <CardResumo titulo="Pacientes (no filtro de período)" valor={dados.resumo.total_pacientes} />
            <CardResumo titulo="Com indicação registrada" valor={dados.resumo.com_indicacao} />
            <CardResumo titulo="Sem indicação registrada" valor={dados.resumo.sem_indicacao} />
            <CardResumo titulo="Indicadores distintos" valor={dados.resumo.total_indicadores} />
          </div>
        )}

        {/* Tabela */}
        <div className="card">
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Indicador</th>
                  <th>Vínculo</th>
                  <th>Telefone</th>
                  <th style={{ textAlign: 'right' }}>Pacientes indicados</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: 'var(--texto-terciario)' }}>Carregando...</td></tr>
                )}

                {!loading && (!dados || dados.indicadores.length === 0) && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--texto-terciario)' }}>Nenhuma indicação encontrada para o filtro informado</td></tr>
                )}

                {!loading && dados?.indicadores.map((g, idx) => {
                  const aberto = expandidos.has(idx)
                  return (
                    <Fragment key={idx}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => alternarExpandido(idx)}>
                        <td>{aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td style={{ fontWeight: 500 }}>
                          {g.indicador_nome}
                          {g.indicador_pessoa_id && <span style={{ fontSize: 11, color: 'var(--texto-terciario)', marginLeft: 6 }}>(cadastrado)</span>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--texto-secundario)' }}>{g.indicador_ligacao || '—'}</td>
                        <td style={{ fontSize: 12, fontFamily: 'var(--fonte-mono)' }}>{g.indicador_fone || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{g.qtd}</td>
                      </tr>
                      {aberto && g.pacientes.map(p => (
                        <tr key={`p-${idx}-${p.id}`} style={{ background: 'var(--bg-hover)' }}>
                          <td></td>
                          <td colSpan={2} style={{ fontSize: 12, paddingLeft: 20 }}>{p.nome}</td>
                          <td style={{ fontSize: 12, fontFamily: 'var(--fonte-mono)' }}>{p.telefone || '—'}</td>
                          <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--texto-terciario)' }}>
                            {new Date(p.data_cadastro + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
