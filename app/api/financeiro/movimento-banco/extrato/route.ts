import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

const ORIGEM_TIPO_CASE = `
  CASE
    WHEN mb.origem_modulo = 'CLI'    THEN 'Clínica'
    WHEN mb.origem_modulo = 'REC'    THEN 'Recebimento'
    WHEN mb.origem_modulo = 'CARTAO' THEN 'Cartão'
    WHEN mb.titulo_pagar_id   IS NOT NULL THEN 'Tít. Pagar'
    WHEN mb.titulo_receber_id IS NOT NULL THEN 'Tít. Receber'
    WHEN mb.despesa_id        IS NOT NULL THEN 'Despesa'
    WHEN mb.receita_id        IS NOT NULL THEN 'Receita'
    ELSE 'Manual'
  END
`

const ORIGEM_DESC_CASE = `
  CASE
    WHEN mb.origem_modulo = 'CLI'    THEN COALESCE(mb.observacao, 'Recebimento de consulta')
    WHEN mb.origem_modulo = 'REC'    THEN 'RECEBIMENTO (Clínica)'
    WHEN mb.origem_modulo = 'CARTAO' THEN mb.observacao
    WHEN mb.titulo_pagar_id IS NOT NULL THEN
      COALESCE(td_tp.descricao, tp.num_documento, tp.numero_titulo)
    WHEN mb.titulo_receber_id IS NOT NULL THEN
      COALESCE(tr_trec.descricao, trec.num_documento, trec.numero_titulo)
    WHEN mb.despesa_id IS NOT NULL THEN
      COALESCE(td_desp.descricao, desp.documento)
    WHEN mb.receita_id IS NOT NULL THEN
      tr_rec.descricao
    ELSE NULL
  END
`

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DIAS_PERIODO = 400

function diffDiasUTC(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10)
}

function inicioMesISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// GET /api/financeiro/movimento-banco/extrato?conta_banco_id=&data_inicio=&data_fim=&tipo=&conciliado=&busca=
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp             = req.nextUrl.searchParams
  const conta_banco_id = Number(sp.get('conta_banco_id') || 0)
  const tipo           = sp.get('tipo') || ''
  const conciliado     = sp.get('conciliado') || ''
  const busca          = sp.get('busca')?.trim() || ''

  const data_inicio_param = sp.get('data_inicio') || ''
  const data_fim_param    = sp.get('data_fim')    || ''

  let data_inicio: string
  let data_fim:    string

  if (!data_inicio_param && !data_fim_param) {
    // Nenhuma data informada (primeira carga) — assume o mês atual
    data_inicio = inicioMesISO()
    data_fim    = hojeISO()
  } else {
    // Período informado (mesmo que parcialmente) — se vier inválido, recusa em vez de
    // trocar silenciosamente pro mês atual, que já confundiu o usuário mostrando dados
    // de outro período sem aviso (ex: "até" com data impossível tipo 31/09)
    data_inicio = data_inicio_param
    data_fim    = data_fim_param
    if (!DATA_RE.test(data_inicio) || !DATA_RE.test(data_fim) || data_inicio > data_fim) {
      return NextResponse.json({ erro: 'Período inválido' }, { status: 400 })
    }
    if (diffDiasUTC(data_inicio, data_fim) > MAX_DIAS_PERIODO) {
      return NextResponse.json({ erro: `Período muito longo — selecione no máximo ${MAX_DIAS_PERIODO} dias` }, { status: 400 })
    }
  }

  if (!conta_banco_id) return NextResponse.json({ erro: 'Informe a conta bancária' }, { status: 400 })

  const db       = getDb(session.database_name)
  const empresaId = session.empresa_id_ativa

  const [{ rows: contaRows }, { rows: anteriorRows }] = await Promise.all([
    db.query(
      `SELECT cb.id, cb.mnemonico, b.nome AS banco_nome, b.codigo_compensacao AS banco_codigo,
              cb.agencia, cb.agencia_dv, cb.conta, cb.conta_dv, cb.tipo, cb.saldo_inicial, cb.saldo_atual
       FROM tab_conta_banco cb
       LEFT JOIN tab_banco b ON b.id = cb.banco_id
       WHERE cb.id = $1 AND cb.empresa_id = $2`,
      [conta_banco_id, empresaId],
    ),
    db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo='E' THEN valor ELSE -valor END), 0) AS delta_disp,
         COALESCE(SUM(CASE WHEN conciliado THEN (CASE WHEN tipo='E' THEN valor ELSE -valor END) ELSE 0 END), 0) AS delta_conc
       FROM tab_movimento_banco
       WHERE empresa_id = $1 AND conta_banco_id = $2 AND data_movimento < $3`,
      [empresaId, conta_banco_id, data_inicio],
    ),
  ])
  if (contaRows.length === 0) return NextResponse.json({ erro: 'Conta bancária não encontrada' }, { status: 404 })
  const conta = contaRows[0]

  const saldoAnteriorDisp = Number(conta.saldo_inicial) + Number(anteriorRows[0].delta_disp)
  const saldoAnteriorConc = Number(conta.saldo_inicial) + Number(anteriorRows[0].delta_conc)

  const conds: string[]   = [`mb.empresa_id = $1`, `mb.conta_banco_id = $2`, `mb.data_movimento >= $3`, `mb.data_movimento <= $4`]
  const params: unknown[] = [empresaId, conta_banco_id, data_inicio, data_fim]
  let pi = 5

  if (tipo) {
    conds.push(`mb.tipo = $${pi++}`)
    params.push(tipo)
  }
  if (conciliado === 'true') {
    conds.push(`mb.conciliado = true`)
  } else if (conciliado === 'false') {
    conds.push(`mb.conciliado = false`)
  }
  if (busca) {
    conds.push(`(mb.documento ILIKE $${pi} OR p.nome ILIKE $${pi} OR mb.observacao ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const { rows } = await db.query(
    `WITH periodo AS (
       SELECT mb.id, mb.tipo, mb.valor,
              TO_CHAR(mb.data_movimento, 'YYYY-MM-DD') AS data_movimento,
              mb.documento, mb.observacao, mb.conciliado,
              p.nome AS pessoa_nome,
              toc.descricao AS tipo_operacao_desc,
              ${ORIGEM_TIPO_CASE} AS origem_tipo,
              ${ORIGEM_DESC_CASE} AS origem_desc
       FROM tab_movimento_banco mb
       LEFT JOIN tab_pessoa               p       ON p.id      = mb.pessoa_id
       LEFT JOIN tab_tipo_operacao_caixa  toc     ON toc.id    = mb.tipo_operacao_id
       LEFT JOIN tab_titulo_pagar         tp      ON tp.id     = mb.titulo_pagar_id
       LEFT JOIN tab_tipo_despesa         td_tp   ON td_tp.id  = tp.tipo_despesa_id
       LEFT JOIN tab_titulo_receber       trec    ON trec.id   = mb.titulo_receber_id
       LEFT JOIN tab_tipo_receita         tr_trec ON tr_trec.id = trec.tipo_receita_id
       LEFT JOIN tab_despesa              desp    ON desp.id   = mb.despesa_id
       LEFT JOIN tab_tipo_despesa         td_desp ON td_desp.id = desp.tipo_despesa_id
       LEFT JOIN tab_receita              rec     ON rec.id    = mb.receita_id
       LEFT JOIN tab_tipo_receita         tr_rec  ON tr_rec.id = rec.tipo_receita_id
       ${where}
     )
     SELECT *,
       $${pi}::numeric + SUM(CASE WHEN tipo='E' THEN valor ELSE -valor END)
         OVER (ORDER BY data_movimento, id) AS saldo_disponivel,
       $${pi + 1}::numeric + SUM(CASE WHEN conciliado THEN (CASE WHEN tipo='E' THEN valor ELSE -valor END) ELSE 0 END)
         OVER (ORDER BY data_movimento, id) AS saldo_conciliado
     FROM periodo
     ORDER BY data_movimento, id`,
    [...params, saldoAnteriorDisp, saldoAnteriorConc],
  )

  let totalEntradas = 0
  let totalSaidas   = 0
  for (const r of rows as { tipo: string; valor: string }[]) {
    if (r.tipo === 'E') totalEntradas += Number(r.valor)
    else totalSaidas += Number(r.valor)
  }

  const saldoFinalDisp = rows.length ? Number((rows[rows.length - 1] as any).saldo_disponivel) : saldoAnteriorDisp
  const saldoFinalConc = rows.length ? Number((rows[rows.length - 1] as any).saldo_conciliado) : saldoAnteriorConc

  return NextResponse.json({
    conta: {
      id:             conta.id,
      mnemonico:      conta.mnemonico,
      banco_nome:     conta.banco_nome,
      banco_codigo:   conta.banco_codigo,
      agencia:        conta.agencia_dv ? `${conta.agencia}-${conta.agencia_dv}` : conta.agencia,
      conta:          conta.conta_dv ? `${conta.conta}-${conta.conta_dv}` : conta.conta,
      tipo:           conta.tipo,
    },
    periodo: { inicio: data_inicio, fim: data_fim },
    saldoAnteriorDisponivel: saldoAnteriorDisp,
    saldoAnteriorConciliado: saldoAnteriorConc,
    saldoFinalDisponivel:    saldoFinalDisp,
    saldoFinalConciliado:    saldoFinalConc,
    totalEntradas,
    totalSaidas,
    dados: rows,
  })
}
