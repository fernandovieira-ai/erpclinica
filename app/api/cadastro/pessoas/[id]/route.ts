import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { pessoaSchema } from '@/lib/validators/pessoa.schema'

// GET /api/cadastro/pessoas/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT id, tipo_pessoa, nome, nome_fantasia, cpf_cnpj,
            TO_CHAR(data_nascimento, 'YYYY-MM-DD') AS data_nascimento,
            sexo, cor_raca, estado_civil, naturalidade, foto,
            profissao, altura, peso,
            pai_pessoa_id, pai_nome, pai_paciente,
            mae_pessoa_id, mae_nome, mae_paciente,
            conjuge_pessoa_id, conjuge_nome, conjuge_paciente,
            indicacao_pessoa_id, indicacao_nome, indicacao_fone, indicacao_ligacao,
            rg_ie, im, crm, crm_uf,
            ind_cliente, ind_fornecedor, ind_banco, ind_transportador, ind_paciente, ind_profissional,
            cep, logradouro, numero, complemento, bairro, cidade, uf, cod_ibge,
            telefone, celular, whatsapp, email, email_nfe,
            limite_credito, cod_tipo_cobranca, banco_nome, banco_agencia, banco_conta, banco_tipo, chave_pix,
            contribuinte_icms, optante_simples, obs, ativo, created_at, updated_at
     FROM tab_pessoa
     WHERE id = $1`,
    [params.id],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

// PATCH /api/cadastro/pessoas/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const json = await req.json()

  // Soft delete
  if ('ativo' in json && Object.keys(json).length === 1) {
    const db = getDb(session.database_name)
    await db.query(
      `UPDATE tab_pessoa SET ativo = $1, updated_at = NOW()
       WHERE id = $2`,
      [json.ativo, params.id],
    )
    return NextResponse.json({ ok: true })
  }

  const body = pessoaSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)
  const up = (v: string | null | undefined) => v ? v.toUpperCase() : null

  const result = await db.query(
    `UPDATE tab_pessoa SET
       tipo_pessoa=$1, nome=$2, nome_fantasia=$3, cpf_cnpj=$4, data_nascimento=$5, rg_ie=$6, im=$7,
       ind_cliente=$8, ind_fornecedor=$9, ind_banco=$10, ind_transportador=$11,
       ind_paciente=$12, ind_profissional=$13,
       cep=$14, logradouro=$15, numero=$16, complemento=$17, bairro=$18, cidade=$19, uf=$20,
       telefone=$21, celular=$22, whatsapp=$23, email=$24, email_nfe=$25,
       limite_credito=$26, cod_tipo_cobranca=$27, banco_nome=$28, banco_agencia=$29, banco_conta=$30, banco_tipo=$31, chave_pix=$32,
       contribuinte_icms=$33, optante_simples=$34, obs=$35,
       sexo=$36, cor_raca=$37, estado_civil=$38, naturalidade=$39, foto=$40,
       pai_pessoa_id=$41, pai_nome=$42, pai_paciente=$43,
       mae_pessoa_id=$44, mae_nome=$45, mae_paciente=$46,
       conjuge_pessoa_id=$47, conjuge_nome=$48, conjuge_paciente=$49,
       indicacao_pessoa_id=$50, indicacao_nome=$51, indicacao_fone=$52, indicacao_ligacao=$53,
       profissao=$54, altura=$55, peso=$56, crm=$57, crm_uf=$58,
       updated_at=NOW()
     WHERE id = $59`,
    [
      d.tipo_pessoa, up(d.nome), up(d.nome_fantasia),
      d.cpf_cnpj ?? null, d.data_nascimento || null, up(d.rg_ie), up(d.im),
      d.ind_cliente, d.ind_fornecedor, d.ind_banco, d.ind_transportador,
      d.ind_paciente ?? false, d.ind_profissional ?? false,
      d.cep ?? null, up(d.logradouro), up(d.numero),
      up(d.complemento), up(d.bairro), up(d.cidade), up(d.uf),
      d.telefone ?? null, d.celular ?? null, d.whatsapp ?? null,
      d.email || null, d.email_nfe || null,
      d.limite_credito, d.cod_tipo_cobranca ?? null, up(d.banco_nome), d.banco_agencia ?? null,
      d.banco_conta ?? null, up(d.banco_tipo), d.chave_pix ?? null,
      d.contribuinte_icms, d.optante_simples, up(d.obs),
      d.sexo ?? null, up(d.cor_raca), up(d.estado_civil), up(d.naturalidade), d.foto ?? null,
      d.pai_pessoa_id ?? null, up(d.pai_nome), d.pai_paciente ?? false,
      d.mae_pessoa_id ?? null, up(d.mae_nome), d.mae_paciente ?? false,
      d.conjuge_pessoa_id ?? null, up(d.conjuge_nome), d.conjuge_paciente ?? false,
      d.indicacao_pessoa_id ?? null, up(d.indicacao_nome), d.indicacao_fone ?? null, up(d.indicacao_ligacao),
      up(d.profissao), d.altura ?? null, d.peso ?? null, up(d.crm), up(d.crm_uf),
      params.id,
    ],
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ erro: 'Registro não encontrado ou sem permissão' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/cadastro/pessoas/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const result = await db.query(
    `DELETE FROM tab_pessoa WHERE id = $1`,
    [params.id],
  )

  if (result.rowCount === 0)
    return NextResponse.json({ erro: 'Registro não encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
