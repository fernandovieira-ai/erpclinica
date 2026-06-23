import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { agendamentoSchema } from '@/lib/validators/agendamento.schema'

// GET /api/clinica/agendamentos?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&profissional_id=&status=
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp             = req.nextUrl.searchParams
  const inicio         = sp.get('inicio') || ''
  const fim            = sp.get('fim')    || ''
  const profissional_id = sp.get('profissional_id') || ''
  const status         = sp.get('status') || ''

  const db = getDb(session.database_name)

  const conds: string[]   = ['a.empresa_id = $1']
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (inicio) {
    conds.push(`a.data_hora_inicio >= $${pi++}`)
    params.push(inicio)
  }
  if (fim) {
    conds.push(`a.data_hora_inicio <= $${pi++}`)
    params.push(fim + ' 23:59:59')
  }
  if (profissional_id) {
    conds.push(`a.profissional_id = $${pi++}`)
    params.push(Number(profissional_id))
  }
  if (status) {
    conds.push(`a.status = $${pi++}`)
    params.push(status)
  }

  const where = conds.join(' AND ')

  const { rows } = await db.query(
    `SELECT
       a.id, a.data_hora_inicio, a.data_hora_fim, a.status, a.motivo, a.observacao,
       pac.id   AS paciente_id,    pac.nome  AS paciente_nome,
       pac.celular AS paciente_celular, pac.cpf_cnpj AS paciente_cpf,
       pro.id   AS profissional_id, pro.nome AS profissional_nome,
       tp.id    AS tipo_id,         tp.descricao AS tipo_descricao,
       tp.cor   AS tipo_cor,        tp.duracao_min AS tipo_duracao_min,
       tp.valor AS tipo_valor,
       esp.id   AS especialidade_id, esp.descricao AS especialidade_descricao,
       esp.cor  AS especialidade_cor,
       cat.id   AS categoria_id,    cat.descricao AS categoria_descricao,
       rc.id AS recebimento_id, rc.status_recebimento, rc.total_recebimento
     FROM tab_agendamento a
       JOIN tab_pessoa pac  ON pac.id = a.paciente_id
       JOIN tab_pessoa pro  ON pro.id = a.profissional_id
       LEFT JOIN tab_agendamento_tipo tp  ON tp.id = a.tipo_id
       LEFT JOIN tab_especialidade    esp ON esp.id = a.especialidade_id
       LEFT JOIN tab_categoria        cat ON cat.id = a.categoria_id
       LEFT JOIN tab_recebimento_consulta rc ON rc.agendamento_id = a.id
     WHERE ${where}
     ORDER BY a.data_hora_inicio`,
    params,
  )

  return NextResponse.json({ dados: rows, total: rows.length })
}

// POST /api/clinica/agendamentos
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = agendamentoSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  // Verificar conflito de horário para o profissional
  const { rows: conflito } = await db.query(
    `SELECT id FROM tab_agendamento
     WHERE profissional_id = $1
       AND empresa_id = $2
       AND status NOT IN ('CANCELADO','FALTOU')
       AND (data_hora_inicio, data_hora_fim) OVERLAPS ($3::timestamptz, $4::timestamptz)`,
    [d.profissional_id, session.empresa_id_ativa, d.data_hora_inicio, d.data_hora_fim],
  )

  if (conflito.length > 0) {
    return NextResponse.json(
      { erro: 'Profissional já possui agendamento nesse horário' },
      { status: 409 },
    )
  }

  const { rows } = await db.query(
    `INSERT INTO tab_agendamento (
       empresa_id, paciente_id, profissional_id, tipo_id, especialidade_id,
       data_hora_inicio, data_hora_fim, status, motivo, observacao, categoria_id, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      session.empresa_id_ativa, d.paciente_id, d.profissional_id,
      d.tipo_id ?? null, d.especialidade_id ?? null,
      d.data_hora_inicio, d.data_hora_fim,
      d.status, d.motivo ?? null, d.observacao ?? null,
      d.categoria_id ?? null,
      session.nome,
    ],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
