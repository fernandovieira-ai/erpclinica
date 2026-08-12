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
  let fechamento: Record<string, unknown> | null = null
  try {
    const { rows } = await db.query(
      `SELECT * FROM tab_fechamento_caixa_diario WHERE empresa_id = $1 AND data = $2`,
      [empresaId, data],
    )
    fechamento = rows[0] ?? null
  } catch {
    fechamento = null
  }

  const { rows: agendamentos } = await db.query(
    `SELECT
       a.id, a.data_hora_inicio, a.data_hora_fim, a.status, a.motivo,
       pac.id AS paciente_id, pac.nome AS paciente_nome,
       pro.id AS profissional_id, pro.nome AS profissional_nome,
       tp.descricao AS tipo_descricao,
       rc.id AS recebimento_id, rc.status_recebimento, rc.total_recebimento,
       rc.batch_agendamento_id, rc.condicao_pagamento_id,
       cp.tipo_pagamento, cp.descricao AS condicao_descricao
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

  // KPIs calculados em JS a partir do mesmo array de agendamentos, pra garantir
  // que a lista exibida e os totais batem sempre (evita drift entre queries).
  const porForma: Record<string, number> = { dinheiro: 0, pix: 0, debito: 0, credito: 0, a_prazo: 0 }
  const porProfissionalMap = new Map<number, {
    profissional_id: number; profissional_nome: string
    total_agendados: number; atendidos: number; faltas: number; total_recebido: number
  }>()

  let totalAtendidos = 0, totalFaltas = 0, totalCancelados = 0, totalRecebido = 0

  for (const ag of agendamentos) {
    if (ag.status === 'ATENDIDO') totalAtendidos++
    else if (ag.status === 'FALTOU') totalFaltas++
    else if (ag.status === 'CANCELADO') totalCancelados++

    if (ag.status_recebimento === 'PAGO') {
      const valor = Number(ag.total_recebimento) || 0
      totalRecebido += valor
      if (ag.tipo_pagamento && TIPOS_PAGAMENTO.includes(ag.tipo_pagamento)) {
        porForma[ag.tipo_pagamento as string] += valor
      }
    }

    let prof = porProfissionalMap.get(ag.profissional_id)
    if (!prof) {
      prof = { profissional_id: ag.profissional_id, profissional_nome: ag.profissional_nome, total_agendados: 0, atendidos: 0, faltas: 0, total_recebido: 0 }
      porProfissionalMap.set(ag.profissional_id, prof)
    }
    prof.total_agendados++
    if (ag.status === 'ATENDIDO') prof.atendidos++
    if (ag.status === 'FALTOU') prof.faltas++
    if (ag.status_recebimento === 'PAGO') prof.total_recebido += Number(ag.total_recebimento) || 0
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
      ticket_medio: ticketMedio,
      por_forma: porForma,
      por_profissional: porProfissional,
    },
  })
}
