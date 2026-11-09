import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { formatCelularE164 } from '@/lib/utils'
import { autenticarTokenGohighlevel } from '@/lib/integracoes/gohighlevel-auth'
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

// GET /api/integracoes/gohighlevel/agendamentos?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&page=&limit=
// Rota externa — autenticada por token de API (Authorization: Bearer <token>), não por sessão.
// Espelha o conteúdo de /api/clinica/agendamentos (pedido-api-vita-09nov.pdf item 1), mas com
// SELECT próprio e enxuto: de propósito NÃO inclui motivo/observacao (dado clínico) — a
// integração explicitamente não consome dado clínico de paciente. Também pagina de verdade
// (COUNT + OFFSET), diferente da rota interna.
export async function GET(req: NextRequest) {
  const auth = await autenticarTokenGohighlevel(req)
  if (auth instanceof NextResponse) return auth
  const { database_name, empresa_id } = auth

  const sp    = req.nextUrl.searchParams
  const inicio = sp.get('inicio') || ''
  const fim    = sp.get('fim') || ''
  const page   = Math.max(1, Number(sp.get('page') || 1))
  const limit  = Math.min(500, Number(sp.get('limit') || 100))
  const offset = (page - 1) * limit

  const db = getDb(database_name)

  const conds: string[]   = ['a.empresa_id = $1']
  const params: unknown[] = [empresa_id]
  if (inicio) {
    conds.push(`a.data_hora_inicio >= $${params.length + 1}`)
    params.push(inicio)
  }
  if (fim) {
    conds.push(`a.data_hora_inicio <= $${params.length + 1}`)
    params.push(fim + ' 23:59:59')
  }
  const where = conds.join(' AND ')

  const temTabelaRecebimento = await tabelaExiste(db, database_name, 'tab_recebimento_consulta')
  const selectRecebimento = temTabelaRecebimento
    ? `, rc.id AS recebimento_id, rc.status_recebimento, rc.total_recebimento`
    : `, NULL::INT AS recebimento_id, NULL::VARCHAR AS status_recebimento, NULL::NUMERIC AS total_recebimento`
  const joinRecebimento = temTabelaRecebimento
    ? `LEFT JOIN (
        SELECT agendamento_id, id, status_recebimento, total_recebimento
        FROM tab_recebimento_consulta
        WHERE status_recebimento = 'PAGO'
      ) rc ON rc.agendamento_id = a.id`
    : ''

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_agendamento a WHERE ${where}`, params),
    db.query(
      `SELECT
         a.id, a.data_hora_inicio, a.status, a.created_by, a.created_at,
         pac.id AS paciente_id, pac.celular AS paciente_celular, pac.cpf_cnpj AS paciente_cpf,
         tp.descricao AS tipo_descricao, tp.eh_exame AS tipo_eh_exame,
         pro.nome AS profissional_nome
         ${selectRecebimento}
       FROM tab_agendamento a
         JOIN tab_pessoa pac ON pac.id = a.paciente_id
         JOIN tab_pessoa pro ON pro.id = a.profissional_id
         LEFT JOIN tab_agendamento_tipo tp ON tp.id = a.tipo_id
         ${joinRecebimento}
       WHERE ${where}
       ORDER BY a.data_hora_inicio, a.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  const dados = rows.map((r) => ({ ...r, paciente_celular: formatCelularE164(r.paciente_celular as string | null) }))
  return NextResponse.json({ dados, total, page, limit, pages: Math.ceil(total / limit) })
}
