import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

const TIPOS_PAGAMENTO = ['dinheiro', 'pix', 'debito', 'credito', 'a_prazo'] as const

// GET /api/gerencial/fechamento-diario?data=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const data = req.nextUrl.searchParams.get('data') || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ erro: 'Parâmetro data inválido, use YYYY-MM-DD' }, { status: 400 })
  }

  const db        = getDb(session.database_name)
  const empresaId = session.empresa_id_ativa

  // tab_fechamento_caixa_diario é tabela nova (migration 51) - pode ainda não existir
  // no banco em algum ambiente que não rodou a migration; tratar como dia ABERTO nesse caso.
  // Só esse erro (42P01 = tabela inexistente) é tolerado: qualquer outra falha (conexão, permissão)
  // vira 500, em vez de mostrar como ABERTO um dia que pode estar FECHADO.
  const consultaFechamento = db.query(
    `SELECT * FROM tab_fechamento_caixa_diario WHERE empresa_id = $1 AND data = $2`,
    [empresaId, data],
  ).then(r => (r.rows[0] ?? null) as Record<string, unknown> | null)
    .catch((err: { code?: string }) => {
      if (err?.code === '42P01') return null
      throw err
    })

  // As consultas são independentes: rodam juntas (uma ida ao banco a menos no tempo total)
  const consultaAgendamentos = db.query(
    `SELECT
       a.id, a.data_hora_inicio, a.data_hora_fim, a.status, a.motivo,
       pac.id AS paciente_id, pac.nome AS paciente_nome,
       pro.id AS profissional_id, pro.nome AS profissional_nome,
       tp.descricao AS tipo_descricao,
       rc.id AS recebimento_id, rc.status_recebimento, rc.total_recebimento, rc.valor_desconto,
       rc.percentual_profissional, rc.valor_profissional, rc.valor_clinica,
       rc.batch_agendamento_id, rc.condicao_pagamento_id,
       cp.tipo_pagamento, cp.descricao AS condicao_descricao,
       (SELECT COALESCE(json_agg(json_build_object(
                  'descricao', cp2.descricao, 'tipo_pagamento', cp2.tipo_pagamento, 'valor', rp.valor
                ) ORDER BY rp.id), '[]')
          FROM tab_recebimento_pagamento rp
            JOIN tab_condicao_pagamento cp2 ON cp2.id = rp.condicao_pagamento_id
          WHERE rp.empresa_id = a.empresa_id AND rp.batch_agendamento_id = rc.batch_agendamento_id
       ) AS formas_pagamento
     FROM tab_agendamento a
       JOIN tab_pessoa pac ON pac.id = a.paciente_id
       JOIN tab_pessoa pro ON pro.id = a.profissional_id
       LEFT JOIN tab_agendamento_tipo tp ON tp.id = a.tipo_id
       LEFT JOIN tab_recebimento_consulta rc ON rc.agendamento_id = a.id AND rc.status_recebimento = 'PAGO'
       LEFT JOIN tab_condicao_pagamento cp ON cp.id = rc.condicao_pagamento_id
     WHERE a.empresa_id = $1
       AND a.data_hora_inicio >= $2::date
       AND a.data_hora_inicio <  ($2::date + INTERVAL '1 day')
     ORDER BY a.data_hora_inicio ASC`,
    [empresaId, data],
  )

  // Totais por forma de pagamento: lotes com split (pagamento misto, a partir da migração 66)
  // vêm de tab_recebimento_pagamento (1 linha por forma, não atribui o lote inteiro a uma
  // forma só). Lotes ANTERIORES à migração 66 (ou qualquer um sem linha lá, por qualquer
  // motivo) caem no fallback: usam rc.condicao_pagamento_id como forma única do lote inteiro
  // — é o mesmo dado que já existia antes do pagamento misto, só não pode ficar de fora da
  // soma (senão total por forma < total_recebido, como aconteceu num recebimento legado real
  // no dia 02/10/2026 que sumia da soma por forma). Ver padroes.md "Pagamento misto".
  const consultaPorForma = db.query(
    `WITH lotes_pagos AS (
       SELECT rc.batch_agendamento_id, rc.condicao_pagamento_id, SUM(rc.total_recebimento) AS total_lote
       FROM tab_recebimento_consulta rc
         JOIN tab_agendamento a ON a.id = rc.agendamento_id
       WHERE a.empresa_id = $1 AND rc.status_recebimento = 'PAGO'
         AND a.data_hora_inicio >= $2::date
         AND a.data_hora_inicio <  ($2::date + INTERVAL '1 day')
       GROUP BY rc.batch_agendamento_id, rc.condicao_pagamento_id
     ),
     formas AS (
       SELECT rp.batch_agendamento_id, rp.condicao_pagamento_id, rp.valor
       FROM tab_recebimento_pagamento rp
       WHERE rp.empresa_id = $1
         AND rp.batch_agendamento_id IN (SELECT batch_agendamento_id FROM lotes_pagos)
     )
     SELECT cp.tipo_pagamento, SUM(f.valor) AS total
     FROM (
       SELECT batch_agendamento_id, condicao_pagamento_id, valor FROM formas
       UNION ALL
       SELECT lp.batch_agendamento_id, lp.condicao_pagamento_id, lp.total_lote
       FROM lotes_pagos lp
       WHERE NOT EXISTS (SELECT 1 FROM formas f WHERE f.batch_agendamento_id = lp.batch_agendamento_id)
     ) f
       JOIN tab_condicao_pagamento cp ON cp.id = f.condicao_pagamento_id
     GROUP BY cp.tipo_pagamento`,
    [empresaId, data],
  )

  let fechamento: Record<string, unknown> | null
  let agendamentos: Record<string, any>[]
  let porFormaRows: { tipo_pagamento: string; total: string }[]
  try {
    const [f, a, pf] = await Promise.all([consultaFechamento, consultaAgendamentos, consultaPorForma])
    fechamento   = f
    agendamentos = a.rows
    porFormaRows = pf.rows
  } catch (err) {
    console.error('[GET /api/gerencial/fechamento-diario]', err)
    return NextResponse.json({ erro: 'Erro ao carregar o fechamento do dia' }, { status: 500 })
  }

  // KPIs de atendimento/repasse calculados em JS a partir do mesmo array de agendamentos,
  // pra garantir que a lista exibida e os totais batem sempre (evita drift entre queries).
  // por_forma vem da query dedicada acima (fonte: tab_recebimento_pagamento).
  const porForma: Record<string, number> = { dinheiro: 0, pix: 0, debito: 0, credito: 0, a_prazo: 0 }
  for (const r of porFormaRows) {
    if (r.tipo_pagamento && TIPOS_PAGAMENTO.includes(r.tipo_pagamento as typeof TIPOS_PAGAMENTO[number])) {
      porForma[r.tipo_pagamento] = Number(r.total) || 0
    }
  }
  const porProfissionalMap = new Map<number, {
    profissional_id: number; profissional_nome: string
    total_agendados: number; atendidos: number; faltas: number; total_recebido: number
    total_repasse: number; total_clinica: number
  }>()

  let totalAtendidos = 0, totalFaltas = 0, totalCancelados = 0, totalRecebido = 0
  let totalRepasse = 0, totalClinica = 0

  for (const ag of agendamentos) {
    if (ag.status === 'ATENDIDO') totalAtendidos++
    else if (ag.status === 'FALTOU') totalFaltas++
    else if (ag.status === 'CANCELADO') totalCancelados++

    const repasse = Number(ag.valor_profissional) || 0
    const clinica = ag.valor_clinica != null ? Number(ag.valor_clinica) : ((Number(ag.total_recebimento) || 0) - repasse)

    if (ag.status_recebimento === 'PAGO') {
      const valor = Number(ag.total_recebimento) || 0
      totalRecebido += valor
      totalRepasse += repasse
      totalClinica += clinica
    }

    let prof = porProfissionalMap.get(ag.profissional_id)
    if (!prof) {
      prof = { profissional_id: ag.profissional_id, profissional_nome: ag.profissional_nome, total_agendados: 0, atendidos: 0, faltas: 0, total_recebido: 0, total_repasse: 0, total_clinica: 0 }
      porProfissionalMap.set(ag.profissional_id, prof)
    }
    prof.total_agendados++
    if (ag.status === 'ATENDIDO') prof.atendidos++
    if (ag.status === 'FALTOU') prof.faltas++
    if (ag.status_recebimento === 'PAGO') {
      prof.total_recebido += Number(ag.total_recebimento) || 0
      prof.total_repasse  += repasse
      prof.total_clinica  += clinica
    }
  }

  const totalAgendados     = agendamentos.length
  const baseComparecimento = totalAtendidos + totalFaltas
  const taxaComparecimento = baseComparecimento > 0 ? (totalAtendidos / baseComparecimento) * 100 : 0
  const ticketMedio         = totalAtendidos > 0 ? totalRecebido / totalAtendidos : 0

  const porProfissional = [...porProfissionalMap.values()].sort((a, b) => b.atendidos - a.atendidos || a.profissional_nome.localeCompare(b.profissional_nome))

  return NextResponse.json({
    data,
    fechamento,
    agendamentos,
    kpis: {
      total_agendados: totalAgendados,
      total_atendidos: totalAtendidos,
      total_faltas: totalFaltas,
      total_cancelados: totalCancelados,
      taxa_comparecimento: taxaComparecimento,
      total_recebido: totalRecebido,
      total_repasse: totalRepasse,
      total_clinica: totalClinica,
      ticket_medio: ticketMedio,
      por_forma: porForma,
      por_profissional: porProfissional,
    },
  })
}
