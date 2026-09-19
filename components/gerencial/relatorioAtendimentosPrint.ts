// Relatório impresso "Pacientes pelo tipo de atendimento" (Fechamento Diário).
// Colunas: Paciente / Telefone / Categoria / Dt. Visita / Médico / Vlr. Pagar / Vlr. Pago / Forma de Pgto /
// Atendimento, em A4 paisagem, com opção de agrupar por médico (subtotal por médico) e total geral no fim.
// Layout COMPACTO de propósito: cabeçalho de uma faixa, filtros numa linha, fonte pequena e linhas justas,
// pra caber o máximo de atendimentos por página.

export interface ItemRelatorioAtendimento {
  id:                number
  paciente_nome:     string
  telefone:          string | null
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

function esc(valor: string | null | undefined): string {
  return (valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function dataBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// "DR. WENDELL SUBTIL RODRIGUES" -> "WENDELL SUBTIL RODRIGUES" (a coluna é estreita; a faixa do grupo mantém o nome completo)
function semTitulo(nome: string): string {
  return nome.replace(/^\s*(DR|DRA|DR\(A\))\.?\s+/i, '').trim()
}

// A logo vem do banco; só aceita data URL de imagem pra nunca escapar do atributo src
function logoSegura(logo: string | null): string | null {
  return logo && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) ? logo : null
}

// Texto que vai dentro de string CSS (@page content): só caracteres seguros — nada de aspas, barra ou "<"
// que fechariam a string ou a tag <style>.
function paraCss(texto: string): string {
  return texto.replace(/[^\p{L}\p{N} .,:;\-/()|]/gu, '')
}

// Classe fixa por tipo (nunca injeta texto do banco em atributo class)
const CLASSE_FORMA: Record<string, string> = {
  dinheiro: 'f-din', pix: 'f-pix', debito: 'f-car', credito: 'f-car', a_prazo: 'f-prazo',
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
  const totalColunas    = comColunaMedico ? 9 : 8
  // colunas antes de "Vlr. Pagar": Paciente, Telefone, Categoria, Dt. Visita (+ Médico)
  const colunasAntesValores = comColunaMedico ? 5 : 4

  const celulaForma = (i: ItemRelatorioAtendimento) => {
    if (i.pago && i.forma_pagamento) {
      return `<span class="pill ${CLASSE_FORMA[i.tipo_pagamento ?? ''] ?? 'f-outro'}">${esc(i.forma_pagamento)}</span>`
    }
    return i.valor_pagar > 0 ? '<span class="pendente">Pendente</span>' : '<span class="pendente">-</span>'
  }

  const linhaItem = (i: ItemRelatorioAtendimento) => `
      <tr>
        <td class="paciente">${esc(i.paciente_nome)}</td>
        <td class="nowrap">${esc(i.telefone ?? '')}</td>
        <td>${esc(i.categoria ?? '')}</td>
        <td class="nowrap">${esc(i.data_visita)}</td>
        ${comColunaMedico ? `<td>${esc(semTitulo(i.profissional_nome))}</td>` : ''}
        <td class="num">${brl(i.valor_pagar)}</td>
        <td class="num ${i.valor_pago > 0 ? 'pago' : 'zero'}">${brl(i.valor_pago)}</td>
        <td>${celulaForma(i)}</td>
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
  const periodo = op.inicio === op.fim ? dataBR(op.inicio) : `${dataBR(op.inicio)} a ${dataBR(op.fim)}`
  const agora   = new Date()
  const dataEmissao = agora.toLocaleDateString('pt-BR')
  const horaEmissao = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const logo    = logoSegura(op.empresaLogo)
  const rodapeEsq    = paraCss(`Emitido em ${dataEmissao} ${horaEmissao}${op.emitidoPor ? ` por ${op.emitidoPor}` : ''}  |  Período ${periodo}`)
  const rodapeCentro = paraCss(op.empresaNome)

  // Larguras (A4 paisagem) — somam 100% nos dois modos; table-layout fixo pra as colunas não "dançarem"
  const W = comColunaMedico
    ? { pac: 18, tel: 9, cat: 8, dt: 6.5, med: 17.5, pagar: 7, pago: 7, forma: 10.5, atend: 16.5 }   // médico largo: nome quebrado dobra a altura da linha
    : { pac: 22, tel: 9.5, cat: 9.5, dt: 7, med: 0, pagar: 8, pago: 8, forma: 12.5, atend: 23.5 }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>&nbsp;</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  /* Rodapé nas margens da página: fica fora da área da tabela (um rodapé fixo sobreporia a última linha de cada página) */
  @page { size:A4 landscape; margin:0.8cm 0.9cm 1.15cm;
          @bottom-left   { content:"${rodapeEsq}";     font:6.8pt 'Segoe UI', Arial, sans-serif; color:#6b6b66; }
          @bottom-center { content:"${rodapeCentro}";  font:6.8pt 'Segoe UI', Arial, sans-serif; color:#6b6b66; }
          @bottom-right  { content:"Página " counter(page) " de " counter(pages); font:6.8pt 'Segoe UI', Arial, sans-serif; color:#6b6b66; } }
  html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:7.4pt; line-height:1.2; color:#1f1f1c; }

  /* Topo numa faixa só: marca | título | emissão */
  .topo { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:12px;
          padding-bottom:4px; border-bottom:2px solid #12857A; margin-bottom:4px; }
  .marca { display:flex; align-items:center; gap:7px; }
  .marca img { max-height:26px; max-width:86px; object-fit:contain; }
  .marca .nome { font-size:7.6pt; font-weight:700; color:#0B3A35; line-height:1.15; max-width:6cm; }
  .titulo { text-align:center; }
  .titulo h1 { font-size:12.5pt; font-weight:800; color:#0B3A35; line-height:1.05; }
  .titulo .sub { font-size:7.6pt; font-style:italic; color:#4a4a45; margin-top:1px; }
  .emissao { text-align:right; font-size:6.6pt; color:#55554f; line-height:1.3; }
  .emissao strong { color:#1f1f1c; }

  /* Filtros: uma linha só, pequenos */
  .filtros { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:5px; }
  .filtro { display:flex; align-items:baseline; gap:5px; background:#F3F7F6; border:1px solid #d3e0dd;
            border-left:2.5px solid #12857A; border-radius:2px; padding:1.5px 7px; }
  .filtro .k { font-size:5.8pt; letter-spacing:.08em; text-transform:uppercase; color:#6b7a76; font-weight:700; }
  .filtro .v { font-size:7.4pt; font-weight:700; color:#0B3A35; }

  /* Tabela compacta */
  table { width:100%; border-collapse:collapse; table-layout:fixed; }
  thead { display:table-header-group; }
  th { background:#0B3A35; color:#fff; text-align:left; font-weight:700; padding:2.5px 5px;
       font-size:6.2pt; letter-spacing:.06em; text-transform:uppercase; border:1px solid #0B3A35; }
  td { padding:1.4px 5px; border-bottom:1px solid #e1e6e4; vertical-align:middle; overflow-wrap:anywhere; }
  tr { page-break-inside:avoid; break-inside:avoid; }
  tbody tr:nth-child(even):not(.grupo):not(.subtotal):not(.total) td { background:#f8faf9; }
  td.paciente { font-weight:600; }
  .num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .nowrap { white-space:nowrap; }
  .pago { font-weight:700; color:#0B5D54; }
  .zero { color:#a4aaa7; }
  .pendente { color:#8f9694; font-style:italic; font-size:7pt; }

  /* Etiquetas de forma de pagamento */
  .pill { display:inline-block; padding:0 6px; border-radius:8px; font-size:6.6pt; line-height:1.4; font-weight:700; white-space:nowrap; }
  .f-din   { background:#E3F3E8; color:#1E6B34; }
  .f-pix   { background:#DFF1F8; color:#0B5F7E; }
  .f-car   { background:#ECE6F7; color:#4B2E90; }
  .f-prazo { background:#FCEFD9; color:#93540A; }
  .f-outro { background:#ECEEED; color:#4a4f4d; }

  tr.grupo td { background:#E1EEEB; color:#0B3A35; font-weight:800; font-size:7.8pt;
                border-left:4px solid #12857A; border-bottom:1px solid #b9d3cd; padding:2px 7px; break-after:avoid; }
  .grupo-qtd { float:right; font-weight:600; font-size:6.8pt; color:#4b6a64; }
  tr.subtotal td { background:#f0f5f4; font-weight:700; border-top:1px solid #9dbdb6; border-bottom:1.5px solid #9dbdb6; }
  tr.subtotal .rotulo, tr.total .rotulo { text-align:right; }
  tr.total td { background:#0B3A35; color:#fff; font-weight:800; font-size:8pt; border:none; padding:3px 5px; }

  /* Resumo por médico (só no fim, agrupado com 2+ médicos) */
  .resumo { width:55%; margin-top:10px; page-break-inside:avoid; break-inside:avoid; }
  .resumo-titulo { font-size:8pt; font-weight:800; color:#0B3A35; margin-bottom:3px; padding-left:6px; border-left:3px solid #12857A; }
  .resumo tr.total td { background:#12857A; color:#fff; }
  .resumo th { font-size:6pt; }
</style>
</head>
<body>
  <div class="topo">
    <div class="marca">
      ${logo ? `<img src="${logo}" alt="">` : ''}
      ${op.empresaNome ? `<div class="nome">${esc(op.empresaNome)}</div>` : ''}
    </div>
    <div class="titulo">
      <h1>Emissão de Relatórios</h1>
      <div class="sub">Pacientes pelo tipo de atendimento</div>
    </div>
    <div class="emissao">
      Emitido em <strong>${esc(dataEmissao)}</strong> às <strong>${esc(horaEmissao)}</strong>
      ${op.emitidoPor ? `<br>por <strong>${esc(op.emitidoPor)}</strong>` : ''}
    </div>
  </div>

  <div class="filtros">
    <div class="filtro"><span class="k">Médico</span><span class="v">${op.medicoNome ? esc(op.medicoNome) : 'Todos os médicos'}</span></div>
    <div class="filtro"><span class="k">Categoria</span><span class="v">${op.categoriaNome ? esc(op.categoriaNome) : '&lt;Todas&gt;'}</span></div>
    <div class="filtro"><span class="k">Período</span><span class="v">${dataBR(op.inicio)} até ${dataBR(op.fim)}</span></div>
    <div class="filtro"><span class="k">Agrupamento</span><span class="v">${op.agruparPorMedico ? 'Por médico' : 'Lista única'}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:${W.pac}%">Paciente</th>
        <th style="width:${W.tel}%">Telefone</th>
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
