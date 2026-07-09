import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { usuarioUpdateSchema } from '@/lib/validators/usuario.schema'

// GET /api/cadastro/usuarios/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT u.id, u.nome, u.email, u.perfil, u.trocar_senha, u.ultimo_acesso, u.ativo,
            u.created_at, u.updated_at, u.profissional_id, prof.nome AS profissional_nome,
            COALESCE(
              json_agg(json_build_object('id', e.id, 'razao_social', e.razao_social) ORDER BY e.razao_social)
              FILTER (WHERE e.id IS NOT NULL),
              '[]'
            ) AS empresas
     FROM tab_usuario u
     LEFT JOIN tab_usuario_empresa ue ON ue.usuario_id = u.id AND ue.ativo = true
     LEFT JOIN tab_empresa e ON e.id = ue.empresa_id
     LEFT JOIN tab_pessoa prof ON prof.id = u.profissional_id
     WHERE u.id = $1
     GROUP BY u.id, prof.nome`,
    [params.id],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/cadastro/usuarios/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const id  = Number(params.id)
  const db  = getDb(session.database_name)
  const json = await req.json()

  // Atalho: alternar apenas o status ativo/inativo
  if ('ativo' in json && Object.keys(json).length === 1) {
    if (id === session.usuario_id && json.ativo === false) {
      return NextResponse.json({ erro: 'Você não pode desativar seu próprio usuário' }, { status: 400 })
    }
    const result = await db.query(`UPDATE tab_usuario SET ativo=$1, updated_at=NOW() WHERE id=$2`, [json.ativo, id])
    if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  const body = usuarioUpdateSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d = body.data

  if (id === session.usuario_id && d.ativo === false) {
    return NextResponse.json({ erro: 'Você não pode desativar seu próprio usuário' }, { status: 400 })
  }
  if (id === session.usuario_id && d.perfil !== 'admin' && session.perfil === 'admin') {
    return NextResponse.json({ erro: 'Você não pode remover seu próprio perfil de administrador' }, { status: 400 })
  }

  const { rows: existentes } = await db.query(`SELECT id FROM tab_usuario WHERE email = $1 AND id <> $2`, [d.email, id])
  if (existentes.length) return NextResponse.json({ erro: 'Já existe um usuário com este e-mail' }, { status: 409 })

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    if (d.senha) {
      const senhaHash = await bcrypt.hash(d.senha, 10)
      const result = await client.query(
        `UPDATE tab_usuario SET nome=$1, email=$2, senha_hash=$3, perfil=$4, trocar_senha=$5, ativo=$6, profissional_id=$7, updated_at=NOW()
         WHERE id=$8`,
        [d.nome.toUpperCase(), d.email, senhaHash, d.perfil, d.trocar_senha, d.ativo, d.profissional_id || null, id],
      )
      if (result.rowCount === 0) throw Object.assign(new Error('not_found'), { code: 'NOT_FOUND' })
    } else {
      const result = await client.query(
        `UPDATE tab_usuario SET nome=$1, email=$2, perfil=$3, trocar_senha=$4, ativo=$5, profissional_id=$6, updated_at=NOW()
         WHERE id=$7`,
        [d.nome.toUpperCase(), d.email, d.perfil, d.trocar_senha, d.ativo, d.profissional_id || null, id],
      )
      if (result.rowCount === 0) throw Object.assign(new Error('not_found'), { code: 'NOT_FOUND' })
    }

    await client.query(`DELETE FROM tab_usuario_empresa WHERE usuario_id = $1 AND empresa_id <> ALL($2::int[])`, [id, d.empresas_ids])

    for (const empresaId of d.empresas_ids) {
      await client.query(
        `INSERT INTO tab_usuario_empresa (usuario_id, empresa_id, perfil, ativo)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (usuario_id, empresa_id) DO UPDATE SET perfil = $3, ativo = true`,
        [id, empresaId, d.perfil],
      )
    }

    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    if ((err as { code?: string }).code === 'NOT_FOUND') {
      return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
    }
    throw err
  } finally {
    client.release()
  }
}

// DELETE /api/cadastro/usuarios/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const id = Number(params.id)
  if (id === session.usuario_id) {
    return NextResponse.json({ erro: 'Você não pode excluir seu próprio usuário' }, { status: 400 })
  }

  const db     = getDb(session.database_name)
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM tab_usuario_empresa WHERE usuario_id = $1`, [id])
    const result = await client.query(`DELETE FROM tab_usuario WHERE id = $1`, [id])
    await client.query('COMMIT')

    if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
