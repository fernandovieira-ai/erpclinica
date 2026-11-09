// Taxa de cartão rateada pelo valor do próprio item, não pelo valor total da venda de cartão —
// um recebimento em lote (N atendimentos pagos numa única tacada de cartão) compartilha o mesmo
// venda_cartao_id entre as N linhas de tab_recebimento_consulta, então usar o valor_bruto da venda
// como base repetiria a taxa cheia da venda em cada linha. Usado por /api/gerencial/receitas e
// /api/integracoes/gohighlevel/recebimentos — mesma conta, duas rotas.
export function calcularValoresRecebimento(valorBruto: number, percentualMdr: number) {
  const valorTaxa = percentualMdr > 0 ? Math.round(valorBruto * (percentualMdr / 100) * 100) / 100 : 0
  const valorLiquido = Math.round((valorBruto - valorTaxa) * 100) / 100
  return { valorTaxa, valorLiquido }
}
