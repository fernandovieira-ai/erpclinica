import { NextRequest, NextResponse } from 'next/server'
import { dbControl, getDb } from '@/lib/db'
import { rateLimited, getClientIp } from '@/lib/rate-limit'

// GET /api/integracoes/gohighlevel/pacientes?page=&limit=
// Rota externa — autenticada por token de API (Authorization: Bearer <token>),
// não por sessão de usuário. Ver novos/saas_control_01_integracao_api_token.sql.
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ erro: 'Token não informado' }, { status: 401 })

  // Limite por IP primeiro — barato e com chave de cardinalidade limitada.
  // Nunca usar o token bruto (não validado) como chave de rate-limit: o Map de
  // lib/rate-limit.ts não expira entradas, então um atacante mandando muitos
  // tokens inválidos diferentes faria esse Map crescer sem limite (memory leak).
  const ip = getClientIp(req)
  if (rateLimited(`ghl:ip:${ip}`, 120, 60_000)) {
    return NextResponse.json({ erro: 'Muitas requisições, tente novamente em breve' }, { status: 429 })
  }

  const { rows: tokens } = await dbControl.query<{ database_name: string; empresa_id: number }>(
    `SELECT database_name, empresa_id FROM tab_integracao_api_token
     WHERE token = $1 AND ativo = true AND integracao = 'gohighlevel'`,
    [token],
  )
  if (!tokens.length) return NextResponse.json({ erro: 'Token inválido ou inativo' }, { status: 401 })

  // Token validado — agora sim um limite mais apertado por token (cardinalidade
  // limitada ao número de tokens reais emitidos).
  if (rateLimited(`ghl:token:${token}`, 60, 60_000)) {
    return NextResponse.json({ erro: 'Muitas requisições, tente novamente em breve' }, { status: 429 })
  }

  const { database_name, empresa_id } = tokens[0]

  const sp    = req.nextUrl.searchParams
  const page  = Math.max(1, Number(sp.get('page') || 1))
  const limit = Math.min(100, Number(sp.get('limit') || 20))
  const offset = (page - 1) * limit

  const db = getDb(database_name)
  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS n FROM tab_pessoa WHERE empresa_id = $1 AND ind_paciente = true`,
      [empresa_id],
    ),
    db.query(
      `SELECT id, nome, TO_CHAR(data_nascimento, 'YYYY-MM-DD') AS data_nascimento,
              telefone, celular, whatsapp, email, cidade, uf, ativo
       FROM tab_pessoa
       WHERE empresa_id = $1 AND ind_paciente = true
       ORDER BY id
       LIMIT $2 OFFSET $3`,
      [empresa_id, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}
