import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/recebimentos/parametros
// Endpoint dedicado (não usa /api/auth/me) para não onerar as demais telas que
// chamam a sessão — só o modal de recebimento precisa deste flag.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT recebimento_permite_valor_digitado, recebimento_permite_editar_valor_atendimento
     FROM tab_empresa WHERE id = $1`,
    [session.empresa_id_ativa],
  )

  return NextResponse.json({
    recebimento_permite_valor_digitado: rows[0]?.recebimento_permite_valor_digitado ?? false,
    recebimento_permite_editar_valor_atendimento: rows[0]?.recebimento_permite_editar_valor_atendimento ?? false,
  })
}
