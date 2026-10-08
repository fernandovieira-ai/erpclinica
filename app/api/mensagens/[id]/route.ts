import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// DELETE /api/mensagens/:id — "excluir" é soft-delete por usuário: marca a
// mensagem como oculta só pra quem pediu (remetente ou destinatário), sem
// apagar a linha. A mensagem continua salva e visível pro outro participante.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const id = Number(params.id)
  if (!id) return NextResponse.json({ erro: 'Mensagem inválida' }, { status: 400 })

  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `SELECT remetente_id, destinatario_id FROM tab_mensagem WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresa_id_ativa],
  )
  if (!rows.length) return NextResponse.json({ erro: 'Mensagem não encontrada' }, { status: 404 })
  const msg = rows[0]

  let coluna: 'oculta_remetente' | 'oculta_destinatario'
  if (msg.remetente_id === session.usuario_id) coluna = 'oculta_remetente'
  else if (msg.destinatario_id === session.usuario_id) coluna = 'oculta_destinatario'
  else return NextResponse.json({ erro: 'Sem permissão' }, { status: 403 })

  await db.query(`UPDATE tab_mensagem SET ${coluna} = true WHERE id = $1`, [id])

  return NextResponse.json({ ok: true })
}
