import { NextRequest, NextResponse } from 'next/server'
import { dbControl, getDb } from '@/lib/db'
import { rateLimited, getClientIp } from '@/lib/rate-limit'

// Rota pública (tela de login) — devolve a logo do cliente identificado pelo
// slug como imagem binária, para o <img> do navegador cachear nativamente.
// Sem corpo de erro: qualquer falha responde 404 seco (nao confirma/nega
// existencia de cliente pra quem tenta enumerar slugs).
export const dynamic = 'force-dynamic'

const naoEncontrado = () => new NextResponse(null, { status: 404 })

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')?.toLowerCase().trim() ?? ''
  if (!/^[a-z0-9-]{2,50}$/.test(slug)) return naoEncontrado()

  const ip = getClientIp(req)
  if (rateLimited(`branding-logo:ip:${ip}`, 60, 60_000)) {
    return new NextResponse(null, { status: 429 })
  }

  try {
    const { rows: inst } = await dbControl.query<{ database_name: string; status: string }>(
      `SELECT database_name, status FROM tab_instancia WHERE slug = $1 LIMIT 1`,
      [slug],
    )
    if (!inst.length || (inst[0].status !== 'ativo' && inst[0].status !== 'trial')) {
      return naoEncontrado()
    }

    const db = getDb(inst[0].database_name)
    const { rows } = await db.query<{ logo_base64: string | null }>(
      `SELECT logo_base64 FROM tab_empresa
       WHERE ativo = true AND logo_base64 IS NOT NULL
       ORDER BY id LIMIT 1`,
    )

    const dataUrl = rows[0]?.logo_base64
    if (!dataUrl) return naoEncontrado()

    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
    if (!match) return naoEncontrado()

    const [, mime, base64] = match
    const buffer = Buffer.from(base64, 'base64')

    return new NextResponse(buffer, {
      headers: {
        'Content-Type':  mime,
        'Cache-Control': 'public, max-age=600',
      },
    })
  } catch (err) {
    console.error('[branding/logo] erro:', err)
    return naoEncontrado()
  }
}
