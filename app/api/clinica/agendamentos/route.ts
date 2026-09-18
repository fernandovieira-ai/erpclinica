import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { agendamentoSchema } from '@/lib/validators/agendamento.schema'
import { avaliarDisponibilidade, sqlDadosDisponibilidade } from '@/lib/clinica/disponibilidade'
import { MSG_TIPO_NAO_HABILITADO } from '@/lib/clinica/tipo-habilitado'
import {
  AGENDAMENTO_LISTA_COLUNAS, AGENDAMENTO_LISTA_JOINS, AGENDAMENTO_LISTA_SEM_RECEBIMENTO,
} from '@/lib/clinica/agendamento-lista'
import type { Pool } from 'pg'

const _tableCache = new Map<string, boolean>()
async function tabelaExiste(db: Pool, dbName: string, tableName: string): Promise<boolean> {
  const key = `${dbName}:${tableName}`
  if (_tableCache.has(key)) return _tableCache.get(key)!
  const { rows } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1) AS existe`,
    [tableName],
  )
  const existe = rows[0]?.existe === true
  _tableCache.set(key, existe)
  return existe
}

// GET /api/clinica/agendamentos?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&profissional_id=&status=&order=asc|desc&limit=
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp             = req.nextUrl.searchParams
  const inicio         = sp.get('inicio') || ''
  const fim            = sp.get('fim')    || ''
  const profissional_id = sp.get('profissional_id') || ''
  const paciente_id    = sp.get('paciente_id') || ''
  const status         = sp.get('status') || ''
  const order          = sp.get('order') === 'desc' ? 'DESC' : 'ASC'
  const limit          = Math.min(Math.max(Number(sp.get('limit')) || 500, 1), 500)

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
  if (paciente_id) {
    conds.push(`a.paciente_id = $${pi++}`)
    params.push(Number(paciente_id))
  }
  if (status) {
    conds.push(`a.status = $${pi++}`)
    params.push(status)
  }

  const where = conds.join(' AND ')

  const temTabelaRecebimento = await tabelaExiste(db, session.database_name, 'tab_recebimento_consulta')

  const selectRecebimento = temTabelaRecebimento
    ? `, rc.id AS recebimento_id, rc.status_recebimento, rc.total_recebimento, rc.movimento_caixa_id, rc.movimento_banco_id, rc.batch_agendamento_id`
    : `, NULL::INT AS recebimento_id, NULL::VARCHAR AS status_recebimento, NULL::NUMERIC AS total_recebimento, NULL::INT AS movimento_caixa_id, NULL::INT AS movimento_banco_id, NULL::INT AS batch_agendamento_id`

  // Usa subconsulta para evitar múltiplas linhas com LEFT JOIN filtrado
  const joinRecebimento = temTabelaRecebimento
    ? `LEFT JOIN (
        SELECT agendamento_id, id, status_recebimento, total_recebimento, movimento_caixa_id, movimento_banco_id, batch_agendamento_id
        FROM tab_recebimento_consulta
        WHERE status_recebimento = 'PAGO'
      ) rc ON rc.agendamento_id = a.id`
    : ''

  const { rows } = await db.query(
    `SELECT ${AGENDAMENTO_LISTA_COLUNAS}
       ${selectRecebimento}
     FROM tab_agendamento a
       ${AGENDAMENTO_LISTA_JOINS}
       ${joinRecebimento}
     WHERE ${where}
     ORDER BY a.data_hora_inicio ${order}
     LIMIT ${limit}`,
    params,
  )

  return NextResponse.json({ dados: rows, total: rows.length })
}

// POST /api/clinica/agendamentos
// Valida tipo habilitado + disponibilidade num único SELECT e grava com a guarda de conflito
// no próprio INSERT (2 idas ao banco no total). Devolve o item já no formato da lista, pro
// front inserir na grade sem refazer a consulta.
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = agendamentoSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  if (!d.tipo_id) {
    return NextResponse.json({ erro: 'Selecione o tipo de atendimento' }, { status: 422 })
  }

  try {
    // Horário local da clínica derivado do instante enviado pelo front (ISO/UTC), no fuso da sessão
    // do banco — o mesmo que o resto do sistema já assume (filtros de data da agenda, fechamento etc.).
    const dataLocal = `($3::timestamptz)::date`
    const { rows: [v] } = await db.query(
      `SELECT
         EXISTS (SELECT 1 FROM tab_profissional_tipo_percentual
                 WHERE empresa_id = $2 AND profissional_id = $1 AND tipo_id = $5) AS tipo_ok,
         to_char($3::timestamptz, 'HH24:MI') AS hora_inicio,
         to_char($4::timestamptz, 'HH24:MI') AS hora_fim,
         ${sqlDadosDisponibilidade(dataLocal)}`,
      [d.profissional_id, session.empresa_id_ativa, d.data_hora_inicio, d.data_hora_fim, d.tipo_id],
    )

    if (!v.tipo_ok) {
      return NextResponse.json({ erro: MSG_TIPO_NAO_HABILITADO }, { status: 422 })
    }

    const disp = avaliarDisponibilidade(v, v.hora_inicio, v.hora_fim)
    if (!disp.disponivel) {
      return NextResponse.json({ erro: disp.razao }, { status: 422 })
    }

    // O NOT EXISTS fica no próprio INSERT: a janela de corrida entre checar e gravar cai de uma
    // ida de rede ao banco pra microssegundos. 0 linhas = horário tomado por outro lançamento.
    const { rows } = await db.query(
      `WITH ins AS (
         INSERT INTO tab_agendamento (
           empresa_id, paciente_id, profissional_id, tipo_id, especialidade_id,
           data_hora_inicio, data_hora_fim, status, motivo, observacao, categoria_id, created_by
         )
         SELECT $1::int, $2::int, $3::int, $4::int, $5::int,
                $6::timestamptz, $7::timestamptz, $8::varchar, $9::varchar, $10::text, $11::int, $12::varchar
         WHERE NOT EXISTS (
           SELECT 1 FROM tab_agendamento
           WHERE profissional_id = $3::int AND empresa_id = $1::int
             AND status NOT IN ('CANCELADO','FALTOU')
             AND (data_hora_inicio, data_hora_fim) OVERLAPS ($6::timestamptz, $7::timestamptz)
         )
         RETURNING *
       )
       SELECT ${AGENDAMENTO_LISTA_COLUNAS}${AGENDAMENTO_LISTA_SEM_RECEBIMENTO}
       FROM ins a
         ${AGENDAMENTO_LISTA_JOINS}`,
      [
        session.empresa_id_ativa, d.paciente_id, d.profissional_id,
        d.tipo_id, d.especialidade_id ?? null,
        d.data_hora_inicio, d.data_hora_fim,
        d.status, d.motivo ?? null, d.observacao ?? null,
        d.categoria_id ?? null,
        session.nome,
      ],
    )

    if (!rows.length) {
      return NextResponse.json(
        { erro: 'Profissional já possui agendamento nesse horário' },
        { status: 409 },
      )
    }

    return NextResponse.json({ id: rows[0].id, agendamento: rows[0] }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/clinica/agendamentos]', err)
    return NextResponse.json({ erro: 'Erro ao salvar agendamento' }, { status: 500 })
  }
}
