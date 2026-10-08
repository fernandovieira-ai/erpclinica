import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/mensagens/conversas/:usuarioId — histórico da conversa com esse usuário.
// Também marca como lidas as mensagens recebidas dele (efeito colateral do GET:
// abrir a conversa é o gesto de "ler" — mesmo padrão de uma caixa de entrada).
export async function GET(req: NextRequest, { params }: { params: { usuarioId: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const outroId = Number(params.usuarioId)
  if (!outroId) return NextResponse.json({ erro: 'Usuário inválido' }, { status: 400 })

  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `SELECT id, remetente_id, destinatario_id, texto, lida_em, created_at
     FROM tab_mensagem
     WHERE empresa_id = $1
       AND (
         (remetente_id = $2 AND destinatario_id = $3 AND NOT oculta_remetente) OR
         (remetente_id = $3 AND destinatario_id = $2 AND NOT oculta_destinatario)
       )
     ORDER BY created_at ASC
     LIMIT 200`,
    [session.empresa_id_ativa, session.usuario_id, outroId],
  )

  await db.query(
    `UPDATE tab_mensagem SET lida_em = NOW()
     WHERE empresa_id = $1 AND destinatario_id = $2 AND remetente_id = $3 AND lida_em IS NULL`,
    [session.empresa_id_ativa, session.usuario_id, outroId],
  )

  return NextResponse.json({ dados: rows })
}

// DELETE /api/mensagens/conversas/:usuarioId — exclui a conversa inteira, mesmo
// soft-delete por usuário do DELETE de mensagem avulsa (ver app/api/mensagens/[id]),
// só que aplicado em lote: marca oculta_remetente/oculta_destinatario conforme o
// papel do usuário logado em CADA mensagem da conversa (uma conversa real mistura
// mensagens nas duas direções). Some só da tela de quem excluiu.
export async function DELETE(req: NextRequest, { params }: { params: { usuarioId: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const outroId = Number(params.usuarioId)
  if (!outroId) return NextResponse.json({ erro: 'Usuário inválido' }, { status: 400 })

  const db = getDb(session.database_name)

  await db.query(
    `UPDATE tab_mensagem
     SET oculta_remetente   = CASE WHEN remetente_id = $2 THEN true ELSE oculta_remetente END,
         oculta_destinatario = CASE WHEN destinatario_id = $2 THEN true ELSE oculta_destinatario END
     WHERE empresa_id = $1
       AND ((remetente_id = $2 AND destinatario_id = $3) OR (remetente_id = $3 AND destinatario_id = $2))`,
    [session.empresa_id_ativa, session.usuario_id, outroId],
  )

  return NextResponse.json({ ok: true })
}
