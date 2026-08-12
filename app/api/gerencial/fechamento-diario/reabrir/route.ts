import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { paraLatin1 } from '@/lib/validators/prontuario.schema'

interface ReabrirPayload {
  data: string
  motivo?: string | null
}

// POST /api/gerencial/fechamento-diario/reabrir
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  if (session.perfil !== 'admin') return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 })

  const payload: ReabrirPayload = await req.json()
  if (!payload.data || !/^\d{4}-\d{2}-\d{2}$/.test(payload.data)) {
    return NextResponse.json({ erro: 'Data inválida' }, { status: 400 })
  }

  const db = getDb(session.database_name)

  try {
    const motivo = payload.motivo ? paraLatin1(payload.motivo) : null

    const { rows } = await db.query(
      `UPDATE tab_fechamento_caixa_diario
       SET status = 'ABERTO', reaberto_por = $3, reaberto_em = NOW(), motivo_reabertura = $4, updated_at = NOW()
       WHERE empresa_id = $1 AND data = $2 AND status = 'FECHADO'
       RETURNING *`,
      [session.empresa_id_ativa, payload.data, session.nome ?? 'sistema', motivo],
    )

    if (rows.length === 0) {
      return NextResponse.json({ erro: 'Caixa do dia não está fechado' }, { status: 404 })
    }

    return NextResponse.json({ sucesso: true, fechamento: rows[0] })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Erro ao reabrir caixa do dia:', errorMessage)
    return NextResponse.json({ erro: 'Erro ao reabrir caixa do dia', detalhes: errorMessage }, { status: 500 })
  }
}
