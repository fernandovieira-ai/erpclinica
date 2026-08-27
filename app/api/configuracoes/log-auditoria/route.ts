import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// Campos de boleto — não devem ser expostos a quem só tem acesso ao log de auditoria
const CAMPOS_SENSIVEIS_TITULO = ['linha_digitavel', 'codigo_barras', 'nosso_numero']
const TABELAS_TITULO = ['tab_titulo_pagar', 'tab_titulo_receber']

function sanitizarSnapshot(tabela: string, snapshot: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!snapshot || !TABELAS_TITULO.includes(tabela)) return snapshot
  const limpo = { ...snapshot }
  for (const campo of CAMPOS_SENSIVEIS_TITULO) delete limpo[campo]
  return limpo
}

// GET /api/configuracoes/log-auditoria?busca=&tabela=&acao=&data_inicio=&data_fim=&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })
  if (session.perfil !== 'admin') return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 })

  const sp          = req.nextUrl.searchParams
  const busca       = sp.get('busca')?.trim() || ''
  const tabela      = sp.get('tabela') || ''
  const acao        = sp.get('acao') || ''
  const data_inicio = sp.get('data_inicio') || ''
  const data_fim    = sp.get('data_fim') || ''
  const page        = Math.max(1, Number(sp.get('page') || 1))
  const limit       = Math.min(200, Number(sp.get('limit') || 50))
  const offset      = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = [`l.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (tabela) {
    conds.push(`l.tabela = $${pi++}`)
    params.push(tabela)
  }
  if (acao) {
    conds.push(`l.acao = $${pi++}`)
    params.push(acao)
  }
  if (data_inicio) {
    conds.push(`l.created_at >= $${pi++}`)
    params.push(data_inicio)
  }
  if (data_fim) {
    conds.push(`l.created_at < ($${pi++}::date + INTERVAL '1 day')`)
    params.push(data_fim)
  }
  if (busca) {
    conds.push(`l.usuario_nome ILIKE $${pi++}`)
    params.push(`%${busca}%`)
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_log_auditoria l ${where}`, params),
    db.query(
      `SELECT l.id, l.created_at, l.tabela, l.registro_id, l.acao, l.usuario_nome,
              l.dados_antes, l.dados_depois
       FROM tab_log_auditoria l
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const dados = rows.map(r => ({
    ...r,
    dados_antes:  sanitizarSnapshot(r.tabela, r.dados_antes),
    dados_depois: sanitizarSnapshot(r.tabela, r.dados_depois),
  }))

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados, total, page, limit, pages: Math.ceil(total / limit) })
}
