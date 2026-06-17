import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/pacientes?busca=
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const busca = req.nextUrl.searchParams.get('busca')?.trim() || ''
  const db    = getDb(session.database_name)

  const params: unknown[] = [session.empresa_id_ativa]
  let buscaCond = ''
  if (busca) {
    buscaCond = ` AND (p.nome ILIKE $2 OR p.cpf_cnpj ILIKE $2)`
    params.push(`%${busca}%`)
  }

  const { rows } = await db.query(
    `SELECT p.id, p.nome, p.cpf_cnpj, p.celular, p.telefone, p.whatsapp, p.cidade, p.uf, p.email
     FROM tab_pessoa p
     WHERE p.empresa_id = $1 AND p.ind_paciente = true AND p.ativo = true
     ${buscaCond}
     ORDER BY p.nome
     LIMIT 50`,
    params,
  )

  return NextResponse.json({ dados: rows })
}

// POST /api/clinica/pacientes — cadastro rápido de paciente
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json()
  const nome: string = (body.nome ?? '').trim().toUpperCase()
  if (!nome) return NextResponse.json({ erro: 'Nome é obrigatório' }, { status: 400 })

  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `INSERT INTO tab_pessoa (
       empresa_id, tipo_pessoa, nome, cpf_cnpj, data_nascimento, celular, ind_paciente
     ) VALUES ($1, 'F', $2, $3, $4, $5, true)
     RETURNING id, nome, cpf_cnpj, celular`,
    [
      session.empresa_id_ativa,
      nome,
      body.cpf_cnpj?.trim() || null,
      body.data_nascimento || null,
      body.celular?.trim() || null,
    ],
  )

  return NextResponse.json(rows[0], { status: 201 })
}
