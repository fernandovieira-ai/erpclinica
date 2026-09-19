// Relatório impresso "Exames pelo médico executante" (Fechamento Diário).
// Mesmo desenho do "Pacientes pelo tipo de atendimento" (identidade visual e cabeçalho vêm de relatorioImpressaoBase.ts),
// mas só de EXAMES (tipos com eh_exame) e organizado pelo médico que EXECUTOU o exame, mostrando também o solicitante.
// Colunas: Paciente / Categoria / Exame / [Executante] / Solicitante / Dt. Visita / Vlr. Pagar / Vlr. Pago / Forma de Pgto.
// Agrupado por executante = A4 retrato (sem a coluna Executante); lista única = A4 paisagem (com ela).
// Exame ainda não recebido no "médico da clínica" (placeholder) não tem executante: cai no grupo "Executante a definir",
// sempre por último, em âmbar. Regras de quem é o executante: padroes §22 e a rota relatorio-exames.

import {
  esc, brl, dataBR, semTitulo, logoSegura, paraCss, celulaFormaHtml, fonteDosTotais, dadosDeEmissao,
  cssBase, cabecalhoHtml, filtrosHtml, rodapeDaPagina, periodoTexto,
} from './relatorioImpressaoBase'

export interface ItemRelatorioExame {
  id:                   number
  paciente_nome:        string
  categoria:            string | null
  data_visita:          string          // DD/MM/YYYY
  hora_visita:          string          // HH:MM
  executante_id:        number
  executante_nome:      string
  executante_a_definir: boolean         // agendado no médico da clínica e ainda não recebido
  solicitante_nome:     string | null
  exame:                string
  pago:                 boolean
  forma_pagamento:      string | null
  tipo_pagamento:       string | null   // dinheiro | pix | debito | credito | a_prazo
  valor_pagar:          number
  valor_pago:           number
}

export interface OpcoesRelatorioExame {
  inicio:               string           // YYYY-MM-DD
  fim:                  string           // YYYY-MM-DD
  executanteNome:       string | null    // null = todos
  exameNome:            string | null    // null = todos
  categoriaNome:        string | null    // null = todas
  agruparPorExecutante: boolean
  empresaNome:          string
  empresaLogo:          string | null    // data URL
  emitidoPor:           string
}

function somar(itens: ItemRelatorioExame[]) {
  return itens.reduce(
    (acc, i) => ({ qtd: acc.qtd + 1, pagar: acc.pagar + i.valor_pagar, pago: acc.pago + i.valor_pago }),
    { qtd: 0, pagar: 0, pago: 0 },
  )
}

const rotuloQtd = (n: number) => `${n} exame${n === 1 ? '' : 's'}`

interface Grupo { nome: string; aDefinir: boolean; itens: ItemRelatorioExame[] }

// Um grupo por executante (ordem alfabética); todos os "a definir" juntos num só, sempre por último.
function agruparPorExecutanteOrdenado(itens: ItemRelatorioExame[]): Grupo[] {
  const grupos = new Map<number, Grupo>()
  const aDefinir: Grupo = { nome: 'Executante a definir', aDefinir: true, itens: [] }
  for (const i of itens) {
    if (i.executante_a_definir) { aDefinir.itens.push(i); continue }
    const g = grupos.get(i.executante_id) ?? { nome: i.executante_nome, aDefinir: false, itens: [] }
    g.itens.push(i)
    grupos.set(i.executante_id, g)
  }
  const lista = [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  if (aDefinir.itens.length) lista.push(aDefinir)
  return lista
}

export function gerarHtmlRelatorioExames(itens: ItemRelatorioExame[], op: OpcoesRelatorioExame): string {
  const comColunaExecutante = !op.agruparPorExecutante
  const totalColunas        = comColunaExecutante ? 9 : 8
  // colunas antes de "Vlr. Pagar": Paciente, Categoria, Exame, (Executante,) Solicitante, Dt. Visita
  const colunasAntesValores = comColunaExecutante ? 6 : 5

  const celulaExecutante = (i: ItemRelatorioExame) =>
    i.executante_a_definir ? '<span class="adefinir-txt">A definir</span>' : esc(semTitulo(i.executante_nome))

  const linhaItem = (i: ItemRelatorioExame) => `
      <tr>
        <td class="paciente">${esc(i.paciente_nome)}</td>
        <td>${esc(i.categoria ?? '')}</td>
        <td>${esc(i.exame)}</td>
        ${comColunaExecutante ? `<td>${celulaExecutante(i)}</td>` : ''}
        <td>${i.solicitante_nome ? esc(semTitulo(i.solicitante_nome)) : '<span class="zero">-</span>'}</td>
        <td class="nowrap">${esc(i.data_visita)}</td>
        <td class="num">${brl(i.valor_pagar)}</td>
        <td class="num ${i.valor_pago > 0 ? 'pago' : 'zero'}">${brl(i.valor_pago)}</td>
        <td>${celulaFormaHtml(i)}</td>
      </tr>`

  const linhaTotal = (rotulo: string, t: { pagar: number; pago: number }, classe: string) => `
      <tr class="${classe}">
        <td colspan="${colunasAntesValores}" class="rotulo">${esc(rotulo)}</td>
        <td class="num">${brl(t.pagar)}</td>
        <td class="num">${brl(t.pago)}</td>
        <td></td>
      </tr>`

  const grupos = op.agruparPorExecutante ? agruparPorExecutanteOrdenado(itens) : []

  let corpo = ''
  if (op.agruparPorExecutante) {
    for (const g of grupos) {
      const t = somar(g.itens)
      const titulo = g.aDefinir ? 'Executante a definir (exame ainda não recebido)' : `Executante: ${g.nome}`
      corpo += `
      <tr class="grupo${g.aDefinir ? ' adefinir' : ''}"><td colspan="${totalColunas}">${esc(titulo)}<span class="grupo-qtd">${esc(rotuloQtd(t.qtd))}</span></td></tr>
      ${g.itens.map(linhaItem).join('')}
      ${linhaTotal(`Subtotal - ${rotuloQtd(t.qtd)}`, t, 'subtotal')}`
    }
  } else {
    corpo = itens.map(linhaItem).join('')
  }

  const geral = somar(itens)
  corpo += linhaTotal(`TOTAL GERAL - ${rotuloQtd(geral.qtd)}`, geral, 'total')

  // Resumo por executante: só agrupado e com mais de um grupo
  let resumo = ''
  if (op.agruparPorExecutante && grupos.length > 1) {
    resumo = `
  <div class="resumo">
    <div class="resumo-titulo">Resumo por médico executante</div>
    <table>
      <thead><tr><th>Executante</th><th class="num">Exames</th><th class="num">Vlr. Pagar</th><th class="num">Vlr. Pago</th></tr></thead>
      <tbody>
        ${grupos.map(g => { const t = somar(g.itens); return `<tr><td>${g.aDefinir ? '<span class="adefinir-txt">A definir</span>' : esc(g.nome)}</td><td class="num">${t.qtd}</td><td class="num">${brl(t.pagar)}</td><td class="num pago">${brl(t.pago)}</td></tr>` }).join('')}
        <tr class="total"><td>Total geral</td><td class="num">${geral.qtd}</td><td class="num">${brl(geral.pagar)}</td><td class="num">${brl(geral.pago)}</td></tr>
      </tbody>
    </table>
  </div>`
  }

  const temADefinir = itens.some(i => i.executante_a_definir)
  const nota = temADefinir
    ? '<div class="nota">Executante a definir: o exame foi agendado no médico da clínica e ainda não foi recebido. O médico que executou é informado no recebimento; depois disso o exame passa para o grupo dele.</div>'
    : ''

  // ── Cabeçalho / rodapé ─────────────────────────────────────────────────────
  const periodo = periodoTexto(op.inicio, op.fim)
  const emissao = dadosDeEmissao()
  const logo    = logoSegura(op.empresaLogo)

  // Larguras — somam 100% nos dois modos; table-layout fixo. Retrato: valores com 10,5% (a linha de total é negrito e
  // "R$ 6.500,00" cola em coluna mais estreita — ver fonteDosTotais). Nome de exame é longo e pode quebrar em 2 linhas.
  const papel = op.agruparPorExecutante ? 'A4 portrait' : 'A4 landscape'
  const W = comColunaExecutante
    ? { pac: 15, cat: 10, exame: 16.5, exec: 13, sol: 13, dt: 6.5, pagar: 7.5, pago: 7.5, forma: 11 }         // paisagem
    : { pac: 18.5, cat: 11, exame: 18, exec: 0, sol: 12, dt: 7.5, pagar: 10.5, pago: 10.5, forma: 12 }     // retrato

  const css = cssBase({
    papel,
    rodapeEsq:    rodapeDaPagina(emissao, op.emitidoPor, periodo),
    rodapeCentro: paraCss(op.empresaNome),
    fonteTotais:  fonteDosTotais(geral.pagar, geral.pago),
  }) + `

  /* Específico do relatório de exames: grupo/linha "a definir" em âmbar (mesma cor da etiqueta A PRAZO) */
  tr.grupo.adefinir td { background:#FCEFD9; color:#93540A; border-left-color:#D98E1F; border-bottom-color:#efd2a3; }
  tr.grupo.adefinir .grupo-qtd { color:#93540A; }
  .adefinir-txt { color:#93540A; font-style:italic; font-weight:600; }
  .nota { margin-top:6px; font-size:6.6pt; color:#6b6b66; font-style:italic; padding-left:6px; border-left:2px solid #D98E1F; page-break-inside:avoid; break-inside:avoid; }`

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
  ${cabecalhoHtml({ empresaNome: op.empresaNome, logo, titulo: 'Emissão de Relatórios', subtitulo: 'Exames pelo médico executante', emissao, emitidoPor: op.emitidoPor })}

  ${filtrosHtml([
    { k: 'Executante',  v: op.executanteNome || 'Todos os médicos' },
    { k: 'Exame',       v: op.exameNome || 'Todos os exames' },
    { k: 'Categoria',   v: op.categoriaNome || '<Todas>' },
    { k: 'Período',     v: `${dataBR(op.inicio)} até ${dataBR(op.fim)}` },
    { k: 'Agrupamento', v: op.agruparPorExecutante ? 'Por executante' : 'Lista única' },
  ])}

  <table>
    <thead>
      <tr>
        <th style="width:${W.pac}%">Paciente</th>
        <th style="width:${W.cat}%">Categoria</th>
        <th style="width:${W.exame}%">Exame</th>
        ${comColunaExecutante ? `<th style="width:${W.exec}%">Executante</th>` : ''}
        <th style="width:${W.sol}%">Solicitante</th>
        <th style="width:${W.dt}%">Dt. Visita</th>
        <th class="num" style="width:${W.pagar}%">Vlr. Pagar</th>
        <th class="num" style="width:${W.pago}%">Vlr. Pago</th>
        <th style="width:${W.forma}%">Forma de Pgto</th>
      </tr>
    </thead>
    <tbody>${corpo}
    </tbody>
  </table>
  ${resumo}
  ${nota}
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`
}
