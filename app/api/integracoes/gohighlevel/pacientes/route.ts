import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { formatCelularE164 } from '@/lib/utils'
import { autenticarTokenGohighlevel } from '@/lib/integracoes/gohighlevel-auth'

// GET /api/integracoes/gohighlevel/pacientes?page=&limit=&atualizado_desde=
// Rota externa — autenticada por token de API (Authorization: Bearer <token>),
// não por sessão de usuário. Ver novos/saas_control_01_integracao_api_token.sql.
export async function GET(req: NextRequest) {
  const auth = await autenticarTokenGohighlevel(req)
  if (auth instanceof NextResponse) return auth
  const { database_name, empresa_id } = auth

  const sp    = req.nextUrl.searchParams
  const page  = Math.max(1, Number(sp.get('page') || 1))
  const limit = Math.min(100, Number(sp.get('limit') || 20))
  const offset = (page - 1) * limit

  // atualizado_desde é o nome canônico (updated_since aceito como alias, pedido do consumidor
  // Vita) — permite sincronizar só o que mudou em vez de varrer o cadastro inteiro a cada rodada.
  const atualizadoDesde = sp.get('atualizado_desde') || sp.get('updated_since') || ''
  if (atualizadoDesde && Number.isNaN(Date.parse(atualizadoDesde))) {
    return NextResponse.json({ erro: 'atualizado_desde inválido' }, { status: 400 })
  }

  const conds: string[] = ['empresa_id = $1', 'ind_paciente = true']
  const params: unknown[] = [empresa_id]
  if (atualizadoDesde) {
    conds.push(`updated_at >= $${params.length + 1}::timestamptz`)
    params.push(atualizadoDesde)
  }
  const where = conds.join(' AND ')

  const db = getDb(database_name)
  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_pessoa WHERE ${where}`, params),
    db.query(
      `SELECT id, nome, TO_CHAR(data_nascimento, 'YYYY-MM-DD') AS data_nascimento,
              telefone, celular, whatsapp, email, cidade, uf, ativo, created_at, updated_at
       FROM tab_pessoa
       WHERE ${where}
       ORDER BY id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  // Celular padronizado (pedido-api-vita.pdf item 3): sai sempre em E.164 pro CRM casar
  // o contato pelo número, sem precisar lidar com os formatos variados gravados ao longo
  // do tempo. dados brutos continuam digits-only no banco (ver POST/PATCH de pessoas).
  const dados = rows.map((r) => ({ ...r, celular: formatCelularE164(r.celular as string | null) }))
  return NextResponse.json({ dados, total, page, limit, pages: Math.ceil(total / limit) })
}
