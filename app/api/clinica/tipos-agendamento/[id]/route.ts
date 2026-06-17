import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { agendamentoTipoSchema } from '@/lib/validators/agendamento.schema'

type Params = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT id, descricao, duracao_min, cor, ativo
     FROM tab_agendamento_tipo
     WHERE id = $1 AND empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows[0]) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json()
  const db   = getDb(session.database_name)

  if ('ativo' in body && Object.keys(body).length === 1) {
    await db.query(
      `UPDATE tab_agendamento_tipo SET ativo = $1 WHERE id = $2 AND empresa_id = $3`,
      [body.ativo, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const parsed = agendamentoTipoSchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ erro: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data
  await db.query(
    `UPDATE tab_agendamento_tipo
     SET descricao   = COALESCE($1, descricao),
         duracao_min = COALESCE($2, duracao_min),
         cor         = COALESCE($3, cor),
         ativo       = COALESCE($4, ativo)
     WHERE id = $5 AND empresa_id = $6`,
    [
      d.descricao ? d.descricao.toUpperCase() : null,
      d.duracao_min ?? null,
      d.cor ?? null,
      (d as Record<string, unknown>).ativo ?? null,
      params.id,
      session.empresa_id_ativa,
    ],
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  try {
    await db.query(
      `DELETE FROM tab_agendamento_tipo WHERE id = $1 AND empresa_id = $2`,
      [params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ erro: 'Erro ao excluir — verifique se não há agendamentos vinculados' }, { status: 409 })
  }
}
