import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { agendamentoSchema } from '@/lib/validators/agendamento.schema'

type Params = { params: { id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT
       a.id, a.empresa_id, a.data_hora_inicio, a.data_hora_fim, a.status, a.motivo, a.observacao,
       a.created_by, a.created_at, a.updated_at,
       pac.id   AS paciente_id,    pac.nome  AS paciente_nome,
       pac.celular AS paciente_celular, pac.cpf_cnpj AS paciente_cpf,
       pro.id   AS profissional_id, pro.nome AS profissional_nome,
       tp.id    AS tipo_id,         tp.descricao AS tipo_descricao,
       tp.cor   AS tipo_cor,        tp.duracao_min AS tipo_duracao_min,
       esp.id   AS especialidade_id, esp.descricao AS especialidade_descricao, esp.cor AS especialidade_cor,
       cat.id   AS categoria_id,    cat.descricao AS categoria_descricao
     FROM tab_agendamento a
       JOIN tab_pessoa pac  ON pac.id = a.paciente_id
       JOIN tab_pessoa pro  ON pro.id = a.profissional_id
       LEFT JOIN tab_agendamento_tipo tp  ON tp.id = a.tipo_id
       LEFT JOIN tab_especialidade    esp ON esp.id = a.especialidade_id
       LEFT JOIN tab_categoria        cat ON cat.id = a.categoria_id
     WHERE a.id = $1 AND a.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows[0]) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = agendamentoSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  // Verificar conflito excluindo o próprio registro
  const { rows: conflito } = await db.query(
    `SELECT id FROM tab_agendamento
     WHERE profissional_id = $1 AND empresa_id = $2 AND id <> $3
       AND status NOT IN ('CANCELADO','FALTOU')
       AND (data_hora_inicio, data_hora_fim) OVERLAPS ($4::timestamptz, $5::timestamptz)`,
    [d.profissional_id, session.empresa_id_ativa, params.id, d.data_hora_inicio, d.data_hora_fim],
  )

  if (conflito.length > 0) {
    return NextResponse.json(
      { erro: 'Profissional já possui agendamento nesse horário' },
      { status: 409 },
    )
  }

  const { rowCount } = await db.query(
    `UPDATE tab_agendamento SET
       paciente_id=$1, profissional_id=$2, tipo_id=$3, especialidade_id=$4,
       data_hora_inicio=$5, data_hora_fim=$6, status=$7, motivo=$8, observacao=$9,
       categoria_id=$10
     WHERE id=$11 AND empresa_id=$12`,
    [
      d.paciente_id, d.profissional_id,
      d.tipo_id ?? null, d.especialidade_id ?? null,
      d.data_hora_inicio, d.data_hora_fim,
      d.status, d.motivo ?? null, d.observacao ?? null,
      d.categoria_id ?? null,
      params.id, session.empresa_id_ativa,
    ],
  )

  if (!rowCount) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// PATCH — atualizar só o status
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const { status } = await req.json()
  const db = getDb(session.database_name)

  const { rowCount } = await db.query(
    `UPDATE tab_agendamento SET status=$1 WHERE id=$2 AND empresa_id=$3`,
    [status, params.id, session.empresa_id_ativa],
  )

  if (!rowCount) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rowCount } = await db.query(
    `DELETE FROM tab_agendamento WHERE id=$1 AND empresa_id=$2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rowCount) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
