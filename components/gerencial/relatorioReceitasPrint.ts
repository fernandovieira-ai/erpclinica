// Relatório impresso "Receitas" (módulo Gerencial). Lançamento a lançamento (1 linha por recebimento
// pago), com resumo por forma de pagamento no fim. Identidade visual e helpers vêm de
// relatorioImpressaoBase.ts (compartilhado com Fechamento Diário e Despesas por Tipo).

import {
  esc, brl, dataBR, logoSegura, paraCss, fonteDosTotais, dadosDeEmissao,
  cssBase, cabecalhoHtml, filtrosHtml, rodapeDaPagina, periodoTexto,
} from './relatorioImpressaoBase'

export interface ItemRelatorioReceita {
  id:                      number
  data_recebimento:        string   // YYYY-MM-DD
  paciente_nome:           string | null
  executante_nome:         string | null
  solicitante_nome:        string | null
  procedimento:            string | null
  forma_pagamento:         string | null
  qtd_parcelas:            number | null
  valor_taxa:              number
  valor_bruto:             number
  valor_liquido:           number
  valor_profissional:      number
  valor_clinica:           number
}

export interface ResumoPorFormaReceita {
  forma_pagamento: string
  qtd:             number
  valor_bruto:     number
}

export interface OpcoesRelatorioReceita {
  inicio:       string | null   // null = sem filtro de período (traz todo o histórico)
  fim:          string | null
  buscaTexto:   string | null
  empresaNome:  string
  empresaLogo:  string | null
  emitidoPor:   string
}

const rotuloQtd = (n: number) => `${n} atendimento${n === 1 ? '' : 's'}`

const CSS_EXTRA = `
  .resumo table { width:100%; }
`

export function gerarHtmlRelatorioReceitas(
  itens: ItemRelatorioReceita[],
  porForma: ResumoPorFormaReceita[],
  op: OpcoesRelatorioReceita,
): string {
  const linhaItem = (i: ItemRelatorioReceita) => `
      <tr>
        <td class="nowrap">${esc(dataBR(i.data_recebimento))}</td>
        <td class="paciente">${esc(i.paciente_nome ?? '')}</td>
        <td>${esc(i.procedimento ?? '')}</td>
        <td>${esc(i.executante_nome ?? '')}</td>
        <td>${esc(i.solicitante_nome ?? '—')}</td>
        <td class="nowrap">${esc(i.forma_pagamento ?? '—')}${i.qtd_parcelas && i.qtd_parcelas > 1 ? ` ${i.qtd_parcelas}x` : ''}</td>
        <td class="num">${i.valor_taxa > 0 ? brl(i.valor_taxa) : '—'}</td>
        <td class="num">${brl(i.valor_bruto)}</td>
        <td class="num">${brl(i.valor_profissional)}</td>
        <td class="num pago">${brl(i.valor_clinica)}</td>
      </tr>`

  const corpo = itens.map(linhaItem).join('')

  const geralQtd        = itens.length
  const geralBruto       = itens.reduce((acc, i) => acc + i.valor_bruto, 0)
  const geralTaxas       = itens.reduce((acc, i) => acc + i.valor_taxa, 0)
  const geralProfissional = itens.reduce((acc, i) => acc + i.valor_profissional, 0)
  const geralClinica      = itens.reduce((acc, i) => acc + i.valor_clinica, 0)

  const linhaTotal = `
      <tr class="total">
        <td colspan="6" class="rotulo">TOTAL GERAL - ${esc(rotuloQtd(geralQtd))}</td>
        <td class="num">${brl(geralTaxas)}</td>
        <td class="num">${brl(geralBruto)}</td>
        <td class="num">${brl(geralProfissional)}</td>
        <td class="num">${brl(geralClinica)}</td>
      </tr>`

  const resumoForma = porForma.length > 0 ? `
  <div class="resumo">
    <div class="resumo-titulo">Resumo por forma de pagamento</div>
    <table>
      <thead><tr><th>Forma</th><th class="num">Atendimentos</th><th class="num">Valor bruto</th></tr></thead>
      <tbody>
        ${porForma.map((f) => `<tr><td>${esc(f.forma_pagamento)}</td><td class="num">${f.qtd}</td><td class="num pago">${brl(f.valor_bruto)}</td></tr>`).join('')}
        <tr class="total"><td>Total geral</td><td class="num">${geralQtd}</td><td class="num">${brl(geralBruto)}</td></tr>
      </tbody>
    </table>
  </div>` : ''

  const periodo = op.inicio && op.fim ? periodoTexto(op.inicio, op.fim) : 'Todos os lançamentos'
  const emissao = dadosDeEmissao()
  const logo    = logoSegura(op.empresaLogo)

  const css = cssBase({
    papel: 'A4 landscape',
    rodapeEsq:    rodapeDaPagina(emissao, op.emitidoPor, periodo),
    rodapeCentro: paraCss(op.empresaNome),
    fonteTotais:  fonteDosTotais(geralBruto, geralBruto),
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
  ${cabecalhoHtml({ empresaNome: op.empresaNome, logo, titulo: 'Receitas', subtitulo: 'Lançamento a lançamento, com repasse profissional x clínica', emissao, emitidoPor: op.emitidoPor })}

  ${filtrosHtml([
    { k: 'Período', v: op.inicio && op.fim ? `${dataBR(op.inicio)} até ${dataBR(op.fim)}` : 'Todos os lançamentos' },
    { k: 'Busca',   v: op.buscaTexto || '<Todos>' },
  ])}

  <table>
    <thead>
      <tr>
        <th style="width:8%">Data</th>
        <th style="width:17%">Paciente</th>
        <th style="width:15%">Procedimento</th>
        <th style="width:13%">Executante</th>
        <th style="width:13%">Solicitante</th>
        <th style="width:10%">Forma pagto.</th>
        <th class="num" style="width:8%">Taxa</th>
        <th class="num" style="width:8%">Bruto</th>
        <th class="num" style="width:8%">Repasse</th>
        <th class="num" style="width:8%">Clínica</th>
      </tr>
    </thead>
    <tbody>${corpo}
    ${linhaTotal}
    </tbody>
  </table>
  ${resumoForma}
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`
}
