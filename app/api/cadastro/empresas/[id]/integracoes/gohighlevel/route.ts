import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { dbControl } from '@/lib/db'

const INTEGRACAO = 'gohighlevel'

// GET /api/cadastro/empresas/[id]/integracoes/gohighlevel
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const { rows } = await dbControl.query(
    `SELECT token, ativo FROM tab_integracao_api_token
     WHERE database_name = $1 AND empresa_id = $2 AND integracao = $3`,
    [session.database_name, params.id, INTEGRACAO],
  )

  return NextResponse.json(rows[0] ?? null)
}

// POST /api/cadastro/empresas/[id]/integracoes/gohighlevel — gera/regenera o token
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const token = randomBytes(32).toString('hex')

  const { rows } = await dbControl.query(
    `INSERT INTO tab_integracao_api_token (database_name, empresa_id, integracao, token, ativo)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (database_name, empresa_id, integracao)
     DO UPDATE SET token = EXCLUDED.token, ativo = true, updated_at = NOW()
     RETURNING token, ativo`,
    [session.database_name, params.id, INTEGRACAO, token],
  )

  return NextResponse.json(rows[0])
}

// PATCH /api/cadastro/empresas/[id]/integracoes/gohighlevel — liga/desliga sem trocar o token
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (typeof body?.ativo !== 'boolean') {
    return NextResponse.json({ erro: 'Campo ativo (boolean) é obrigatório' }, { status: 400 })
  }

  const { rows } = await dbControl.query(
    `UPDATE tab_integracao_api_token SET ativo = $1, updated_at = NOW()
     WHERE database_name = $2 AND empresa_id = $3 AND integracao = $4
     RETURNING token, ativo`,
    [body.ativo, session.database_name, params.id, INTEGRACAO],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Token ainda não foi gerado' }, { status: 404 })
  return NextResponse.json(rows[0])
}
