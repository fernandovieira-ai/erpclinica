import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth/session'
import { dbControl } from '@/lib/db'

export async function GET(req: NextRequest) {
  const admin = await getAdminSession(req)
  if (!admin) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const { rows } = await dbControl.query(`
    SELECT
      id, slug, database_name, nome_cliente, cnpj,
      email_contato, dominio, plano, status, status_efetivo,
      trial_ate, max_empresas, max_usuarios,
      created_at, updated_at
    FROM vw_painel_admin
    ORDER BY nome_cliente
  `)

  return NextResponse.json(rows)
}
