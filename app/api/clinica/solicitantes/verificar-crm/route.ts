import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/solicitantes/verificar-crm?crm=...&crm_uf=...
// Usado só pelo mini-formulário de cadastro rápido de médico solicitante
// (components/clinica/RecebimentoModal.tsx, BuscarSolicitante) — antes de criar uma pessoa
// nova, checa se já existe alguém com esse CRM (comparando só dígitos, pra casar
// "12345"/"12345-SP"/"12345/SP"), pra evitar duplicar cadastro. Varre TODO tab_pessoa
// (não só quem já é ind_profissional/ind_solicitante — ver /api/clinica/solicitantes),
// porque o CRM pode ter sido digitado num cadastro com outro papel antes.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const crmDigits = (req.nextUrl.searchParams.get('crm') ?? '').replace(/\D/g, '')
  if (crmDigits.length < 3) return NextResponse.json({ dados: [] })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT id, nome, crm, crm_uf, ind_profissional, ind_solicitante
     FROM tab_pessoa
     WHERE empresa_id = $1 AND ativo = true AND eh_clinica = false
       AND crm IS NOT NULL AND regexp_replace(crm, '\\D', '', 'g') = $2
     ORDER BY nome
     LIMIT 5`,
    [session.empresa_id_ativa, crmDigits],
  )

  return NextResponse.json({ dados: rows })
}
