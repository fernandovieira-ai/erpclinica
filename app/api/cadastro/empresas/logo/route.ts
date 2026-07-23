import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/cadastro/empresas/logo — logo da empresa ativa da sessão, servida como
// imagem binária (não JSON) para o navegador cachear nativamente entre navegações.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query<{ logo_base64: string | null }>(
    `SELECT logo_base64 FROM tab_empresa WHERE id = $1`,
    [session.empresa_id_ativa],
  )

  const dataUrl = rows[0]?.logo_base64
  if (!dataUrl) return NextResponse.json({ erro: 'Sem logo cadastrada' }, { status: 404 })

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match) return NextResponse.json({ erro: 'Formato de logo inválido' }, { status: 500 })

  const [, mime, base64] = match
  const buffer = Buffer.from(base64, 'base64')

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':  mime,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
