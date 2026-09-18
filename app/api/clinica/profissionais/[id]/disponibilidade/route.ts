import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { avaliarDisponibilidade, sqlDadosDisponibilidade } from '@/lib/clinica/disponibilidade'

// GET /api/clinica/profissionais/[id]/disponibilidade?data=YYYY-MM-DD&hora_inicio=HH:MM&hora_fim=HH:MM
// O lançamento de agendamento (POST /api/clinica/agendamentos) já valida isso no servidor;
// esta rota fica pra consultas avulsas de disponibilidade.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const data = req.nextUrl.searchParams.get('data')
  const hora_inicio = req.nextUrl.searchParams.get('hora_inicio')
  const hora_fim = req.nextUrl.searchParams.get('hora_fim')

  if (!data || !hora_inicio || !hora_fim) {
    return NextResponse.json({ erro: 'Parâmetros obrigatórios: data, hora_inicio, hora_fim' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora_inicio) || !/^\d{2}:\d{2}$/.test(hora_fim)) {
    return NextResponse.json({ erro: 'Parâmetros inválidos (data YYYY-MM-DD, horas HH:MM)' }, { status: 400 })
  }
  const profissionalId = Number(params.id)
  if (!Number.isInteger(profissionalId) || profissionalId <= 0) {
    return NextResponse.json({ erro: 'Profissional inválido' }, { status: 400 })
  }

  const db = getDb(session.database_name)

  try {
    const { rows: [dados] } = await db.query(
      `SELECT ${sqlDadosDisponibilidade('$3::date')}`,
      [profissionalId, session.empresa_id_ativa, data],
    )
    return NextResponse.json(avaliarDisponibilidade(dados, hora_inicio, hora_fim))
  } catch (err) {
    console.error('Erro ao validar disponibilidade:', err)
    return NextResponse.json({ erro: 'Erro ao validar disponibilidade' }, { status: 500 })
  }
}
