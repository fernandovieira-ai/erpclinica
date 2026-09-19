// Relatório impresso "Pacientes pelo tipo de atendimento" (Fechamento Diário).
// Colunas: Paciente / Categoria / Dt. Visita / Médico / Vlr. Pagar / Vlr. Pago / Forma de Pgto /
// Atendimento, com opção de agrupar por médico (subtotal por médico) e total geral no fim.
// Agrupado = A4 retrato; lista única (com a coluna Médico) = A4 paisagem.
// Layout COMPACTO de propósito: cabeçalho de uma faixa, filtros numa linha, fonte pequena e linhas justas,
// pra caber o máximo de atendimentos por página.
// Identidade visual, cabeçalho e helpers vêm de relatorioImpressaoBase.ts (compartilhado com o relatório de exames).

import {
  esc, brl, dataBR, semTitulo, logoSegura, paraCss, celulaFormaHtml, fonteDosTotais, dadosDeEmissao,
  cssBase, cabecalhoHtml, filtrosHtml, rodapeDaPagina, periodoTexto,
} from './relatorioImpressaoBase'

export interface ItemRelatorioAtendimento {
  id:                number
  paciente_nome:     string
  categoria:         string | null
  data_visita:       string          // DD/MM/YYYY
  hora_visita:       string          // HH:MM
  profissional_id:   number
  profissional_nome: string
  tipo_descricao:    string | null
  pago:              boolean
  forma_pagamento:   string | null   // descrição da condição (+ "3x" no crédito parcelado); null = sem pagamento
  tipo_pagamento:    string | null   // dinheiro | pix | debito | credito | a_prazo
  valor_pagar:       number
  valor_pago:        number
}

export interface OpcoesRelatorioAtendimento {
  inicio:           string           // YYYY-MM-DD
  fim:              string           // YYYY-MM-DD
  medicoNome:       string | null    // null = todos
  categoriaNome:    string | null    // null = todas
  agruparPorMedico: boolean
  empresaNome:      string
  empresaLogo:      string | null    // data URL
  emitidoPor:       string
}

function somar(itens: ItemRelatorioAtendimento[]) {
  return itens.reduce(
    (acc, i) => ({ qtd: acc.qtd + 1, pagar: acc.pagar + i.valor_pagar, pago: acc.pago + i.valor_pago }),
    { qtd: 0, pagar: 0, pago: 0 },
  )
}

const rotuloQtd = (n: number) => `${n} atendimento${n === 1 ? '' : 's'}`

function agruparPorMedicoOrdenado(itens: ItemRelatorioAtendimento[]) {
  const grupos = new Map<number, { nome: string; itens: ItemRelatorioAtendimento[] }>()
  for (const i of itens) {
    const g = grupos.get(i.profissional_id) ?? { nome: i.profissional_nome, itens: [] }
    g.itens.push(i)
    grupos.set(i.profissional_id, g)
  }
  return [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function gerarHtmlRelatorioAtendimentos(
  itens: ItemRelatorioAtendimento[],
  op: OpcoesRelatorioAtendimento,
): string {
  const comColunaMedico = !op.agruparPorMedico
  const totalColunas    = comColunaMedico ? 8 : 7
  // colunas antes de "Vlr. Pagar": Paciente, Categoria, Dt. Visita (+ Médico)
  const colunasAntesValores = comColunaMedico ? 4 : 3

  const linhaItem = (i: ItemRelatorioAtendimento) => `
      <tr>
        <td class="paciente">${esc(i.paciente_nome)}</td>
        <td>${esc(i.categoria ?? '')}</td>
        <td class="nowrap">${esc(i.data_visita)}</td>
        ${comColunaMedico ? `<td>${esc(semTitulo(i.profissional_nome))}</td>` : ''}
        <td class="num">${brl(i.valor_pagar)}</td>
        <td class="num ${i.valor_pago > 0 ? 'pago' : 'zero'}">${brl(i.valor_pago)}</td>
        <td>${celulaFormaHtml(i)}</td>
        <td>${esc(i.tipo_descricao ?? '')}</td>
      </tr>`

  const linhaTotal = (rotulo: string, t: { pagar: number; pago: number }, classe: string) => `
      <tr class="${classe}">
        <td colspan="${colunasAntesValores}" class="rotulo">${esc(rotulo)}</td>
        <td class="num">${brl(t.pagar)}</td>
        <td class="num">${brl(t.pago)}</td>
        <td colspan="2"></td>
      </tr>`

  let corpo = ''
  if (op.agruparPorMedico) {
    for (const g of agruparPorMedicoOrdenado(itens)) {
      const t = somar(g.itens)
      corpo += `
      <tr class="grupo"><td colspan="${totalColunas}">Médico: ${esc(g.nome)}<span class="grupo-qtd">${esc(rotuloQtd(t.qtd))}</span></td></tr>
      ${g.itens.map(linhaItem).join('')}
      ${linhaTotal(`Subtotal - ${rotuloQtd(t.qtd)}`, t, 'subtotal')}`
    }
  } else {
    corpo = itens.map(linhaItem).join('')
  }

  const geral = somar(itens)
  corpo += linhaTotal(`TOTAL GERAL - ${rotuloQtd(geral.qtd)}`, geral, 'total')

  // Resumo por médico só faz sentido agrupado e com mais de um médico
  let resumoMedico = ''
  if (op.agruparPorMedico) {
    const lista = agruparPorMedicoOrdenado(itens)
    if (lista.length > 1) {
      resumoMedico = `
  <div class="resumo">
    <div class="resumo-titulo">Resumo por médico</div>
    <table>
      <thead><tr><th>Médico</th><th class="num">Atendimentos</th><th class="num">Vlr. Pagar</th><th class="num">Vlr. Pago</th></tr></thead>
      <tbody>
        ${lista.map(g => { const t = somar(g.itens); return `<tr><td>${esc(g.nome)}</td><td class="num">${t.qtd}</td><td class="num">${brl(t.pagar)}</td><td class="num pago">${brl(t.pago)}</td></tr>` }).join('')}
        <tr class="total"><td>Total geral</td><td class="num">${geral.qtd}</td><td class="num">${brl(geral.pagar)}</td><td class="num">${brl(geral.pago)}</td></tr>
      </tbody>
    </table>
  </div>`
    }
  }

  // ── Cabeçalho / rodapé ─────────────────────────────────────────────────────
  const periodo = periodoTexto(op.inicio, op.fim)
  const emissao = dadosDeEmissao()
  const logo    = logoSegura(op.empresaLogo)

  // Papel por modo: AGRUPADO sai em A4 RETRATO (sem a coluna Médico as 7 colunas cabem e a página tem ~46% mais altura);
  // LISTA ÚNICA sai em A4 PAISAGEM (com a coluna Médico, no retrato "JOSE VICENTE TONIN / JUNIOR" e "CONSULTA /
  // CARDIOLOGICA" quebram em 2 linhas e o ganho some — medido: 34 linhas/página no retrato, igual à paisagem antiga).
  const papel = op.agruparPorMedico ? 'A4 portrait' : 'A4 landscape'

  // Larguras — somam 100% nos dois modos; table-layout fixo pra as colunas não "dançarem".
  // Nome quebrado em 2 linhas dobra a altura da linha: Paciente e Médico precisam de largura folgada.
  const W = comColunaMedico
    ? { pac: 21, cat: 11, dt: 7.5, med: 17.5, pagar: 7.5, pago: 7.5, forma: 10.5, atend: 17.5 }  // paisagem
    : { pac: 23, cat: 13, dt: 8.5, med: 0, pagar: 10.5, pago: 10.5, forma: 11.5, atend: 23 }     // retrato

  const css = cssBase({
    papel,
    rodapeEsq:    rodapeDaPagina(emissao, op.emitidoPor, periodo),
    rodapeCentro: paraCss(op.empresaNome),
    fonteTotais:  fonteDosTotais(geral.pagar, geral.pago),
  })

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>&nbsp;</title>
<style>
${css}
</style>
</head>
<body>
  ${cabecalhoHtml({ empresaNome: op.empresaNome, logo, titulo: 'Emissão de Relatórios', subtitulo: 'Pacientes pelo tipo de atendimento', emissao, emitidoPor: op.emitidoPor })}

  ${filtrosHtml([
    { k: 'Médico',      v: op.medicoNome || 'Todos os médicos' },
    { k: 'Categoria',   v: op.categoriaNome || '<Todas>' },
    { k: 'Período',     v: `${dataBR(op.inicio)} até ${dataBR(op.fim)}` },
    { k: 'Agrupamento', v: op.agruparPorMedico ? 'Por médico' : 'Lista única' },
  ])}

  <table>
    <thead>
      <tr>
        <th style="width:${W.pac}%">Paciente</th>
        <th style="width:${W.cat}%">Categoria</th>
        <th style="width:${W.dt}%">Dt. Visita</th>
        ${comColunaMedico ? `<th style="width:${W.med}%">Médico</th>` : ''}
        <th class="num" style="width:${W.pagar}%">Vlr. Pagar</th>
        <th class="num" style="width:${W.pago}%">Vlr. Pago</th>
        <th style="width:${W.forma}%">Forma de Pgto</th>
        <th style="width:${W.atend}%">Atendimento</th>
      </tr>
    </thead>
    <tbody>${corpo}
    </tbody>
  </table>
  ${resumoMedico}
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`
}
