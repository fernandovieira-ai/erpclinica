import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { mensagemSchema } from '@/lib/validators/mensagem.schema'

// POST /api/mensagens — envia uma mensagem nova
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = mensagemSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })
  const d = body.data

  if (d.destinatario_id === session.usuario_id) {
    return NextResponse.json({ erro: 'Não é possível enviar mensagem para si mesmo' }, { status: 400 })
  }

  const db = getDb(session.database_name)

  const { rows: destRows } = await db.query(
    `SELECT 1 FROM tab_usuario_empresa WHERE usuario_id = $1 AND empresa_id = $2 AND ativo = true`,
    [d.destinatario_id, session.empresa_id_ativa],
  )
  if (!destRows.length) {
    return NextResponse.json({ erro: 'Destinatário não encontrado nesta empresa' }, { status: 404 })
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO tab_mensagem (empresa_id, remetente_id, destinatario_id, texto)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [session.empresa_id_ativa, session.usuario_id, d.destinatario_id, d.texto],
    )
    return NextResponse.json({ id: rows[0].id, created_at: rows[0].created_at })
  } catch (err) {
    console.error('[mensagens:POST]', err)
    return NextResponse.json({ erro: 'Erro ao enviar mensagem' }, { status: 500 })
  }
}
