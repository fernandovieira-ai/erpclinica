import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { mensagemSchema, DESTINATARIO_GRUPO_RECEPCAO } from '@/lib/validators/mensagem.schema'

// POST /api/mensagens — envia uma mensagem nova.
// Dois destinos possíveis: um usuário real, ou o grupo "Recepção" (sentinel
// DESTINATARIO_GRUPO_RECEPCAO) — mensagem fica com destinatario_id NULL, visível
// a todas as recepcionistas ativas da empresa até alguém responder.
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = mensagemSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })
  const d = body.data

  const db = getDb(session.database_name)

  if (d.destinatario_id === DESTINATARIO_GRUPO_RECEPCAO) {
    const { rows: recepRows } = await db.query(
      `SELECT 1 FROM tab_usuario u
       JOIN tab_usuario_empresa ue ON ue.usuario_id = u.id AND ue.empresa_id = $1
       WHERE u.ativo = true AND ue.ativo = true AND u.ind_recepcionista = true
       LIMIT 1`,
      [session.empresa_id_ativa],
    )
    if (!recepRows.length) {
      return NextResponse.json({ erro: 'Nenhuma recepcionista cadastrada nesta empresa' }, { status: 404 })
    }
    try {
      const { rows } = await db.query(
        `INSERT INTO tab_mensagem (empresa_id, remetente_id, destinatario_id, texto)
         VALUES ($1, $2, NULL, $3)
         RETURNING id, created_at`,
        [session.empresa_id_ativa, session.usuario_id, d.texto],
      )
      return NextResponse.json({ id: rows[0].id, created_at: rows[0].created_at })
    } catch (err) {
      console.error('[mensagens:POST:grupo]', err)
      return NextResponse.json({ erro: 'Erro ao enviar mensagem' }, { status: 500 })
    }
  }

  if (d.destinatario_id === session.usuario_id) {
    return NextResponse.json({ erro: 'Não é possível enviar mensagem para si mesmo' }, { status: 400 })
  }

  const { rows: destRows } = await db.query(
    `SELECT 1 FROM tab_usuario_empresa WHERE usuario_id = $1 AND empresa_id = $2 AND ativo = true`,
    [d.destinatario_id, session.empresa_id_ativa],
  )
  if (!destRows.length) {
    return NextResponse.json({ erro: 'Destinatário não encontrado nesta empresa' }, { status: 404 })
  }

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    // Se eu for recepcionista e esse destinatário tiver mensagem(ns) pendente(s) pro
    // grupo Recepção, responder a ele AQUI MESMO (fluxo normal de envio) já assume a
    // fila inteira: destinatario_id passa a ser eu, some pra qualquer outra
    // recepcionista. Atômico (linhas já reivindicadas por outra recepcionista na
    // frente não são afetadas de novo — "quem responde primeiro" vence sem lock extra).
    const { rows: meRows } = await client.query(`SELECT ind_recepcionista FROM tab_usuario WHERE id = $1`, [session.usuario_id])
    if (meRows[0]?.ind_recepcionista) {
      await client.query(
        `UPDATE tab_mensagem
         SET destinatario_id = $1, atendido_por = $1, lida_em = COALESCE(lida_em, NOW())
         WHERE empresa_id = $2 AND remetente_id = $3 AND destinatario_id IS NULL`,
        [session.usuario_id, session.empresa_id_ativa, d.destinatario_id],
      )
    }

    const { rows } = await client.query(
      `INSERT INTO tab_mensagem (empresa_id, remetente_id, destinatario_id, texto)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [session.empresa_id_ativa, session.usuario_id, d.destinatario_id, d.texto],
    )

    await client.query('COMMIT')
    return NextResponse.json({ id: rows[0].id, created_at: rows[0].created_at })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[mensagens:POST]', err)
    return NextResponse.json({ erro: 'Erro ao enviar mensagem' }, { status: 500 })
  } finally {
    client.release()
  }
}
