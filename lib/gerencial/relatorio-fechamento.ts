// Regras comuns das rotas de relatório impresso do Fechamento Diário
// (app/api/gerencial/fechamento-diario/relatorio e .../relatorio-exames).

export const LIMITE_LINHAS = 5000
const LIMITE_DIAS  = 366
const REGEX_DATA   = /^\d{4}-\d{2}-\d{2}$/

export type ErroValidacao = { erro: string }

// id opcional de filtro: ausente = null; inteiro positivo = número; qualquer outra coisa = 'invalido' (400)
export function idOpcional(v: string | null): number | null | 'invalido' {
  if (!v) return null
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 'invalido'
}

// Período YYYY-MM-DD, fim >= início, no máximo 366 dias. Devolve o erro (pra responder 400) ou null se ok.
export function validarPeriodo(inicio: string, fim: string): ErroValidacao | null {
  if (!REGEX_DATA.test(inicio) || !REGEX_DATA.test(fim)) {
    return { erro: 'Informe o período (inicio e fim no formato YYYY-MM-DD)' }
  }
  const dias = (Date.parse(fim) - Date.parse(inicio)) / 86_400_000
  if (!Number.isFinite(dias) || dias < 0) return { erro: 'A data final não pode ser anterior à inicial' }
  if (dias > LIMITE_DIAS) return { erro: `Período máximo de ${LIMITE_DIAS} dias` }
  return null
}

// Forma de pagamento do atendimento: condição escolhida no recebimento; crédito parcelado mostra o nº de parcelas.
// null = sem pagamento.
export function formaDePagamento(
  pago: boolean,
  descricao: string | null,
  tipoPagamento: string | null,
  qtdParcelas: unknown,
): string | null {
  if (!pago) return null
  const parcelas = Number(qtdParcelas) || 0
  return `${descricao ?? 'NÃO INFORMADA'}${tipoPagamento === 'credito' && parcelas > 1 ? ` ${parcelas}x` : ''}`
}
