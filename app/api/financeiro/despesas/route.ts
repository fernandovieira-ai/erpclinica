import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { despesaSchema } from '@/lib/validators/despesa.schema'

// GET /api/financeiro/despesas?busca=&status=&data_inicio=&data_fim=&page=1&limit=20
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp          = req.nextUrl.searchParams
  const busca       = sp.get('busca')?.trim() || ''
  const status      = sp.get('status') || ''
  const data_inicio = sp.get('data_inicio') || ''
  const data_fim    = sp.get('data_fim') || ''
  const page        = Math.max(1, Number(sp.get('page') || 1))
  const limit       = Math.min(200, Number(sp.get('limit') || 20))
  const offset      = (page - 1) * limit

  const db = getDb(session.database_name)

  const conds: string[]   = [`d.empresa_id = $1`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2

  if (status) {
    conds.push(`d.status = $${pi++}`)
    params.push(status)
  }
  if (data_inicio) {
    conds.push(`d.data_despesa >= $${pi++}`)
    params.push(data_inicio)
  }
  if (data_fim) {
    conds.push(`d.data_despesa <= $${pi++}`)
    params.push(data_fim)
  }
  if (busca) {
    conds.push(`(d.documento ILIKE $${pi} OR p.nome ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  const where = 'WHERE ' + conds.join(' AND ')

  const [{ rows: countRows }, { rows }] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS n
       FROM tab_despesa d
       LEFT JOIN tab_pessoa p ON p.id = d.pessoa_id
       ${where}`,
      params,
    ),
    db.query(
      `SELECT d.id, d.data_despesa, d.documento,
              p.nome  AS pessoa_nome,
              td.descricao AS tipo_despesa_desc,
              tc.des_tipo_cobranca AS tipo_cobranca_desc,
              d.valor, d.num_parcelas, d.status
       FROM tab_despesa d
       LEFT JOIN tab_pessoa         p  ON p.id  = d.pessoa_id
       LEFT JOIN tab_tipo_despesa   td ON td.id = d.tipo_despesa_id
       LEFT JOIN tab_tipo_cobranca  tc ON tc.cod_tipo_cobranca = d.cod_tipo_cobranca
       ${where}
       ORDER BY d.data_despesa DESC, d.id DESC
       LIMIT $${pi} OFFSET $${pi + 1}`,
      [...params, limit, offset],
    ),
  ])

  const total = Number(countRows[0].n)
  return NextResponse.json({ dados: rows, total, page, limit, pages: Math.ceil(total / limit) })
}

// POST /api/financeiro/despesas
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const raw  = await req.json()
  const body = despesaSchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d       = body.data
  const rateios: Array<{centro_custo_id: number; percentual: number; valor: number}> = Array.isArray(raw.rateios) ? raw.rateios : []
  console.log('[POST /despesas] rateios recebidos:', JSON.stringify(rateios))
  const up      = (v?: string | null) => (v ? v.toUpperCase() : null)
  const dt      = (v?: string | null) => (v && v.trim() ? v : null)
  const db      = getDb(session.database_name)

  // Valida: banco selecionado exige conta bancária
  if (d.destino === 'B' && !d.conta_banco_id) {
    return NextResponse.json({ erro: 'Pagamento em banco requer conta bancária.' }, { status: 400 })
  }

  // Valida: despesa parcelada (sem destino) exige tipo de cobrança
  if (!d.destino && !d.cod_tipo_cobranca) {
    return NextResponse.json({ erro: 'Tipo de Cobrança é obrigatório para despesas parceladas.' }, { status: 400 })
  }

  // Valida: tipo_despesa Administrativa exige rateio
  if (d.tipo_despesa_id) {
    const { rows: tdRows } = await db.query(
      `SELECT natureza FROM tab_tipo_despesa WHERE id=$1 AND empresa_id=$2`,
      [d.tipo_despesa_id, session.empresa_id_ativa],
    )
    if (tdRows[0]?.natureza === 'A' && rateios.length === 0) {
      return NextResponse.json({ erro: 'Tipo de despesa Administrativa requer pelo menos um rateio de centro de custo.' }, { status: 400 })
    }
  }

  const client  = await db.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `INSERT INTO tab_despesa
         (empresa_id, pessoa_id, tipo_despesa_id, cod_tipo_cobranca, centro_custo_id,
          conta_banco_id, ind_avista, destino,
          data_despesa, data_competencia, data_pagamento, documento,
          valor, num_parcelas, intervalo_dias, status, observacao, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        session.empresa_id_ativa,
        d.pessoa_id,
        d.tipo_despesa_id,
        d.cod_tipo_cobranca  ?? null,
        d.centro_custo_id    ?? null,
        d.conta_banco_id     ?? null,
        d.ind_avista,
        d.destino            ?? null,
        dt(d.data_despesa),
        dt(d.data_competencia),
        dt(d.data_pagamento),
        up(d.documento),
        d.valor,
        d.num_parcelas,
        d.intervalo_dias,
        d.status,
        d.observacao         ?? null,
        session.nome ?? null,
      ],
    )
    const despesaId = rows[0].id

    for (const r of rateios) {
      await client.query(
        `INSERT INTO tab_despesa_rateio (despesa_id, centro_custo_id, percentual, valor)
         VALUES ($1,$2,$3,$4)`,
        [despesaId, r.centro_custo_id, r.percentual, r.valor],
      )
    }

    await client.query('COMMIT')
    return NextResponse.json({ id: despesaId }, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
