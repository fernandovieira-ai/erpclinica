import { NextRequest, NextResponse } from 'next/server'
import { verifyTokenEdge, signTokenEdge } from '@/lib/auth/jwt-edge'

// DEV: bypass de login — autenticação ERP desativada temporariamente
const DEV_NO_AUTH = true

const SESSION_MAXAGE = 60 * 60 * 12 // 12h — cobre turnos mais longos que as 8h originais

const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path:     '/',
}

// Teto de sanidade pra qualquer campo string do payload da sessão (nome, email...).
// Renovar a sessão a cada requisição é exatamente o mecanismo que fez o bug de
// encoding do jwt-edge (corrigido em d7a9dd1) virar bola de neve: um payload já
// corrompido era re-assinado a cada request, dobrando de tamanho até estourar
// colunas VARCHAR(100) como created_by. Essa trava é defesa em profundidade —
// se QUALQUER bug futuro inflar um campo da sessão, a renovação para aqui em vez
// de realimentar o problema; a sessão expira no prazo normal e força um relogin
// (que busca os dados de novo, limpos, do banco).
const TAMANHO_MAX_CAMPO_SESSAO = 200
function payloadSessaoValido(payload: Record<string, unknown>): boolean {
  return Object.values(payload).every(
    (v) => typeof v !== 'string' || v.length <= TAMANHO_MAX_CAMPO_SESSAO,
  )
}

// Renova a sessão a cada requisição (sliding expiration): sem isso o cookie
// expira num prazo fixo de 8h contado do login, derrubando o atendente no
// meio do uso (ex.: quando o AtualizadorVersao força um reload após deploy
// e esse reload cai depois das 8h). Com a renovação, só desloga quem de
// fato ficar 8h sem nenhuma requisição.
async function renovarSessao(req: NextRequest, res: NextResponse) {
  const token = req.cookies.get('session')?.value
  if (!token) return
  const payload = await verifyTokenEdge(token)
  if (!payload || !('empresa_id_ativa' in payload) || !payloadSessaoValido(payload)) return
  const novoToken = await signTokenEdge(payload, SESSION_MAXAGE)
  res.cookies.set('session', novoToken, { ...SESSION_COOKIE_OPTS, maxAge: SESSION_MAXAGE })
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/api/health' ||
    pathname === '/api/versao'
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
    pathname.startsWith('/api/util') ||
    pathname.startsWith('/api/integracoes')
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

  // ERP autenticado — renova a sessão (sliding expiration) antes de decidir
  const res = NextResponse.next()
  await renovarSessao(req, res)

  // DEV: bypass de autenticação ERP
  if (DEV_NO_AUTH) return res

  // ERP — exige Session completa
  const token   = req.cookies.get('session')?.value
  const payload = token ? await verifyTokenEdge(token) : null
  if (!payload || !('empresa_id_ativa' in payload)) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
