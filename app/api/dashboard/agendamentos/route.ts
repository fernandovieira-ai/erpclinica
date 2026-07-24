import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// getSession() só acessa cookies quando DEV_NO_AUTH !== 'true' — sem essa
// marcação, o Next.js não detecta a rota como dinâmica e tenta pré-renderizá-la
// no build (executando a query real contra o banco).
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const id = session.empresa_id_ativa

  try {
    const [rHoje, rAmanha, rSemana, rProximos] = await Promise.all([
      db.query(
        `SELECT status, COUNT(*) AS total
         FROM tab_agendamento
         WHERE empresa_id = $1
           AND DATE(data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')
               = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
         GROUP BY status`,
        [id],
      ),
      db.query(
        `SELECT COUNT(*) AS total
         FROM tab_agendamento
         WHERE empresa_id = $1
           AND DATE(data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')
               = ((NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 day')::date
           AND status NOT IN ('CANCELADO', 'FALTOU')`,
        [id],
      ),
      db.query(
        `SELECT COUNT(*) AS total
         FROM tab_agendamento
         WHERE empresa_id = $1
           AND DATE(data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')
               BETWEEN ((NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 day')::date
               AND ((NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '7 days')::date
           AND status NOT IN ('CANCELADO', 'FALTOU')`,
        [id],
      ),
      db.query(
        `SELECT
           a.id,
           a.data_hora_inicio,
           a.data_hora_fim,
           a.status,
           p.nome  AS paciente_nome,
           pr.nome AS profissional_nome,
           t.descricao AS tipo_descricao
         FROM tab_agendamento a
         JOIN tab_pessoa p  ON p.id  = a.paciente_id
         JOIN tab_pessoa pr ON pr.id = a.profissional_id
         LEFT JOIN tab_agendamento_tipo t ON t.id = a.tipo_id
         WHERE a.empresa_id = $1
           AND DATE(a.data_hora_inicio AT TIME ZONE 'America/Sao_Paulo')
               = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
           AND a.status IN ('AGENDADO', 'CONFIRMADO', 'AGUARDANDO')
         ORDER BY a.data_hora_inicio ASC
         LIMIT 8`,
        [id],
      ),
    ])

    const statusMap: Record<string, number> = {}
    for (const row of rHoje.rows) statusMap[row.status] = Number(row.total)

    const hoje = {
      total:      Object.values(statusMap).reduce((a, b) => a + b, 0),
      agendado:   statusMap['AGENDADO']   ?? 0,
      confirmado: statusMap['CONFIRMADO'] ?? 0,
      aguardando: statusMap['AGUARDANDO'] ?? 0,
      atendido:   statusMap['ATENDIDO']   ?? 0,
      faltou:     statusMap['FALTOU']     ?? 0,
      cancelado:  statusMap['CANCELADO']  ?? 0,
    }

    return NextResponse.json({
      hoje,
      amanha:   Number(rAmanha.rows[0].total),
      semana:   Number(rSemana.rows[0].total),
      proximos: rProximos.rows,
    })
  } catch (err) {
    console.error('[dashboard/agendamentos]', err)
    return NextResponse.json({ erro: 'Erro interno' }, { status: 500 })
  }
}
