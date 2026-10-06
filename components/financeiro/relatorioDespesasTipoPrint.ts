// Relatório impresso "Despesas por Tipo (Sintético/Analítico)" (módulo Financeiro > Despesas).
// 3 níveis: sintético (grupo do plano de contas, ex. "(SG&A) DESPESAS") -> analítico (ex. "ALUGUEL
// CLINICA") -> lançamentos individuais. Subtotal por analítico, subtotal reforçado por sintético,
// total geral no fim. Identidade visual, cabeçalho e helpers vêm de relatorioImpressaoBase.ts
// (compartilhado com os relatórios do Fechamento Diário — mexeu na base, confira os três).

import {
  esc, brl, dataBR, logoSegura, paraCss, fonteDosTotais, dadosDeEmissao,
  cssBase, cabecalhoHtml, filtrosHtml, rodapeDaPagina, periodoTexto,
} from '../gerencial/relatorioImpressaoBase'

export interface ItemRelatorioDespesa {
  id:            number
  data_despesa:  string          // YYYY-MM-DD
  documento:     string | null
  observacao:    string | null
  pessoa_nome:   string | null
  valor:         number
  status:        string
}

export interface AnaliticoRelatorioDespesa {
  id:          number
  codigo:      string
  descricao:   string
  qtd:         number
  total:       number
  itens:       ItemRelatorioDespesa[]
}

export interface SinteticoRelatorioDespesa {
  id:          number
  codigo:      string
  descricao:   string
  qtd:         number
  total:       number
  analiticos:  AnaliticoRelatorioDespesa[]
}

export interface OpcoesRelatorioDespesa {
  inicio:       string | null   // null = sem filtro de período (traz todo o histórico)
  fim:          string | null
  buscaTexto:   string | null
  empresaNome:  string
  empresaLogo:  string | null
  emitidoPor:   string
}

const rotuloQtd = (n: number) => `${n} lançamento${n === 1 ? '' : 's'}`

// Estilos específicos deste relatório (3º nível de hierarquia visual que a base não cobre).
const CSS_EXTRA = `
  tr.subgrupo td { background:#F3F7F6; color:#0B3A35; font-weight:700; font-size:7pt;
                   border-left:3px solid #6ea89f; padding:2px 6px 2px 16px; break-after:avoid; }
  .subgrupo-qtd { float:right; font-weight:600; font-size:6.6pt; color:#4b6a64; }
  tr.item td { padding-left:20px; }
  tr.subtotal-analitico td { background:#eef4f3; font-weight:700; border-top:1px solid #c4d8d4; border-bottom:1px solid #c4d8d4; }
  tr.subtotal-analitico .rotulo { text-align:right; padding-right:8px; }
  tr.subtotal-sintetico td { background:#CFE4DF; color:#0B3A35; font-weight:800; border-top:1.5px solid #12857A; border-bottom:1.5px solid #12857A; }
  tr.subtotal-sintetico .rotulo { text-align:right; padding-right:8px; }
`

export function gerarHtmlRelatorioDespesasTipo(
  grupos: SinteticoRelatorioDespesa[],
  op: OpcoesRelatorioDespesa,
): string {
  const linhaItem = (i: ItemRelatorioDespesa) => `
      <tr class="item">
        <td class="nowrap">${esc(dataBR(i.data_despesa))}</td>
        <td>${esc(i.pessoa_nome ?? '')}</td>
        <td class="nowrap">${esc(i.documento ?? '')}</td>
        <td>${esc(i.observacao ?? '')}</td>
        <td class="num">${brl(i.valor)}</td>
      </tr>`

  const linhaSubtotalAnalitico = (a: AnaliticoRelatorioDespesa) => `
      <tr class="subtotal-analitico">
        <td colspan="4" class="rotulo">Subtotal ${esc(a.codigo)} - ${esc(a.descricao)} (${esc(rotuloQtd(a.qtd))})</td>
        <td class="num">${brl(a.total)}</td>
      </tr>`

  const linhaSubtotalSintetico = (s: SinteticoRelatorioDespesa) => `
      <tr class="subtotal-sintetico">
        <td colspan="4" class="rotulo">TOTAL ${esc(s.codigo)} - ${esc(s.descricao)} (${esc(rotuloQtd(s.qtd))})</td>
        <td class="num">${brl(s.total)}</td>
      </tr>`

  let corpo = ''
  for (const s of grupos) {
    corpo += `
      <tr class="grupo"><td colspan="5">${esc(s.codigo)} — ${esc(s.descricao)}<span class="grupo-qtd">${esc(rotuloQtd(s.qtd))} · ${brl(s.total)}</span></td></tr>`
    for (const a of s.analiticos) {
      corpo += `
      <tr class="subgrupo"><td colspan="5">${esc(a.codigo)} — ${esc(a.descricao)}<span class="subgrupo-qtd">${esc(rotuloQtd(a.qtd))}</span></td></tr>
      ${a.itens.map(linhaItem).join('')}
      ${linhaSubtotalAnalitico(a)}`
    }
    corpo += linhaSubtotalSintetico(s)
  }

  const geralQtd   = grupos.reduce((acc, s) => acc + s.qtd, 0)
  const geralTotal = grupos.reduce((acc, s) => acc + s.total, 0)
  corpo += `
      <tr class="total">
        <td colspan="4" class="rotulo">TOTAL GERAL - ${esc(rotuloQtd(geralQtd))}</td>
        <td class="num">${brl(geralTotal)}</td>
      </tr>`

  // Resumo por sintético (só no fim, com 2+ grupos)
  let resumoSintetico = ''
  if (grupos.length > 1) {
    resumoSintetico = `
  <div class="resumo">
    <div class="resumo-titulo">Resumo por tipo (sintético)</div>
    <table>
      <thead><tr><th>Tipo</th><th class="num">Lançamentos</th><th class="num">Valor</th></tr></thead>
      <tbody>
        ${grupos.map((s) => `<tr><td>${esc(s.codigo)} — ${esc(s.descricao)}</td><td class="num">${s.qtd}</td><td class="num pago">${brl(s.total)}</td></tr>`).join('')}
        <tr class="total"><td>Total geral</td><td class="num">${geralQtd}</td><td class="num">${brl(geralTotal)}</td></tr>
      </tbody>
    </table>
  </div>`
  }

  const periodo = op.inicio && op.fim ? periodoTexto(op.inicio, op.fim) : 'Todos os lançamentos'
  const emissao = dadosDeEmissao()
  const logo    = logoSegura(op.empresaLogo)

  const css = cssBase({
    papel: 'A4 portrait',
    rodapeEsq:    rodapeDaPagina(emissao, op.emitidoPor, periodo),
    rodapeCentro: paraCss(op.empresaNome),
    fonteTotais:  fonteDosTotais(geralTotal, geralTotal),
  })

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>&nbsp;</title>
<style>
${css}
${CSS_EXTRA}
</style>
</head>
<body>
  ${cabecalhoHtml({ empresaNome: op.empresaNome, logo, titulo: 'Despesas por Tipo', subtitulo: 'Sintético e analítico, conforme o plano de contas', emissao, emitidoPor: op.emitidoPor })}

  ${filtrosHtml([
    { k: 'Período', v: op.inicio && op.fim ? `${dataBR(op.inicio)} até ${dataBR(op.fim)}` : 'Todos os lançamentos' },
    { k: 'Busca',   v: op.buscaTexto || '<Todos>' },
  ])}

  <table>
    <thead>
      <tr>
        <th style="width:10%">Data</th>
        <th style="width:26%">Fornecedor</th>
        <th style="width:14%">Documento</th>
        <th style="width:36%">Observação</th>
        <th class="num" style="width:14%">Valor</th>
      </tr>
    </thead>
    <tbody>${corpo}
    </tbody>
  </table>
  ${resumoSintetico}
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`
}
