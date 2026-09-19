// Relatório impresso "Pacientes pelo tipo de atendimento" (Fechamento Diário).
// Mesmas colunas do relatório do sistema anterior (Paciente / Telefone / Categoria / Dt. Visita / Médico /
// Vlr. Pagar / Vlr. Pago / Atendimento) + Forma de Pagamento, em A4 paisagem. Opção de agrupar por médico
// (subtotal por médico), cartões-resumo no topo e resumos (por médico e por forma de pagamento) no fim.

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
    (acc, i) => ({
      qtd: acc.qtd + 1,
      pagos: acc.pagos + (i.pago ? 1 : 0),
      pagar: acc.pagar + i.valor_pagar,
      pago: acc.pago + i.valor_pago,
    }),
    { qtd: 0, pagos: 0, pagar: 0, pago: 0 },
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

  // ── Resumos no fim ─────────────────────────────────────────────────────────
  // Por forma de pagamento: só o que foi pago; quem não pagou entra numa linha à parte pra a soma das quantidades fechar
  const porForma = new Map<string, { qtd: number; total: number; tipo: string | null }>()
  let semPagamento = 0
  for (const i of itens) {
    if (!i.pago || !i.forma_pagamento) { semPagamento++; continue }
    const f = porForma.get(i.forma_pagamento) ?? { qtd: 0, total: 0, tipo: i.tipo_pagamento }
    f.qtd++; f.total += i.valor_pago
    porForma.set(i.forma_pagamento, f)
  }
  const formasOrdenadas = [...porForma.entries()].sort((a, b) => b[1].total - a[1].total)

  const resumoForma = `
    <div class="resumo">
      <div class="resumo-titulo">Resumo por forma de pagamento</div>
      <table>
        <thead><tr><th>Forma de pagamento</th><th class="num">Atendimentos</th><th class="num">Vlr. Pago</th></tr></thead>
        <tbody>
          ${formasOrdenadas.map(([nome, f]) => `<tr><td><span class="pill ${CLASSE_FORMA[f.tipo ?? ''] ?? 'f-outro'}">${esc(nome)}</span></td><td class="num">${f.qtd}</td><td class="num pago">${brl(f.total)}</td></tr>`).join('')}
          ${semPagamento > 0 ? `<tr><td><span class="pendente">Sem pagamento registrado</span></td><td class="num">${semPagamento}</td><td class="num zero">${brl(0)}</td></tr>` : ''}
          <tr class="total"><td>Total</td><td class="num">${geral.qtd}</td><td class="num">${brl(geral.pago)}</td></tr>
        </tbody>
      </table>
    </div>`

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
  const rodapeEsq = paraCss(`Emitido em ${dataEmissao} ${horaEmissao}${op.emitidoPor ? ` por ${op.emitidoPor}` : ''}  |  Período ${periodo}`)
  const rodapeCentro = paraCss(op.empresaNome)

  // Larguras (A4 paisagem, ~27,3 cm úteis) — soma 100% nos dois modos
  const W = comColunaMedico
    ? { pac: 17, tel: 9, cat: 8.5, dt: 7, med: 12.5, pagar: 8, pago: 8, forma: 11, atend: 19 }
    : { pac: 20, tel: 10, cat: 9.5, dt: 8, med: 0,    pagar: 9, pago: 9, forma: 12.5, atend: 22 }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>&nbsp;</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  /* Rodapé nas margens da página: fica fora da área da tabela (um rodapé fixo sobreporia a última linha de cada página) */
  @page { size:A4 landscape; margin:1.1cm 1.2cm 1.5cm;
          @bottom-left   { content:"${rodapeEsq}";     font:7.5pt 'Segoe UI', Arial, sans-serif; color:#6b6b66; }
          @bottom-center { content:"${rodapeCentro}";  font:7.5pt 'Segoe UI', Arial, sans-serif; color:#6b6b66; }
          @bottom-right  { content:"Página " counter(page) " de " counter(pages); font:7.5pt 'Segoe UI', Arial, sans-serif; color:#6b6b66; } }
  html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Segoe UI', Arial, Helvetica, sans-serif; font-size:8.5pt; color:#1f1f1c; }

  /* Topo: marca | título | emissão */
  .topo { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:18px;
          padding-bottom:9px; border-bottom:3px solid #12857A; margin-bottom:10px; }
  .marca { display:flex; align-items:center; gap:10px; }
  .marca img { max-height:46px; max-width:150px; object-fit:contain; }
  .marca .nome { font-size:9pt; font-weight:700; color:#0B3A35; line-height:1.25; max-width:6.5cm; }
  .titulo { text-align:center; }
  .titulo h1 { font-size:17pt; font-weight:800; color:#0B3A35; letter-spacing:.01em; line-height:1.1; }
  .titulo .sub { font-size:9.5pt; font-style:italic; color:#4a4a45; margin-top:2px; letter-spacing:.02em; }
  .emissao { text-align:right; font-size:8pt; color:#55554f; line-height:1.5; }
  .emissao strong { color:#1f1f1c; }

  /* Filtros em etiquetas */
  .filtros { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
  .filtro { background:#F3F7F6; border:1px solid #d3e0dd; border-left:3px solid #12857A; border-radius:3px; padding:4px 10px; min-width:3.6cm; }
  .filtro .k { font-size:6.5pt; letter-spacing:.09em; text-transform:uppercase; color:#6b7a76; font-weight:700; }
  .filtro .v { font-size:9pt; font-weight:700; color:#0B3A35; margin-top:1px; }

  /* Cartões-resumo */
  .cards { display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:12px; }
  .card { border:1px solid #d3e0dd; border-radius:5px; padding:7px 12px; background:#fff; }
  .card .k { font-size:6.8pt; letter-spacing:.09em; text-transform:uppercase; color:#6b7a76; font-weight:700; }
  .card .v { font-size:14pt; font-weight:800; color:#0B3A35; margin-top:2px; font-variant-numeric:tabular-nums; }
  .card.destaque { background:#0B3A35; border-color:#0B3A35; }
  .card.destaque .k { color:#a9cfc8; } .card.destaque .v { color:#fff; }

  /* Tabela */
  table { width:100%; border-collapse:collapse; }
  thead { display:table-header-group; }
  th { background:#0B3A35; color:#fff; text-align:left; font-weight:700; padding:6px 7px;
       font-size:7.3pt; letter-spacing:.07em; text-transform:uppercase; border:1px solid #0B3A35; }
  td { padding:4px 7px; border-bottom:1px solid #dfe5e3; vertical-align:middle; }
  tr { page-break-inside:avoid; break-inside:avoid; }
  tbody tr:nth-child(even):not(.grupo):not(.subtotal):not(.total) td { background:#f8faf9; }
  td.paciente { font-weight:600; }
  .num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .nowrap { white-space:nowrap; }
  .pago { font-weight:700; color:#0B5D54; }
  .zero { color:#a4aaa7; }
  .pendente { color:#8f9694; font-style:italic; font-size:7.8pt; }

  /* Etiquetas de forma de pagamento */
  .pill { display:inline-block; padding:1.5px 8px; border-radius:9px; font-size:7.3pt; font-weight:700; letter-spacing:.02em; white-space:nowrap; }
  .f-din   { background:#E3F3E8; color:#1E6B34; }
  .f-pix   { background:#DFF1F8; color:#0B5F7E; }
  .f-car   { background:#ECE6F7; color:#4B2E90; }
  .f-prazo { background:#FCEFD9; color:#93540A; }
  .f-outro { background:#ECEEED; color:#4a4f4d; }

  tr.grupo td { background:#E1EEEB; color:#0B3A35; font-weight:800; font-size:9.3pt; letter-spacing:.02em;
                border-left:5px solid #12857A; border-bottom:1px solid #b9d3cd; padding:5px 9px; break-after:avoid; }
  .grupo-qtd { float:right; font-weight:600; font-size:8pt; color:#4b6a64; }
  tr.subtotal td { background:#f0f5f4; font-weight:700; border-top:1.5px solid #9dbdb6; border-bottom:2px solid #9dbdb6; }
  tr.subtotal .rotulo, tr.total .rotulo { text-align:right; }
  tr.total td { background:#0B3A35; color:#fff; font-weight:800; font-size:9.3pt; border:none; padding:6px 7px; }

  /* Resumos finais lado a lado */
  .resumos { display:flex; gap:22px; align-items:flex-start; margin-top:16px; page-break-inside:avoid; break-inside:avoid; }
  .resumo { flex:1; }
  .resumo:only-child { flex:0 0 calc(50% - 11px); }   /* sozinho (lista única): mesma largura de quando há dois lado a lado */
  .resumo-titulo { font-size:9.5pt; font-weight:800; color:#0B3A35; margin-bottom:5px; letter-spacing:.02em;
                   padding-left:7px; border-left:4px solid #12857A; }
  .resumo tr.total td { background:#12857A; color:#fff; }
  .resumo th { font-size:7pt; }
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
    <div class="filtro"><div class="k">Médico</div><div class="v">${op.medicoNome ? esc(op.medicoNome) : 'Todos os médicos'}</div></div>
    <div class="filtro"><div class="k">Categoria</div><div class="v">${op.categoriaNome ? esc(op.categoriaNome) : '&lt;Todas&gt;'}</div></div>
    <div class="filtro"><div class="k">Período</div><div class="v">${dataBR(op.inicio)} &nbsp;até&nbsp; ${dataBR(op.fim)}</div></div>
    <div class="filtro"><div class="k">Agrupamento</div><div class="v">${op.agruparPorMedico ? 'Por médico' : 'Lista única'}</div></div>
  </div>

  <div class="cards">
    <div class="card"><div class="k">Atendimentos</div><div class="v">${geral.qtd}</div></div>
    <div class="card"><div class="k">Pagamentos registrados</div><div class="v">${geral.pagos} <span style="font-size:9pt;font-weight:600;color:#6b7a76">de ${geral.qtd}</span></div></div>
    <div class="card"><div class="k">Total a pagar</div><div class="v">${brl(geral.pagar)}</div></div>
    <div class="card destaque"><div class="k">Total pago</div><div class="v">${brl(geral.pago)}</div></div>
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

  <div class="resumos">${resumoMedico}${resumoForma}
  </div>
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`
}
