import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { empresaSchema } from '@/lib/validators/empresa.schema'

// GET /api/cadastro/empresas/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT id, razao_social, nome_fantasia, cnpj, ie, im,
            regime_tributario, crt,
            cep, logradouro, numero, complemento, bairro, cidade, uf, cod_ibge,
            telefone, email, email_nfe,
            ambiente_nfe, serie_nfe, prox_num_nfe,
            serie_nfce, prox_num_nfce, csc_nfce, id_token_nfce,
            TO_CHAR(cert_validade, 'YYYY-MM-DD') AS cert_validade,
            cod_tipo_cobranca,
            ativo, created_at, updated_at
     FROM tab_empresa
     WHERE id = $1`,
    [params.id],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/cadastro/empresas/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const json = await req.json()

  // Soft delete / toggle ativo
  if ('ativo' in json && Object.keys(json).length === 1) {
    const db = getDb(session.database_name)
    await db.query(
      `UPDATE tab_empresa SET ativo = $1, updated_at = NOW() WHERE id = $2`,
      [json.ativo, params.id],
    )
    return NextResponse.json({ ok: true })
  }

  const body = empresaSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const up  = (v?: string | null) => (v ? v.toUpperCase() : v ?? null)
  const db = getDb(session.database_name)

  await db.query(
    `UPDATE tab_empresa SET
       razao_social=$1, nome_fantasia=$2, cnpj=$3, ie=$4, im=$5,
       regime_tributario=$6, crt=$7,
       cep=$8, logradouro=$9, numero=$10, complemento=$11, bairro=$12,
       cidade=$13, uf=$14, cod_ibge=$15,
       telefone=$16, email=$17, email_nfe=$18,
       ambiente_nfe=$19, serie_nfe=$20, prox_num_nfe=$21,
       serie_nfce=$22, prox_num_nfce=$23, csc_nfce=$24, id_token_nfce=$25,
       cod_tipo_cobranca=$26,
       ativo=$27, updated_at=NOW()
     WHERE id = $28`,
    [
      up(d.razao_social), up(d.nome_fantasia), up(d.cnpj), up(d.ie), up(d.im),
      d.regime_tributario, d.crt,
      up(d.cep), up(d.logradouro), up(d.numero), up(d.complemento),
      up(d.bairro), up(d.cidade), up(d.uf), d.cod_ibge ?? null,
      d.telefone ?? null, d.email || null, d.email_nfe || null,
      d.ambiente_nfe, d.serie_nfe, d.prox_num_nfe,
      d.serie_nfce, d.prox_num_nfce, d.csc_nfce ?? null, d.id_token_nfce ?? null,
      d.cod_tipo_cobranca ?? null,
      d.ativo,
      params.id,
    ],
  )

  return NextResponse.json({ ok: true })
}

// DELETE /api/cadastro/empresas/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const result = await db.query(
    `DELETE FROM tab_empresa WHERE id = $1`,
    [params.id],
  )

  if (result.rowCount === 0)
    return NextResponse.json({ erro: 'Registro não encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
