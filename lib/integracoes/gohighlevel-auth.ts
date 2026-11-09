import { NextRequest, NextResponse } from 'next/server'
import { dbControl } from '@/lib/db'
import { rateLimited, getClientIp } from '@/lib/rate-limit'

export interface TenantGohighlevel {
  database_name: string
  empresa_id: number
}

// Autenticação por token (Authorization: Bearer <token>) compartilhada pelas rotas
// de consumo externo em app/api/integracoes/gohighlevel/*. Ver novos/saas_control_01_integracao_api_token.sql.
//
// Limite por IP primeiro — barato e com chave de cardinalidade limitada. Nunca usar o token
// bruto (não validado) como chave de rate-limit: o Map de lib/rate-limit.ts não expira entradas,
// então um atacante mandando muitos tokens inválidos diferentes faria esse Map crescer sem limite
// (memory leak). Só depois de validado o token é que se aplica um limite mais apertado por token.
export async function autenticarTokenGohighlevel(
  req: NextRequest,
): Promise<TenantGohighlevel | NextResponse> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ erro: 'Token não informado' }, { status: 401 })

  const ip = getClientIp(req)
  if (rateLimited(`ghl:ip:${ip}`, 120, 60_000)) {
    return NextResponse.json({ erro: 'Muitas requisições, tente novamente em breve' }, { status: 429 })
  }

  const { rows: tokens } = await dbControl.query<TenantGohighlevel>(
    `SELECT database_name, empresa_id FROM tab_integracao_api_token
     WHERE token = $1 AND ativo = true AND integracao = 'gohighlevel'`,
    [token],
  )
  if (!tokens.length) return NextResponse.json({ erro: 'Token inválido ou inativo' }, { status: 401 })

  if (rateLimited(`ghl:token:${token}`, 60, 60_000)) {
    return NextResponse.json({ erro: 'Muitas requisições, tente novamente em breve' }, { status: 429 })
  }

  return tokens[0]
}
