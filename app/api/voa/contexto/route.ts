import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { montarContextoHistorico } from '@/lib/voa'

// GET /api/voa/contexto?paciente_id=X&agendamento_id=Y — histórico de prontuários
// anteriores do paciente (exceto o do próprio agendamento), formatado em markdown,
// pro botão "Buscar histórico" no campo de contexto da Voa.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const pacienteId    = Number(req.nextUrl.searchParams.get('paciente_id'))
  const agendamentoId = Number(req.nextUrl.searchParams.get('agendamento_id'))
  if (!pacienteId || !agendamentoId) {
    return NextResponse.json({ erro: 'Informe paciente_id e agendamento_id' }, { status: 400 })
  }

  const db = getDb(session.database_name)
  const contexto = await montarContextoHistorico(db, session.empresa_id_ativa, pacienteId, agendamentoId)
  return NextResponse.json({ contexto })
}
