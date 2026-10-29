'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FileSpreadsheet, FileBarChart, Loader2 } from 'lucide-react'
import type { DreResponse } from '@/types/cadastros.types'

function fmtNum(v: number) {
  const s = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `-${s}` : s
}

function fmtPct(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  return `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
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

type LinhaExibicao =
  | { tipo: 'bloco';     descricao: string; valor: number; margem?: null }
  | { tipo: 'item';      descricao: string; valor: number; margem?: null }
  | { tipo: 'resultado'; descricao: string; valor: number; margem?: null }
  | { tipo: 'margem';    descricao: string; valor: number | null; margem?: null }

function montarLinhas(dados: DreResponse): LinhaExibicao[] {
  const porChave = Object.fromEntries(dados.blocos.map(b => [b.chave, b]))
  const porRes    = Object.fromEntries(dados.resultado.map(r => [r.chave, r]))
  const linhas: LinhaExibicao[] = []

  const pushBloco = (b: typeof dados.blocos[number] | undefined) => {
    if (!b) return
    linhas.push({ tipo: 'bloco', descricao: b.titulo, valor: b.subtotal })
    for (const l of b.linhas) linhas.push({ tipo: 'item', descricao: l.descricao, valor: l.valor })
  }

  if (porRes.receita_bruta) linhas.push({ tipo: 'resultado', descricao: 'Receita Bruta', valor: porRes.receita_bruta.valor })
  pushBloco(porChave.imposto)
  if (porRes.receita_liquida) linhas.push({ tipo: 'resultado', descricao: 'Receita Líquida', valor: porRes.receita_liquida.valor })
  for (const l of porChave.receita?.linhas ?? []) linhas.push({ tipo: 'item', descricao: l.descricao, valor: l.valor })

  pushBloco(porChave.custos)
  if (porRes.lucro_bruto) {
    linhas.push({ tipo: 'resultado', descricao: 'Lucro Bruto', valor: porRes.lucro_bruto.valor })
    linhas.push({ tipo: 'margem', descricao: 'Margem Bruta', valor: porRes.lucro_bruto.margem ?? null })
  }

  pushBloco(porChave.opex)
  pushBloco(porChave.comercial)
  if (porRes.ebitda) {
    linhas.push({ tipo: 'resultado', descricao: 'EBITDA', valor: porRes.ebitda.valor })
    linhas.push({ tipo: 'margem', descricao: 'Margem EBITDA', valor: porRes.ebitda.margem ?? null })
  }

  pushBloco(porChave.financeiras)
  if (porRes.lucro_liquido) {
    linhas.push({ tipo: 'resultado', descricao: 'Lucro Líquido', valor: porRes.lucro_liquido.valor })
    linhas.push({ tipo: 'margem', descricao: 'Margem Líquida', valor: porRes.lucro_liquido.margem ?? null })
  }

  return linhas
}

export default function DrePage() {
  const [inicio, setInicio]   = useState(primeiroDiaMesAtual)
  const [fim, setFim]         = useState(ultimoDiaMesAtual)
  const [dados, setDados]     = useState<DreResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [exportando, setExportando] = useState(false)

  const carregar = useCallback(async (ini: string, f: string) => {
    if (!ini || !f || ini > f) return
    setLoading(true)
    try {
      const res = await fetch(`/api/gerencial/dre?inicio=${ini}&fim=${f}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json.erro || 'Erro ao carregar o DRE'); return }
      setDados(json)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar(inicio, fim) }, [])

  const linhas = useMemo(() => dados ? montarLinhas(dados) : [], [dados])

  async function exportarExcel() {
    if (!dados || linhas.length === 0) return
    setExportando(true)
    try {
      const XLSX = await import('xlsx')
      const aoa: (string | number)[][] = [['Categoria', 'Valor (R$)']]
      for (const l of linhas) {
        aoa.push([
          l.descricao,
          l.tipo === 'margem' ? (l.valor === null ? '' : `${(l.valor * 100).toFixed(1)}%`) : Number(l.valor ?? 0),
        ])
      }
      const planilha = XLSX.utils.aoa_to_sheet(aoa)
      planilha['!cols'] = [{ wch: 34 }, { wch: 16 }]
      const livro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(livro, planilha, 'DRE')
      XLSX.writeFile(livro, `dre_${dados.inicio}_a_${dados.fim}.xlsx`)
    } catch {
      toast.error('Erro ao exportar para Excel')
    } finally {
      setExportando(false)
    }
  }

  function aplicarPeriodo() {
    carregar(inicio, fim)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">DRE Gerencial</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            Demonstração de resultado do período — receita bruta, custos, despesas e margens
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="date"
              value={inicio}
              max={fim || undefined}
              onChange={e => setInicio(e.target.value)}
              style={{
                fontSize: 12, padding: '5px 8px', borderRadius: 6,
                border: '1px solid var(--borda-suave)', background: 'var(--bg-card)',
                color: 'var(--texto-principal)',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>até</span>
            <input
              type="date"
              value={fim}
              min={inicio || undefined}
              onChange={e => setFim(e.target.value)}
              style={{
                fontSize: 12, padding: '5px 8px', borderRadius: 6,
                border: '1px solid var(--borda-suave)', background: 'var(--bg-card)',
                color: 'var(--texto-principal)',
              }}
            />
            <button
              onClick={aplicarPeriodo}
              disabled={!inicio || !fim || inicio > fim}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, background: 'var(--cor-primaria)', color: '#fff',
                opacity: (!inicio || !fim || inicio > fim) ? 0.5 : 1,
              }}
            >
              Aplicar
            </button>
          </div>
          <button className="btn-ghost" onClick={exportarExcel} disabled={exportando || !dados || linhas.length === 0}>
            {exportando ? <Loader2 size={15} className="spin" /> : <FileSpreadsheet size={15} />}
            Exportar Excel
          </button>
        </div>
      </div>

      <div className="page-body">
        {loading && !dados && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--texto-terciario)', gap: 8 }}>
            <Loader2 size={16} className="spin" /> Carregando DRE...
          </div>
        )}

        {dados && (
          <div className="card" style={{ overflow: 'hidden', maxWidth: 560, opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <FileBarChart size={15} style={{ color: 'var(--cor-primaria)' }} />
                <span className="card-title">{dados.empresa_nome || 'DRE'}</span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
                {dados.inicio.split('-').reverse().join('/')} a {dados.fim.split('-').reverse().join('/')} · valores em R$
              </span>
            </div>
            <div className="table-wrapper">
              <table className="table-base" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 12px' }}>Categoria</th>
                    <th style={{ padding: '6px 12px', textAlign: 'right', minWidth: 130 }}>Valor do Período</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 && (
                    <tr><td colSpan={2} style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)' }}>
                      Nenhum lançamento no período
                    </td></tr>
                  )}
                  {linhas.map((l, i) => {
                    const destaque = l.tipo === 'bloco' || l.tipo === 'resultado'
                    return (
                      <tr key={`${l.descricao}-${i}`} style={destaque ? { background: 'var(--bg-page)' } : undefined}>
                        <td style={{
                          padding: '3px 12px',
                          fontWeight: destaque ? 700 : 400,
                          fontStyle: l.tipo === 'margem' ? 'italic' : 'normal',
                          paddingLeft: l.tipo === 'item' ? 24 : 12,
                          color: l.tipo === 'item' ? 'var(--texto-secundario)' : 'var(--texto-principal)',
                        }}>
                          {l.descricao}
                        </td>
                        <td style={{
                          padding: '3px 12px',
                          textAlign: 'right', fontFamily: 'var(--fonte-mono)',
                          fontWeight: destaque ? 700 : 400,
                          color: l.tipo === 'margem'
                            ? 'var(--cor-primaria)'
                            : (l.valor < 0 ? 'var(--cor-erro)' : 'var(--texto-principal)'),
                        }}>
                          {l.tipo === 'margem' ? fmtPct(l.valor) : (l.valor ? fmtNum(l.valor) : '–')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
