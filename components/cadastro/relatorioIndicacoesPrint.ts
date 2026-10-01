// Relatório impresso "Indicação de Pacientes" (lista de Pacientes, botão Relatório de Indicações).
// Agrupado por indicador (pessoa que indicou), com os pacientes indicados listados dentro de cada grupo
// e total geral no fim. Reaproveita identidade visual/cabeçalho de relatorioImpressaoBase.ts (Gerencial).
import {
  esc, dataBR, logoSegura, paraCss, dadosDeEmissao,
  cssBase, cabecalhoHtml, filtrosHtml, rodapeDaPagina, periodoTexto,
} from '../gerencial/relatorioImpressaoBase'

export interface PacienteIndicado {
  id:            number
  nome:          string
  telefone:      string | null
  data_cadastro: string   // YYYY-MM-DD
}

export interface ItemRelatorioIndicacao {
  indicador_pessoa_id: number | null
  indicador_nome:      string
  indicador_fone:      string | null
  indicador_ligacao:   string | null
  qtd:                 number
  pacientes:           PacienteIndicado[]
}

export interface OpcoesRelatorioIndicacao {
  inicio:      string   // YYYY-MM-DD
  fim:         string   // YYYY-MM-DD
  buscaTexto:  string | null   // null = sem filtro de indicador
  empresaNome: string
  empresaLogo: string | null
  emitidoPor:  string
}

const rotuloQtd = (n: number) => `${n} paciente${n === 1 ? '' : 's'}`

export function gerarHtmlRelatorioIndicacoes(
  itens: ItemRelatorioIndicacao[],
  op: OpcoesRelatorioIndicacao,
): string {
  const linhaPaciente = (p: PacienteIndicado) => `
      <tr>
        <td class="paciente">${esc(p.nome)}</td>
        <td class="nowrap">${esc(p.telefone ?? '')}</td>
        <td class="nowrap">${esc(dataBR(p.data_cadastro))}</td>
      </tr>`

  let corpo = ''
  for (const g of itens) {
    const vinculo  = g.indicador_ligacao ? ` (${g.indicador_ligacao})` : ''
    const telefone = g.indicador_fone ? ` — ${g.indicador_fone}` : ''
    corpo += `
      <tr class="grupo"><td colspan="3">Indicado por: ${esc(g.indicador_nome)}${esc(vinculo)}${esc(telefone)}<span class="grupo-qtd">${esc(rotuloQtd(g.qtd))}</span></td></tr>
      ${g.pacientes.map(linhaPaciente).join('')}`
  }

  const totalPacientes = itens.reduce((acc, g) => acc + g.qtd, 0)
  corpo += `
      <tr class="total"><td colspan="3" class="rotulo">TOTAL GERAL — ${esc(rotuloQtd(totalPacientes))} indicado${totalPacientes === 1 ? '' : 's'} por ${itens.length} indicador${itens.length === 1 ? '' : 'es'}</td></tr>`

  const periodo = op.inicio && op.fim ? periodoTexto(op.inicio, op.fim) : 'Todo o período'
  const emissao = dadosDeEmissao()
  const logo    = logoSegura(op.empresaLogo)

  const css = cssBase({
    papel:        'A4 portrait',
    rodapeEsq:    rodapeDaPagina(emissao, op.emitidoPor, periodo),
    rodapeCentro: paraCss(op.empresaNome),
    fonteTotais:  '8pt',
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
  ${cabecalhoHtml({ empresaNome: op.empresaNome, logo, titulo: 'Indicação de Pacientes', subtitulo: 'Pacientes agrupados por quem os indicou', emissao, emitidoPor: op.emitidoPor })}

  ${filtrosHtml([
    { k: 'Indicador', v: op.buscaTexto || 'Todos' },
    { k: 'Período',   v: op.inicio && op.fim ? `${dataBR(op.inicio)} até ${dataBR(op.fim)}` : 'Todo o período (data de cadastro do paciente)' },
  ])}

  <table>
    <thead>
      <tr>
        <th style="width:50%">Paciente</th>
        <th style="width:25%">Telefone</th>
        <th style="width:25%">Cadastrado em</th>
      </tr>
    </thead>
    <tbody>${corpo}
    </tbody>
  </table>
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`
}
