import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { DESTINATARIO_GRUPO_RECEPCAO } from '@/lib/validators/mensagem.schema'

// GET /api/mensagens/usuarios — usuários ativos da empresa atual, pra iniciar uma conversa nova
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)

  const [{ rows }, { rows: recepRows }] = await Promise.all([
    db.query(
      `SELECT u.id, u.nome, COALESCE(ue.perfil, u.perfil) AS perfil
       FROM tab_usuario u
       JOIN tab_usuario_empresa ue ON ue.usuario_id = u.id AND ue.empresa_id = $1
       WHERE u.ativo = true AND ue.ativo = true AND u.id <> $2
       ORDER BY u.nome`,
      [session.empresa_id_ativa, session.usuario_id],
    ),
    db.query(
      `SELECT 1 FROM tab_usuario u
       JOIN tab_usuario_empresa ue ON ue.usuario_id = u.id AND ue.empresa_id = $1
       WHERE u.ativo = true AND ue.ativo = true AND u.ind_recepcionista = true
       LIMIT 1`,
      [session.empresa_id_ativa],
    ),
  ])

  // "Recepção" é um destino de grupo (não um usuário real) — só oferece a opção se
  // houver ao menos uma recepcionista cadastrada e ativa nesta empresa pra recebê-la.
  const dados = recepRows.length
    ? [{ id: DESTINATARIO_GRUPO_RECEPCAO, nome: 'Recepção', perfil: 'grupo' }, ...rows]
    : rows

  return NextResponse.json({ dados })
}
