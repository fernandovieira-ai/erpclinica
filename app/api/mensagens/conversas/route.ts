import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/mensagens/conversas — lista de conversas do usuário logado,
// com a última mensagem de cada par e a contagem de não lidas.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `WITH pares AS (
       SELECT CASE WHEN remetente_id = $2 THEN destinatario_id ELSE remetente_id END AS outro_id,
              texto, created_at, remetente_id
       FROM tab_mensagem
       WHERE empresa_id = $1 AND (
         (remetente_id = $2 AND NOT oculta_remetente) OR
         (destinatario_id = $2 AND NOT oculta_destinatario)
       )
     ),
     ultima AS (
       SELECT DISTINCT ON (outro_id) outro_id, texto, created_at, remetente_id
       FROM pares
       ORDER BY outro_id, created_at DESC
     ),
     nao_lidas AS (
       SELECT remetente_id AS outro_id, COUNT(*) AS qtd
       FROM tab_mensagem
       WHERE empresa_id = $1 AND destinatario_id = $2 AND lida_em IS NULL AND NOT oculta_destinatario
       GROUP BY remetente_id
     )
     SELECT u.id AS usuario_id, u.nome, COALESCE(ue.perfil, u.perfil) AS perfil,
            ult.texto AS ultima_mensagem,
            ult.created_at AS ultima_mensagem_em,
            (ult.remetente_id = $2) AS ultima_mensagem_de_mim,
            COALESCE(nl.qtd, 0)::int AS nao_lidas
     FROM ultima ult
     JOIN tab_usuario u ON u.id = ult.outro_id
     LEFT JOIN tab_usuario_empresa ue ON ue.usuario_id = u.id AND ue.empresa_id = $1
     LEFT JOIN nao_lidas nl ON nl.outro_id = ult.outro_id
     ORDER BY ult.created_at DESC`,
    [session.empresa_id_ativa, session.usuario_id],
  )

  return NextResponse.json({ dados: rows })
}
