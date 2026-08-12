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

    const { rows: totRows } = await client.query(
      `SELECT
         COUNT(a.id) AS total_agendados,
         COUNT(a.id) FILTER (WHERE a.status = 'ATENDIDO')  AS total_atendidos,
         COUNT(a.id) FILTER (WHERE a.status = 'FALTOU')    AS total_faltas,
         COUNT(a.id) FILTER (WHERE a.status = 'CANCELADO') AS total_cancelados,
         COALESCE(SUM(rc.total_recebimento) FILTER (WHERE cp.tipo_pagamento = 'dinheiro'), 0) AS total_dinheiro,
         COALESCE(SUM(rc.total_recebimento) FILTER (WHERE cp.tipo_pagamento = 'pix'),      0) AS total_pix,
         COALESCE(SUM(rc.total_recebimento) FILTER (WHERE cp.tipo_pagamento = 'debito'),   0) AS total_debito,
         COALESCE(SUM(rc.total_recebimento) FILTER (WHERE cp.tipo_pagamento = 'credito'),  0) AS total_credito,
         COALESCE(SUM(rc.total_recebimento) FILTER (WHERE cp.tipo_pagamento = 'a_prazo'),  0) AS total_a_prazo,
         COALESCE(SUM(rc.total_recebimento), 0) AS total_recebido
       FROM tab_agendamento a
         LEFT JOIN tab_recebimento_consulta rc ON rc.agendamento_id = a.id AND rc.status_recebimento = 'PAGO'
         LEFT JOIN tab_condicao_pagamento cp ON cp.id = rc.condicao_pagamento_id
       WHERE a.empresa_id = $1
         AND a.data_hora_inicio >= $2::date
         AND a.data_hora_inicio <  ($2::date + INTERVAL '1 day')`,
      [empresaId, payload.data],
    )
    const t = totRows[0]
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
        t.total_dinheiro, t.total_pix, t.total_debito, t.total_credito, t.total_a_prazo, t.total_recebido,
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
