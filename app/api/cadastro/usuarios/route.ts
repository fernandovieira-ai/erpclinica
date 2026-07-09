import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { usuarioCreateSchema } from '@/lib/validators/usuario.schema'

// GET /api/cadastro/usuarios?busca=&perfil=&ativo=true&page=1&limit=50
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const busca  = sp.get('busca')?.trim() || ''
  const perfil = sp.get('perfil') ?? 'all'
  const ativo  = sp.get('ativo') ?? 'true'
  const page   = Math.max(1, Number(sp.get('page') || 1))
  const limit  = Math.min(200, Number(sp.get('limit') || 50))
  const offset = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = []
  const params: unknown[] = []
  let pi = 1

  if (ativo !== 'all') {
    conds.push(`u.ativo = $${pi++}`)
    params.push(ativo !== 'false')
  }
  if (perfil !== 'all') {
    conds.push(`u.perfil = $${pi++}`)
    params.push(perfil)
  }
  if (busca) {
    conds.push(`(u.nome ILIKE $${pi} OR u.email ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_usuario u ${where}`, params),
    db.query(
      `SELECT u.id, u.nome, u.email, u.perfil, u.ultimo_acesso, u.ativo,
              u.profissional_id, prof.nome AS profissional_nome,
              COALESCE(
                json_agg(json_build_object('id', e.id, 'razao_social', e.razao_social) ORDER BY e.razao_social)
                FILTER (WHERE e.id IS NOT NULL),
                '[]'
              ) AS empresas
       FROM tab_usuario u
       LEFT JOIN tab_usuario_empresa ue ON ue.usuario_id = u.id AND ue.ativo = true
       LEFT JOIN tab_empresa e ON e.id = ue.empresa_id
       LEFT JOIN tab_pessoa prof ON prof.id = u.profissional_id
       ${where}
       GROUP BY u.id, prof.nome
       ORDER BY u.nome
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/cadastro/usuarios
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = usuarioCreateSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)

  const { rows: existentes } = await db.query(`SELECT id FROM tab_usuario WHERE email = $1`, [d.email])
  if (existentes.length) return NextResponse.json({ erro: 'Já existe um usuário com este e-mail' }, { status: 409 })

  const senhaHash = await bcrypt.hash(d.senha, 10)

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `INSERT INTO tab_usuario (nome, email, senha_hash, perfil, trocar_senha, ativo, profissional_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [d.nome.toUpperCase(), d.email, senhaHash, d.perfil, d.trocar_senha, d.ativo, d.profissional_id || null],
    )
    const usuarioId = rows[0].id

    for (const empresaId of d.empresas_ids) {
      await client.query(
        `INSERT INTO tab_usuario_empresa (usuario_id, empresa_id, perfil, ativo)
         VALUES ($1, $2, $3, true)`,
        [usuarioId, empresaId, d.perfil],
      )
    }

    await client.query('COMMIT')
    return NextResponse.json({ id: usuarioId }, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
