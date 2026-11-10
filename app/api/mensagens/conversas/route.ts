import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { DESTINATARIO_GRUPO_RECEPCAO } from '@/lib/validators/mensagem.schema'

// GET /api/mensagens/conversas — lista de conversas do usuário logado,
// com a última mensagem de cada par e a contagem de não lidas.
// Além das conversas 1-pra-1 normais, inclui (quando existirem):
// - minhas próprias mensagens enviadas ao grupo "Recepção" ainda sem resposta
//   (outro_id = DESTINATARIO_GRUPO_RECEPCAO, só pra eu acompanhar);
// - se EU sou recepcionista: a fila de mensagens de QUALQUER remetente endereçadas
//   ao grupo e ainda não assumidas por ninguém (mesma fila visível a todas as
//   recepcionistas até a primeira responder).
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `WITH pares AS (
       SELECT CASE WHEN remetente_id = $2 THEN destinatario_id ELSE remetente_id END AS outro_id,
              texto, created_at, remetente_id, false AS pendente_grupo
       FROM tab_mensagem
       WHERE empresa_id = $1 AND destinatario_id IS NOT NULL AND (
         (remetente_id = $2 AND NOT oculta_remetente) OR
         (destinatario_id = $2 AND NOT oculta_destinatario)
       )
     ),
     meus_pendentes AS (
       SELECT $3::int AS outro_id, texto, created_at, remetente_id, true AS pendente_grupo
       FROM tab_mensagem
       WHERE empresa_id = $1 AND remetente_id = $2 AND destinatario_id IS NULL AND NOT oculta_remetente
     ),
     fila_recepcao AS (
       SELECT m.remetente_id AS outro_id, m.texto, m.created_at, m.remetente_id, true AS pendente_grupo
       FROM tab_mensagem m
       WHERE m.empresa_id = $1 AND m.destinatario_id IS NULL
         AND EXISTS (SELECT 1 FROM tab_usuario WHERE id = $2 AND ind_recepcionista = true)
     ),
     tudo AS (
       SELECT * FROM pares
       UNION ALL SELECT * FROM meus_pendentes
       UNION ALL SELECT * FROM fila_recepcao
     ),
     ultima AS (
       SELECT DISTINCT ON (outro_id) outro_id, texto, created_at, remetente_id, pendente_grupo
       FROM tudo
       ORDER BY outro_id, created_at DESC
     ),
     nao_lidas AS (
       SELECT remetente_id AS outro_id, COUNT(*) AS qtd
       FROM tab_mensagem
       WHERE empresa_id = $1 AND destinatario_id = $2 AND lida_em IS NULL AND NOT oculta_destinatario
       GROUP BY remetente_id
     )
     SELECT ult.outro_id AS usuario_id,
            CASE WHEN ult.outro_id = $3 THEN 'Recepção' ELSE u.nome END AS nome,
            CASE WHEN ult.outro_id = $3 THEN 'grupo' ELSE COALESCE(ue.perfil, u.perfil) END AS perfil,
            ult.texto AS ultima_mensagem,
            ult.created_at AS ultima_mensagem_em,
            (ult.remetente_id = $2) AS ultima_mensagem_de_mim,
            COALESCE(nl.qtd, 0)::int AS nao_lidas,
            ult.pendente_grupo
     FROM ultima ult
     LEFT JOIN tab_usuario u ON u.id = ult.outro_id AND ult.outro_id <> $3
     LEFT JOIN tab_usuario_empresa ue ON ue.usuario_id = u.id AND ue.empresa_id = $1
     LEFT JOIN nao_lidas nl ON nl.outro_id = ult.outro_id
     ORDER BY ult.created_at DESC`,
    [session.empresa_id_ativa, session.usuario_id, DESTINATARIO_GRUPO_RECEPCAO],
  )

  return NextResponse.json({ dados: rows })
}
