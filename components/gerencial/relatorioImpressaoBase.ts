// Base comum dos relatórios impressos do Fechamento Diário (janela de impressão em HTML gerado):
//   - relatorioAtendimentosPrint.ts  -> "Pacientes pelo tipo de atendimento"
//   - relatorioExamesPrint.ts        -> "Exames pelo médico executante"
// Aqui ficam só as peças que TÊM de ser iguais nos dois (escape, logo segura, CSS/identidade visual,
// cabeçalho, chips de filtro). Colunas, larguras e regras de cada relatório ficam no módulo dele.
// Mexeu aqui? Os dois relatórios mudam juntos: confira os dois na impressão (ver padroes §31).

export function esc(valor: string | null | undefined): string {
  return (valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function dataBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// "DR. WENDELL SUBTIL RODRIGUES" -> "WENDELL SUBTIL RODRIGUES" (a coluna é estreita; a faixa do grupo mantém o nome completo)
export function semTitulo(nome: string): string {
  return nome.replace(/^\s*(DR|DRA|DR\(A\))\.?\s+/i, '').trim()
}

// A logo vem do banco; só aceita data URL de imagem pra nunca escapar do atributo src
export function logoSegura(logo: string | null): string | null {
  return logo && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) ? logo : null
}

// Texto que vai dentro de string CSS (@page content): só caracteres seguros — nada de aspas, barra ou "<"
// que fechariam a string ou a tag <style>.
export function paraCss(texto: string): string {
  return texto.replace(/[^\p{L}\p{N} .,:;\-/()|]/gu, '')
}

// Classe fixa por tipo (nunca injeta texto do banco em atributo class)
export const CLASSE_FORMA: Record<string, string> = {
  dinheiro: 'f-din', pix: 'f-pix', debito: 'f-car', credito: 'f-car', a_prazo: 'f-prazo',
}

// Totais (negrito) são os números mais largos da página: a fonte encolhe conforme o maior valor, senão
// "R$ 6.500,00" e "R$ 6.500,00" ficam colados na coluna estreita do retrato (visto na 1ª versão).
export function fonteDosTotais(pagar: number, pago: number): string {
  const maiorValor = Math.max(brl(pagar).length, brl(pago).length)
  return maiorValor >= 14 ? '6.2pt' : maiorValor >= 13 ? '6.6pt' : maiorValor >= 12 ? '7.2pt' : '7.6pt'
}

export interface DadosEmissao {
  dataEmissao: string
  horaEmissao: string
}

export function dadosDeEmissao(agora: Date = new Date()): DadosEmissao {
  return {
    dataEmissao: agora.toLocaleDateString('pt-BR'),
    horaEmissao: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

export interface OpcoesCss {
  papel:         string   // valor de @page size, ex.: 'A4 portrait'
  rodapeEsq:     string   // já passado por paraCss()
  rodapeCentro:  string   // já passado por paraCss()
  fonteTotais:   string   // de fonteDosTotais()
}

// Identidade visual dos relatórios (verde #0B3A35 / #12857A), layout compacto, rodapé nas margens da página.
export function cssBase(o: OpcoesCss): string {
  return `  * { margin:0; padding:0; box-sizing:border-box; }
  /* Rodapé nas margens da página: fica fora da área da tabela (um rodapé fixo sobreporia a última linha de cada página) */
  @page { size:${o.papel}; margin:0.8cm 0.8cm 1.15cm;
          @bottom-left   { content:"${o.rodapeEsq}";     font:6.8pt 'Segoe UI', Arial, sans-serif; color:#6b6b66; }
          @bottom-center { content:"${o.rodapeCentro}";  font:6.8pt 'Segoe UI', Arial, sans-serif; color:#6b6b66; }
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
  .pill { display:inline-block; padding:0 6px; border-radius:8px; font-size:6.6pt; line-height:1.4; font-weight:700; }   /* pode quebrar (raro, ex.: "VISA CREDITO 3x") em vez de vazar pra coluna do lado */
  .f-din   { background:#E3F3E8; color:#1E6B34; }
  .f-pix   { background:#DFF1F8; color:#0B5F7E; }
  .f-car   { background:#ECE6F7; color:#4B2E90; }
  .f-prazo { background:#FCEFD9; color:#93540A; }
  .f-outro { background:#ECEEED; color:#4a4f4d; }

  tr.grupo td { background:#E1EEEB; color:#0B3A35; font-weight:800; font-size:7.8pt;
                border-left:4px solid #12857A; border-bottom:1px solid #b9d3cd; padding:2px 7px; break-after:avoid; }
  .grupo-qtd { float:right; font-weight:600; font-size:6.8pt; color:#4b6a64; }
  tr.subtotal td { background:#f0f5f4; font-weight:700; font-size:${o.fonteTotais}; border-top:1px solid #9dbdb6; border-bottom:1.5px solid #9dbdb6; }
  tr.subtotal .rotulo, tr.total .rotulo { text-align:right; }
  tr.total td { background:#0B3A35; color:#fff; font-weight:800; font-size:${o.fonteTotais}; border:none; padding:3px 5px; }

  /* Resumo por médico (só no fim, agrupado com 2+ médicos) */
  .resumo { width:75%; margin-top:10px; page-break-inside:avoid; break-inside:avoid; }
  .resumo-titulo { font-size:8pt; font-weight:800; color:#0B3A35; margin-bottom:3px; padding-left:6px; border-left:3px solid #12857A; }
  .resumo tr.total td { background:#12857A; color:#fff; }
  .resumo th { font-size:6pt; }`
}

export interface OpcoesCabecalho {
  empresaNome: string
  logo:        string | null   // já passada por logoSegura()
  titulo:      string
  subtitulo:   string
  emissao:     DadosEmissao
  emitidoPor:  string
}

export function cabecalhoHtml(o: OpcoesCabecalho): string {
  return `<div class="topo">
    <div class="marca">
      ${o.logo ? `<img src="${o.logo}" alt="">` : ''}
      ${o.empresaNome ? `<div class="nome">${esc(o.empresaNome)}</div>` : ''}
    </div>
    <div class="titulo">
      <h1>${esc(o.titulo)}</h1>
      <div class="sub">${esc(o.subtitulo)}</div>
    </div>
    <div class="emissao">
      Emitido em <strong>${esc(o.emissao.dataEmissao)}</strong> às <strong>${esc(o.emissao.horaEmissao)}</strong>
      ${o.emitidoPor ? `<br>por <strong>${esc(o.emitidoPor)}</strong>` : ''}
    </div>
  </div>`
}

// Chips de filtro (texto puro — escapado aqui)
export function filtrosHtml(chips: { k: string; v: string }[]): string {
  return `<div class="filtros">
    ${chips.map(c => `<div class="filtro"><span class="k">${esc(c.k)}</span><span class="v">${esc(c.v)}</span></div>`).join('\n    ')}
  </div>`
}

// Texto do rodapé (margem inferior da página): "Emitido em ... por ... | Período ..."
export function rodapeDaPagina(emissao: DadosEmissao, emitidoPor: string, periodo: string) {
  return paraCss(`Emitido em ${emissao.dataEmissao} ${emissao.horaEmissao}${emitidoPor ? ` por ${emitidoPor}` : ''}  |  Período ${periodo}`)
}

export function periodoTexto(inicio: string, fim: string): string {
  return inicio === fim ? dataBR(inicio) : `${dataBR(inicio)} a ${dataBR(fim)}`
}

// Etiqueta colorida da forma de pagamento; sem pagamento mostra "Pendente" (tem valor a pagar) ou "-".
export function celulaFormaHtml(i: { pago: boolean; forma_pagamento: string | null; tipo_pagamento: string | null; valor_pagar: number }): string {
  if (i.pago && i.forma_pagamento) {
    return `<span class="pill ${CLASSE_FORMA[i.tipo_pagamento ?? ''] ?? 'f-outro'}">${esc(i.forma_pagamento)}</span>`
  }
  return i.valor_pagar > 0 ? '<span class="pendente">Pendente</span>' : '<span class="pendente">-</span>'
}
