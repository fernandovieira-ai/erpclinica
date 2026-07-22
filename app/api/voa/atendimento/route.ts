import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// POST /api/voa/atendimento — persiste o UUID que a Voa gera pra consulta (evento
// voa.plugin.ehr.created), vinculado ao agendamento local. Só rastreabilidade/auditoria —
// não é crítico pro fluxo de gravação, por isso falha aqui não deve travar a UI.
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const agendamentoId      = Number(body?.agendamento_id)
  const voaAtendimentoId   = typeof body?.voa_atendimento_id === 'string' ? body.voa_atendimento_id : null
  const voaAtendimentoTipo = typeof body?.voa_atendimento_tipo === 'string' ? body.voa_atendimento_tipo : null

  if (!agendamentoId || !voaAtendimentoId) {
    return NextResponse.json({ erro: 'agendamento_id e voa_atendimento_id são obrigatórios' }, { status: 400 })
  }

  const db = getDb(session.database_name)
  const { rowCount } = await db.query(
    `UPDATE tab_agendamento
     SET voa_atendimento_id = $1, voa_atendimento_tipo = $2
     WHERE id = $3 AND empresa_id = $4`,
    [voaAtendimentoId, voaAtendimentoTipo, agendamentoId, session.empresa_id_ativa],
  )
  if (rowCount === 0) {
    return NextResponse.json({ erro: 'Agendamento não encontrado' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
