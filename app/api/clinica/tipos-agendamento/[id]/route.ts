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
    `SELECT id, descricao, duracao_min, cor, valor, ativo, voa_clinical_type, eh_exame
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

  // Marcar/desmarcar "É exame" direto da grade: só esse campo. Precisa de ramo próprio porque o UPDATE geral
  // abaixo regrava valor e voa_clinical_type (ficariam NULL num PATCH com só eh_exame).
  if ('eh_exame' in body && Object.keys(body).length === 1) {
    if (typeof body.eh_exame !== 'boolean') return NextResponse.json({ erro: 'eh_exame deve ser verdadeiro ou falso' }, { status: 400 })
    if (!/^\d+$/.test(params.id)) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
    const { rowCount } = await db.query(
      `UPDATE tab_agendamento_tipo SET eh_exame = $1 WHERE id = $2 AND empresa_id = $3`,
      [body.eh_exame, params.id, session.empresa_id_ativa],
    )
    if (!rowCount) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  const parsed = agendamentoTipoSchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ erro: parsed.error.flatten() }, { status: 400 })

  const d = parsed.data
  await db.query(
    `UPDATE tab_agendamento_tipo
     SET descricao         = COALESCE($1, descricao),
         duracao_min       = COALESCE($2, duracao_min),
         cor               = COALESCE($3, cor),
         valor             = $4,
         ativo             = COALESCE($5, ativo),
         voa_clinical_type = $6,
         eh_exame          = COALESCE($7, eh_exame)
     WHERE id = $8 AND empresa_id = $9`,
    [
      d.descricao ? d.descricao.toUpperCase() : null,
      d.duracao_min ?? null,
      d.cor ?? null,
      (d.valor ?? null) as number | null,
      (d as Record<string, unknown>).ativo ?? null,
      d.voa_clinical_type ?? null,
      d.eh_exame ?? null,
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
