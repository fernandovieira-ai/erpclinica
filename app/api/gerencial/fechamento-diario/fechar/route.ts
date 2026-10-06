import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { paraLatin1 } from '@/lib/validators/prontuario.schema'

interface FecharPayload {
  data: string
  observacao?: string | null
}

// POST /api/gerencial/fechamento-diario/fechar
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  if (session.perfil !== 'admin') return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 })

  const payload: FecharPayload = await req.json()
  if (!payload.data || !/^\d{4}-\d{2}-\d{2}$/.test(payload.data)) {
    return NextResponse.json({ erro: 'Data inválida' }, { status: 400 })
  }

  const empresaId = session.empresa_id_ativa
  const client     = await getDb(session.database_name).connect()

  try {
    const { rows: atualRows } = await client.query(
      `SELECT status FROM tab_fechamento_caixa_diario WHERE empresa_id = $1 AND data = $2`,
      [empresaId, payload.data],
    )
    if (atualRows[0]?.status === 'FECHADO') {
      return NextResponse.json({ erro: 'Caixa do dia já está fechado' }, { status: 409 })
    }

    // Contagens de agendamento + total_recebido (por item, tab_recebimento_consulta —
    // não depende de forma de pagamento, continua correto com pagamento misto).
    const consultaTotais = client.query(
      `SELECT
         COUNT(a.id) AS total_agendados,
         COUNT(a.id) FILTER (WHERE a.status = 'ATENDIDO')  AS total_atendidos,
         COUNT(a.id) FILTER (WHERE a.status = 'FALTOU')    AS total_faltas,
         COUNT(a.id) FILTER (WHERE a.status = 'CANCELADO') AS total_cancelados,
         COALESCE(SUM(rc.total_recebimento), 0) AS total_recebido
       FROM tab_agendamento a
         LEFT JOIN tab_recebimento_consulta rc ON rc.agendamento_id = a.id AND rc.status_recebimento = 'PAGO'
       WHERE a.empresa_id = $1
         AND a.data_hora_inicio >= $2::date
         AND a.data_hora_inicio <  ($2::date + INTERVAL '1 day')`,
      [empresaId, payload.data],
    )

    // Totais por forma de pagamento: lotes com split (pagamento misto, migração 66) vêm de
    // tab_recebimento_pagamento (1 linha por forma). Lotes anteriores à migração (ou qualquer
    // um sem linha lá) caem no fallback: usam rc.condicao_pagamento_id como forma única do
    // lote inteiro — senão esses recebimentos legados somem da soma por forma (bug real visto
    // no fechamento de 02/10/2026: total batia, mas dinheiro+pix+... ficava menor que o total).
    // Ver mesma lógica em GET /api/gerencial/fechamento-diario.
    const consultaPorForma = client.query(
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
      [empresaId, payload.data],
    )

    const [{ rows: totRows }, { rows: porFormaRows }] = await Promise.all([consultaTotais, consultaPorForma])
    const t = totRows[0]
    const porForma: Record<string, number> = { dinheiro: 0, pix: 0, debito: 0, credito: 0, a_prazo: 0 }
    for (const r of porFormaRows as { tipo_pagamento: string; total: string }[]) {
      if (r.tipo_pagamento in porForma) porForma[r.tipo_pagamento] = Number(r.total) || 0
    }
    const observacao = payload.observacao ? paraLatin1(payload.observacao) : null

    const { rows } = await client.query(
      `INSERT INTO tab_fechamento_caixa_diario (
         empresa_id, data, status, fechado_por, fechado_em,
         total_agendados, total_atendidos, total_faltas, total_cancelados,
         total_dinheiro, total_pix, total_debito, total_credito, total_a_prazo, total_recebido,
         observacao, created_by
       ) VALUES ($1,$2,'FECHADO',$3,NOW(),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$3)
       ON CONFLICT (empresa_id, data) DO UPDATE SET
         status = 'FECHADO', fechado_por = $3, fechado_em = NOW(),
         total_agendados = $4, total_atendidos = $5, total_faltas = $6, total_cancelados = $7,
         total_dinheiro = $8, total_pix = $9, total_debito = $10, total_credito = $11,
         total_a_prazo = $12, total_recebido = $13, observacao = $14, updated_at = NOW()
       RETURNING *`,
      [
        empresaId, payload.data, session.nome ?? 'sistema',
        t.total_agendados, t.total_atendidos, t.total_faltas, t.total_cancelados,
        porForma.dinheiro, porForma.pix, porForma.debito, porForma.credito, porForma.a_prazo, t.total_recebido,
        observacao,
      ],
    )

    return NextResponse.json({ sucesso: true, fechamento: rows[0] })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Erro ao fechar caixa do dia:', errorMessage)
    return NextResponse.json({ erro: 'Erro ao fechar caixa do dia', detalhes: errorMessage }, { status: 500 })
  } finally {
    client.release()
  }
}
