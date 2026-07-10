import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/medicamentos?q=termo  — busca na base local ANVISA
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ dados: [] })

  const db = getDb(session.database_name)

  try {
    // DISTINCT ON LOWER(nome): um resultado por nome normalizado
    // (evita retornar 80x "dipirona sodica" de fabricantes diferentes)
    const { rows } = await db.query(
      `SELECT codigo_produto, nome, principio_ativo, classe_terapeutica, empresa
       FROM (
         SELECT DISTINCT ON (LOWER(TRIM(nome)))
           codigo_produto, nome, principio_ativo, classe_terapeutica, empresa,
           CASE WHEN UPPER(nome) LIKE UPPER($2) THEN 0 ELSE 1 END AS ord
         FROM tab_medicamento
         WHERE ativo = TRUE
           AND (UPPER(nome) LIKE UPPER($1) OR UPPER(principio_ativo) LIKE UPPER($1))
         ORDER BY LOWER(TRIM(nome)),
                  CASE WHEN UPPER(nome) LIKE UPPER($2) THEN 0 ELSE 1 END,
                  numero_registro DESC NULLS LAST
       ) sub
       ORDER BY ord, nome
       LIMIT 20`,
      [`%${q}%`, `${q}%`],
    )
    return NextResponse.json({ dados: rows })
  } catch {
    // Tabela ainda não existe — importacao ANVISA nao executada
    return NextResponse.json({ dados: [] })
  }
}
