import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

const ORIGEM_CASE = (prefix: string) => `
  CASE
    WHEN ${prefix}origem_modulo = 'CARTAO'      THEN 'Cartão'
    WHEN ${prefix}origem_modulo IN ('CLI','REC') THEN 'Clínica'
    WHEN ${prefix}titulo_pagar_id   IS NOT NULL THEN 'Título a Pagar'
    WHEN ${prefix}titulo_receber_id IS NOT NULL THEN 'Título a Receber'
    WHEN ${prefix}despesa_id        IS NOT NULL THEN 'Despesa'
    WHEN ${prefix}receita_id        IS NOT NULL THEN 'Receita'
    ELSE 'Manual'
  END
`

function diffDiasUTC(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

// GET /api/gerencial/fluxo-caixa?periodo=30
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const periodoDias = Math.min(180, Math.max(7, Number(req.nextUrl.searchParams.get('periodo')) || 30))
  const empresaId   = session.empresa_id_ativa
  const db          = getDb(session.database_name)

  try {
    const [
      { rows: hojeRow },
      { rows: saldoCaixaRow },
      { rows: saldoBancoRow },
      { rows: hojeMovRows },
      { rows: periodoMovRows },
      { rows: abertoRow },
      { rows: cartaoRow },
      { rows: serieRows },
      { rows: origemRows },
      { rows: projecaoRows },
      { rows: movRows },
    ] = await Promise.all([
      db.query(`SELECT TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AS hoje`),

      db.query(
        `SELECT COALESCE(SUM(CASE WHEN tipo='E' THEN valor ELSE -valor END),0) AS saldo
         FROM tab_movimento_caixa WHERE empresa_id=$1`,
        [empresaId],
      ),

      db.query(
        `SELECT COALESCE(SUM(cb.saldo_inicial),0) + COALESCE(SUM(mb.delta),0) AS saldo
         FROM tab_conta_banco cb
         LEFT JOIN (
           SELECT conta_banco_id, SUM(CASE WHEN tipo='E' THEN valor ELSE -valor END) AS delta
           FROM tab_movimento_banco WHERE empresa_id=$1 GROUP BY conta_banco_id
         ) mb ON mb.conta_banco_id = cb.id
         WHERE cb.empresa_id=$1 AND cb.ativo = true`,
        [empresaId],
      ),

      db.query(
        `SELECT tipo, SUM(valor) AS total FROM (
           SELECT tipo, valor FROM tab_movimento_caixa  WHERE empresa_id=$1 AND data_movimento = CURRENT_DATE
           UNION ALL
           SELECT tipo, valor FROM tab_movimento_banco  WHERE empresa_id=$1 AND data_movimento = CURRENT_DATE
         ) x GROUP BY tipo`,
        [empresaId],
      ),

      db.query(
        `SELECT tipo, SUM(valor) AS total FROM (
           SELECT tipo, valor FROM tab_movimento_caixa WHERE empresa_id=$1 AND data_movimento >= CURRENT_DATE - $2::int AND data_movimento <= CURRENT_DATE
           UNION ALL
           SELECT tipo, valor FROM tab_movimento_banco WHERE empresa_id=$1 AND data_movimento >= CURRENT_DATE - $2::int AND data_movimento <= CURRENT_DATE
         ) x GROUP BY tipo`,
        [empresaId, periodoDias - 1],
      ),

      db.query(
        `SELECT
           (SELECT COALESCE(SUM(valor_saldo),0) FROM vw_titulos_receber_abertos WHERE empresa_id=$1)             AS a_receber,
           (SELECT COALESCE(SUM(valor_saldo),0) FROM vw_titulos_receber_abertos WHERE empresa_id=$1 AND vencido) AS a_receber_vencido,
           (SELECT COALESCE(SUM(valor_saldo),0) FROM vw_titulos_pagar_abertos   WHERE empresa_id=$1)             AS a_pagar,
           (SELECT COALESCE(SUM(valor_saldo),0) FROM vw_titulos_pagar_abertos   WHERE empresa_id=$1 AND vencido) AS a_pagar_vencido,
           (SELECT COUNT(*) FROM vw_titulos_receber_abertos WHERE empresa_id=$1 AND vencido)                     AS n_receber_vencido,
           (SELECT COUNT(*) FROM vw_titulos_pagar_abertos   WHERE empresa_id=$1 AND vencido)                     AS n_pagar_vencido`,
        [empresaId],
      ),

      // Recebíveis de cartão ainda não confirmados (não viram tab_movimento_banco
      // até a fatura ser confirmada) — não têm título a receber, então vw_titulos_*
      // não os enxerga; sem isso o fluxo de caixa fica cego pro dinheiro do cartão.
      db.query(
        `SELECT COALESCE(SUM(p.valor_liquido),0) AS total
         FROM tab_venda_cartao_parcela p
         JOIN tab_venda_cartao v ON v.id = p.venda_cartao_id
         WHERE v.empresa_id=$1 AND v.status='PENDENTE' AND p.status IN ('PENDENTE','FATURADA')`,
        [empresaId],
      ),

      db.query(
        `SELECT TO_CHAR(data_movimento,'YYYY-MM-DD') AS data_movimento, tipo, SUM(valor) AS valor FROM (
           SELECT data_movimento, tipo, valor FROM tab_movimento_caixa WHERE empresa_id=$1 AND data_movimento >= CURRENT_DATE - $2::int AND data_movimento <= CURRENT_DATE
           UNION ALL
           SELECT data_movimento, tipo, valor FROM tab_movimento_banco WHERE empresa_id=$1 AND data_movimento >= CURRENT_DATE - $2::int AND data_movimento <= CURRENT_DATE
         ) x GROUP BY data_movimento, tipo ORDER BY data_movimento`,
        [empresaId, periodoDias - 1],
      ),

      db.query(
        `SELECT origem, tipo, SUM(valor) AS total FROM (
           SELECT ${ORIGEM_CASE('')} AS origem, tipo, valor, titulo_pagar_id, titulo_receber_id, despesa_id, receita_id, origem_modulo
           FROM tab_movimento_caixa WHERE empresa_id=$1 AND data_movimento >= CURRENT_DATE - $2::int AND data_movimento <= CURRENT_DATE
           UNION ALL
           SELECT ${ORIGEM_CASE('')} AS origem, tipo, valor, titulo_pagar_id, titulo_receber_id, despesa_id, receita_id, origem_modulo
           FROM tab_movimento_banco WHERE empresa_id=$1 AND data_movimento >= CURRENT_DATE - $2::int AND data_movimento <= CURRENT_DATE
         ) x GROUP BY origem, tipo`,
        [empresaId, periodoDias - 1],
      ),

      db.query(
        `SELECT TO_CHAR(data_vencimento,'YYYY-MM-DD') AS data_vencimento,
                (valor_original + valor_juros + valor_multa - valor_desconto) AS valor, 'receber' AS tipo
         FROM tab_titulo_receber
         WHERE empresa_id=$1 AND status='A' AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
         UNION ALL
         SELECT TO_CHAR(data_vencimento,'YYYY-MM-DD'),
                (valor_original + valor_juros + valor_multa - valor_desconto), 'pagar'
         FROM tab_titulo_pagar
         WHERE empresa_id=$1 AND status='A' AND data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
         UNION ALL
         SELECT TO_CHAR(p.data_prevista,'YYYY-MM-DD'), p.valor_liquido, 'receber'
         FROM tab_venda_cartao_parcela p
         JOIN tab_venda_cartao v ON v.id = p.venda_cartao_id
         WHERE v.empresa_id=$1 AND v.status='PENDENTE' AND p.status IN ('PENDENTE','FATURADA')
           AND p.data_prevista BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
        [empresaId],
      ),

      db.query(
        `SELECT id, 'Caixa' AS conta, tipo, valor, TO_CHAR(data_movimento,'YYYY-MM-DD') AS data_movimento,
                documento, observacao, ${ORIGEM_CASE('')} AS origem
         FROM tab_movimento_caixa WHERE empresa_id=$1
         UNION ALL
         SELECT mb.id, cb.mnemonico AS conta, mb.tipo, mb.valor, TO_CHAR(mb.data_movimento,'YYYY-MM-DD'),
                mb.documento, mb.observacao, ${ORIGEM_CASE('mb.')} AS origem
         FROM tab_movimento_banco mb JOIN tab_conta_banco cb ON cb.id = mb.conta_banco_id WHERE mb.empresa_id=$1
         ORDER BY data_movimento DESC, id DESC LIMIT 20`,
        [empresaId],
      ),
    ])

    const hoje = hojeRow[0].hoje as string

    const somaPorTipo = (rows: { tipo: string; total: string }[]) => {
      const m: Record<string, number> = { E: 0, S: 0 }
      for (const r of rows) m[r.tipo] = Number(r.total)
      return m
    }

    const hojeSoma    = somaPorTipo(hojeMovRows)
    const periodoSoma = somaPorTipo(periodoMovRows)
    const aberto      = abertoRow[0]

    const saldoCaixa = Number(saldoCaixaRow[0].saldo)
    const saldoBanco = Number(saldoBancoRow[0].saldo)
    const saldoTotal = saldoCaixa + saldoBanco

    const kpis = {
      saldoCaixa,
      saldoBanco,
      saldoTotal,
      entradasHoje:    hojeSoma.E,
      saidasHoje:      hojeSoma.S,
      resultadoHoje:   hojeSoma.E - hojeSoma.S,
      entradasPeriodo: periodoSoma.E,
      saidasPeriodo:   periodoSoma.S,
      aReceberAberto:  Number(aberto.a_receber),
      aReceberVencido: Number(aberto.a_receber_vencido),
      aPagarAberto:    Number(aberto.a_pagar),
      aPagarVencido:   Number(aberto.a_pagar_vencido),
      nReceberVencido: Number(aberto.n_receber_vencido),
      nPagarVencido:   Number(aberto.n_pagar_vencido),
      aReceberCartao:  Number(cartaoRow[0].total),
    }

    // Série diária: preenche todos os dias do período e calcula saldo acumulado
    // andando de trás para frente a partir do saldo atual (hoje = saldoTotal real)
    const [Y, M, D] = hoje.split('-').map(Number)
    const dias: string[] = []
    for (let i = periodoDias - 1; i >= 0; i--) {
      dias.push(new Date(Date.UTC(Y, M - 1, D - i)).toISOString().slice(0, 10))
    }

    const porDia: Record<string, { entradas: number; saidas: number }> = {}
    for (const d of dias) porDia[d] = { entradas: 0, saidas: 0 }
    for (const r of serieRows as { data_movimento: string; tipo: string; valor: string }[]) {
      if (!porDia[r.data_movimento]) continue
      if (r.tipo === 'E') porDia[r.data_movimento].entradas = Number(r.valor)
      else porDia[r.data_movimento].saidas = Number(r.valor)
    }

    const saldoPorDia: Record<string, number> = {}
    let acumulado = saldoTotal
    for (let i = dias.length - 1; i >= 0; i--) {
      const d = dias[i]
      saldoPorDia[d] = acumulado
      acumulado -= (porDia[d].entradas - porDia[d].saidas)
    }

    const serie = dias.map(d => ({
      data:     d,
      entradas: porDia[d].entradas,
      saidas:   porDia[d].saidas,
      saldo:    saldoPorDia[d],
    }))

    // Composição por origem
    const origemMap: Record<string, { entradas: number; saidas: number }> = {}
    for (const r of origemRows as { origem: string; tipo: string; total: string }[]) {
      if (!origemMap[r.origem]) origemMap[r.origem] = { entradas: 0, saidas: 0 }
      if (r.tipo === 'E') origemMap[r.origem].entradas = Number(r.total)
      else origemMap[r.origem].saidas = Number(r.total)
    }
    const origem = Object.entries(origemMap)
      .map(([origem, v]) => ({ origem, ...v }))
      .sort((a, b) => (b.entradas + b.saidas) - (a.entradas + a.saidas))

    // Projeção — próximos 30 dias em 4 blocos semanais
    const bucketLabels = ['1-7 dias', '8-14 dias', '15-21 dias', '22-30 dias']
    const projecao = bucketLabels.map(label => ({ label, aReceber: 0, aPagar: 0 }))
    for (const r of projecaoRows as { data_vencimento: string; valor: string; tipo: string }[]) {
      const diff = diffDiasUTC(hoje, r.data_vencimento)
      const idx  = Math.min(3, Math.max(0, Math.floor(diff / 7)))
      if (r.tipo === 'receber') projecao[idx].aReceber += Number(r.valor)
      else projecao[idx].aPagar += Number(r.valor)
    }

    const movimentos = (movRows as any[]).map(m => ({
      id:             m.id,
      conta:          m.conta,
      tipo:           m.tipo,
      valor:          Number(m.valor),
      data_movimento: m.data_movimento,
      documento:      m.documento,
      observacao:     m.observacao,
      origem:         m.origem,
    }))

    return NextResponse.json({
      periodoDias,
      hoje,
      kpis,
      serie,
      origem,
      projecao,
      movimentos,
    })
  } catch (err) {
    console.error('[gerencial/fluxo-caixa]', err)
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 })
  }
}
