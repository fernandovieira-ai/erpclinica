import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { pessoaSchema } from '@/lib/validators/pessoa.schema'

// GET /api/cadastro/pessoas?busca=&papel=&ativo=true&page=1&limit=20
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const busca  = sp.get('busca')?.trim() || ''
  const papel  = sp.get('papel') || ''
  const ativo  = sp.get('ativo') ?? 'true'
  const page   = Math.max(1, Number(sp.get('page') || 1))
  const limit  = Math.min(100, Number(sp.get('limit') || 20))
  const offset = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]    = []
  const params: unknown[]  = []
  let pi = 1

  if (ativo !== 'all') {
    conds.push(`p.ativo = $${pi++}`)
    params.push(ativo !== 'false')
  }
  if (busca) {
    conds.push(`(p.nome ILIKE $${pi} OR p.cpf_cnpj ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }
  if (papel === 'cliente')       conds.push('p.ind_cliente = true')
  if (papel === 'fornecedor')    conds.push('p.ind_fornecedor = true')
  if (papel === 'banco')         conds.push('p.ind_banco = true')
  if (papel === 'transportador') conds.push('p.ind_transportador = true')
  if (papel === 'paciente')      conds.push('p.ind_paciente = true')
  if (papel === 'profissional')  conds.push('p.ind_profissional = true')

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(`SELECT COUNT(*) AS n FROM tab_pessoa p ${where}`, params),
    db.query(
      `SELECT p.id, p.tipo_pessoa, p.nome, p.nome_fantasia, p.cpf_cnpj,
              p.cidade, p.uf, p.telefone, p.celular, p.email,
              p.ind_cliente, p.ind_fornecedor, p.ind_banco, p.ind_transportador,
              p.ind_paciente, p.ind_profissional,
              p.ativo
       FROM tab_pessoa p ${where}
       ORDER BY p.nome
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/cadastro/pessoas
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = pessoaSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d  = body.data
  const db = getDb(session.database_name)
  const up = (v: string | null | undefined) => v ? v.toUpperCase() : null

  const { rows } = await db.query(
    `INSERT INTO tab_pessoa (
       empresa_id, tipo_pessoa, nome, nome_fantasia, cpf_cnpj, data_nascimento, rg_ie, im,
       ind_cliente, ind_fornecedor, ind_banco, ind_transportador, ind_paciente, ind_profissional,
       cep, logradouro, numero, complemento, bairro, cidade, uf,
       telefone, celular, whatsapp, email, email_nfe,
       limite_credito, cod_tipo_cobranca, banco_nome, banco_agencia, banco_conta, banco_tipo, chave_pix,
       contribuinte_icms, optante_simples, obs,
       sexo, cor_raca, estado_civil, naturalidade, foto,
       pai_pessoa_id, pai_nome, pai_paciente,
       mae_pessoa_id, mae_nome, mae_paciente,
       conjuge_pessoa_id, conjuge_nome, conjuge_paciente,
       indicacao_pessoa_id, indicacao_nome, indicacao_fone, indicacao_ligacao,
       profissao, altura, peso, crm, crm_uf
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
       $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,
       $37,$38,$39,$40,$41,
       $42,$43,$44,$45,$46,$47,$48,$49,$50,$51,$52,$53,$54,$55,$56,$57,$58,$59
     ) RETURNING id`,
    [
      session.empresa_id_ativa, d.tipo_pessoa, up(d.nome), up(d.nome_fantasia),
      d.cpf_cnpj ?? null, d.data_nascimento ?? null, up(d.rg_ie), up(d.im),
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
    ],
  )

  return NextResponse.json({ id: rows[0].id }, { status: 201 })
}
