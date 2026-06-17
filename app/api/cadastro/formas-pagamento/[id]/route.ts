import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { tipoCobrancaUpdateSchema } from '@/lib/validators/forma-pagamento.schema'

// GET /api/cadastro/formas-pagamento/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT cod_tipo_cobranca AS id, cod_tipo_cobranca, des_tipo_cobranca, ind_status
     FROM tab_tipo_cobranca
     WHERE cod_tipo_cobranca = $1`,
    [Number(params.id)],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/cadastro/formas-pagamento/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const json = await req.json()
  const db   = getDb(session.database_name)

  // Atualização rápida de status apenas
  if ('ind_status' in json && Object.keys(json).length === 1) {
    await db.query(
      `UPDATE tab_tipo_cobranca SET ind_status=$1 WHERE cod_tipo_cobranca=$2`,
      [json.ind_status, Number(params.id)],
    )
    return NextResponse.json({ ok: true })
  }

  const body = tipoCobrancaUpdateSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d = body.data

  const result = await db.query(
    `UPDATE tab_tipo_cobranca
     SET des_tipo_cobranca=$1, ind_status=$2
     WHERE cod_tipo_cobranca=$3`,
    [d.des_tipo_cobranca.toUpperCase(), d.ind_status, Number(params.id)],
  )

  if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/cadastro/formas-pagamento/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const result = await db.query(
    `DELETE FROM tab_tipo_cobranca WHERE cod_tipo_cobranca=$1`,
    [Number(params.id)],
  )

  if (result.rowCount === 0) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

