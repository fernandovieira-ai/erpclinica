import { NextRequest, NextResponse } from 'next/server'
import { verifyTokenEdge } from '@/lib/auth/jwt-edge'

// DEV: bypass de login — definir DEV_NO_AUTH=true no .env.local para desenvolvimento
const DEV_NO_AUTH = process.env.DEV_NO_AUTH === 'true'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/api/health'
  ) {
    return NextResponse.next()
  }

  // Rotas públicas do admin
  if (pathname === '/admin/login' || pathname.startsWith('/api/admin/auth')) {
    return NextResponse.next()
  }

  // Rotas públicas do ERP
  if (
    pathname === '/login' ||
    pathname === '/selecionar-empresa' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/util')
  ) {
    return NextResponse.next()
  }

  // Painel /admin — exige AdminSession
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    const token   = req.cookies.get('admin_session')?.value
    const payload = token ? await verifyTokenEdge(token) : null
    if (!payload || !('admin_id' in payload)) {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
    return NextResponse.next()
  }

  // DEV: bypass de autenticação ERP
  if (DEV_NO_AUTH) return NextResponse.next()

  // ERP — exige Session completa
  const token   = req.cookies.get('session')?.value
  const payload = token ? await verifyTokenEdge(token) : null
  if (!payload || !('empresa_id_ativa' in payload)) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
