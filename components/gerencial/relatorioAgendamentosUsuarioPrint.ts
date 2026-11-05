// Relatório impresso "Agendamentos por Usuário" (módulo Gerencial). 2 níveis: usuário que lançou
// o agendamento (tab_agendamento.created_by) -> tipo de atendimento, com a contagem por status em
// colunas (matriz). Subtotal por usuário, total geral no fim. Identidade visual, cabeçalho e
// helpers vêm de relatorioImpressaoBase.ts (compartilhado com os demais relatórios do Gerencial).

import {
  esc, logoSegura, paraCss, dadosDeEmissao,
  cssBase, cabecalhoHtml, filtrosHtml, rodapeDaPagina, periodoTexto,
} from './relatorioImpressaoBase'

export const STATUS_ORDEM = ['AGENDADO', 'CONFIRMADO', 'AGUARDANDO', 'ATENDIDO', 'FALTOU', 'CANCELADO'] as const
export type StatusAgendamento = typeof STATUS_ORDEM[number]

export const STATUS_LABEL: Record<StatusAgendamento, string> = {
  AGENDADO: 'Agendado', CONFIRMADO: 'Confirmado', AGUARDANDO: 'Aguardando',
  ATENDIDO: 'Atendido', FALTOU: 'Faltou', CANCELADO: 'Cancelado',
}

export interface TipoRelatorioAgendamentoUsuario {
  tipo_id:        number | null
  tipo_descricao: string
  contagem:       Record<StatusAgendamento, number>
  total:          number
}

export interface UsuarioRelatorioAgendamento {
  usuario:  string
  tipos:    TipoRelatorioAgendamentoUsuario[]
  contagem: Record<StatusAgendamento, number>
  total:    number
}

export interface OpcoesRelatorioAgendamentoUsuario {
  inicio:       string | null
  fim:          string | null
  usuarioTexto: string | null
  tipoTexto:    string | null
  empresaNome:  string
  empresaLogo:  string | null
  emitidoPor:   string
}

const rotuloQtd = (n: number) => `${n} agendamento${n === 1 ? '' : 's'}`

const CSS_EXTRA = `
  tr.subtotal-usuario td { background:#CFE4DF; color:#0B3A35; font-weight:800; border-top:1.5px solid #12857A; border-bottom:1.5px solid #12857A; }
  tr.subtotal-usuario .rotulo { text-align:right; padding-right:8px; }
  th.status { text-align:right; }
`

function somaContagens(usuarios: UsuarioRelatorioAgendamento[]): Record<StatusAgendamento, number> {
  const c: Record<StatusAgendamento, number> = { AGENDADO: 0, CONFIRMADO: 0, AGUARDANDO: 0, ATENDIDO: 0, FALTOU: 0, CANCELADO: 0 }
  for (const u of usuarios) for (const s of STATUS_ORDEM) c[s] += u.contagem[s]
  return c
}

export function gerarHtmlRelatorioAgendamentosUsuario(
  usuarios: UsuarioRelatorioAgendamento[],
  op: OpcoesRelatorioAgendamentoUsuario,
): string {
  const colunasStatus = STATUS_ORDEM.map((s) => `<th class="num status" style="width:9%">${esc(STATUS_LABEL[s])}</th>`).join('')
  const ncols = 2 + STATUS_ORDEM.length

  const linhaTipo = (t: TipoRelatorioAgendamentoUsuario) => `
      <tr class="item">
        <td colspan="2">${esc(t.tipo_descricao)}</td>
        ${STATUS_ORDEM.map((s) => `<td class="num">${t.contagem[s] || ''}</td>`).join('')}
      </tr>`

  const linhaSubtotalUsuario = (u: UsuarioRelatorioAgendamento) => `
      <tr class="subtotal-usuario">
        <td colspan="2" class="rotulo">Subtotal ${esc(u.usuario)} (${esc(rotuloQtd(u.total))})</td>
        ${STATUS_ORDEM.map((s) => `<td class="num">${u.contagem[s]}</td>`).join('')}
      </tr>`

  let corpo = ''
  for (const u of usuarios) {
    corpo += `
      <tr class="grupo"><td colspan="${ncols}">${esc(u.usuario)}<span class="grupo-qtd">${esc(rotuloQtd(u.total))}</span></td></tr>
      ${u.tipos.map(linhaTipo).join('')}
      ${linhaSubtotalUsuario(u)}`
  }

  const geral = somaContagens(usuarios)
  const geralTotal = STATUS_ORDEM.reduce((acc, s) => acc + geral[s], 0)
  corpo += `
      <tr class="total">
        <td colspan="2" class="rotulo">TOTAL GERAL - ${esc(rotuloQtd(geralTotal))}</td>
        ${STATUS_ORDEM.map((s) => `<td class="num">${geral[s]}</td>`).join('')}
      </tr>`

  // Resumo por usuário (só no fim, com 2+ usuários)
  let resumoUsuarios = ''
  if (usuarios.length > 1) {
    resumoUsuarios = `
  <div class="resumo">
    <div class="resumo-titulo">Resumo por usuário</div>
    <table>
      <thead><tr><th colspan="2">Usuário</th>${colunasStatus}</tr></thead>
      <tbody>
        ${usuarios.map((u) => `<tr><td colspan="2">${esc(u.usuario)}</td>${STATUS_ORDEM.map((s) => `<td class="num">${u.contagem[s]}</td>`).join('')}</tr>`).join('')}
        <tr class="total"><td colspan="2">Total geral</td>${STATUS_ORDEM.map((s) => `<td class="num">${geral[s]}</td>`).join('')}</tr>
      </tbody>
    </table>
  </div>`
  }

  const periodo = op.inicio && op.fim ? periodoTexto(op.inicio, op.fim) : 'Todos os lançamentos'
  const emissao = dadosDeEmissao()
  const logo    = logoSegura(op.empresaLogo)

  const css = cssBase({
    papel: 'A4 landscape',
    rodapeEsq:    rodapeDaPagina(emissao, op.emitidoPor, periodo),
    rodapeCentro: paraCss(op.empresaNome),
    fonteTotais:  '7.6pt',
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
  ${cabecalhoHtml({ empresaNome: op.empresaNome, logo, titulo: 'Agendamentos por Usuário', subtitulo: 'Por data de lançamento, agrupado por quem cadastrou e tipo de atendimento', emissao, emitidoPor: op.emitidoPor })}

  ${filtrosHtml([
    { k: 'Lançado entre', v: op.inicio && op.fim ? periodoTexto(op.inicio, op.fim) : 'Todos' },
    { k: 'Usuário', v: op.usuarioTexto || '<Todos>' },
    { k: 'Tipo',    v: op.tipoTexto    || '<Todos>' },
  ])}

  <table>
    <thead>
      <tr>
        <th colspan="2" style="width:28%">Tipo de Atendimento</th>
        ${colunasStatus}
      </tr>
    </thead>
    <tbody>${corpo}
    </tbody>
  </table>
  ${resumoUsuarios}
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`
}
