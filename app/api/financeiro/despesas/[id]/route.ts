import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { despesaSchema } from '@/lib/validators/despesa.schema'

// GET /api/financeiro/despesas/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const [{ rows }, { rows: parcelas }, { rows: rateios }] = await Promise.all([
    db.query(
      `SELECT d.id, d.empresa_id,
              d.pessoa_id, p.nome AS pessoa_nome,
              d.tipo_despesa_id, td.descricao AS tipo_despesa_desc,              td.natureza AS tipo_despesa_natureza,              d.cod_tipo_cobranca, tc.des_tipo_cobranca AS tipo_cobranca_desc,
              d.centro_custo_id, cc.descricao AS centro_custo_desc,
              d.conta_banco_id, cb.mnemonico AS conta_banco_desc,
              d.ind_avista, d.destino,
              TO_CHAR(d.data_despesa,     'YYYY-MM-DD') AS data_despesa,
              TO_CHAR(d.data_competencia, 'YYYY-MM-DD') AS data_competencia,
              TO_CHAR(d.data_pagamento,   'YYYY-MM-DD') AS data_pagamento,
              d.documento, d.valor, d.num_parcelas, d.intervalo_dias,
              d.status, d.observacao, d.created_by, d.created_at, d.updated_at
       FROM tab_despesa d
       LEFT JOIN tab_pessoa           p  ON p.id  = d.pessoa_id
       LEFT JOIN tab_tipo_despesa     td ON td.id = d.tipo_despesa_id
       LEFT JOIN tab_tipo_cobranca    tc ON tc.cod_tipo_cobranca = d.cod_tipo_cobranca
       LEFT JOIN tab_centro_custo     cc ON cc.id = d.centro_custo_id
       LEFT JOIN tab_conta_banco      cb ON cb.id = d.conta_banco_id
       WHERE d.id = $1 AND d.empresa_id = $2`,
      [params.id, session.empresa_id_ativa],
    ),
    db.query(
      `SELECT id, numero_parcela, TO_CHAR(data_vencimento,'YYYY-MM-DD') AS data_vencimento,
              valor, titulo_pagar_id
       FROM tab_despesa_parcela
       WHERE despesa_id = $1
       ORDER BY numero_parcela`,
      [params.id],
    ),
    db.query(
      `SELECT dr.id, dr.centro_custo_id,
              cc.codigo, cc.descricao,
              dr.percentual, dr.valor
       FROM tab_despesa_rateio dr
       LEFT JOIN tab_centro_custo cc ON cc.id = dr.centro_custo_id
       WHERE dr.despesa_id = $1
       ORDER BY dr.id`,
      [params.id],
    ),
  ])

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ...rows[0], parcelas, rateios })
}

// PATCH /api/financeiro/despesas/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const raw  = await req.json()
  const db   = getDb(session.database_name)

  // Atualização rápida de status apenas
  if ('status' in raw && Object.keys(raw).length === 1) {
    await db.query(
      `UPDATE tab_despesa SET status=$1, updated_at=NOW() WHERE id=$2 AND empresa_id=$3`,
      [raw.status, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const body = despesaSchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d       = body.data
  const rateios: Array<{centro_custo_id: number; percentual: number; valor: number}> = Array.isArray(raw.rateios) ? raw.rateios : []
  console.log('[PATCH /despesas/:id] rateios recebidos:', JSON.stringify(rateios))
  const up      = (v?: string | null) => (v ? v.toUpperCase() : null)
  const dt      = (v?: string | null) => (v && v.trim() ? v : null)

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

    const result = await client.query(
      `UPDATE tab_despesa SET
         pessoa_id=$1, tipo_despesa_id=$2, cod_tipo_cobranca=$3, centro_custo_id=$4,
         conta_banco_id=$5, ind_avista=$6, destino=$7,
         data_despesa=$8, data_competencia=$9, data_pagamento=$10, documento=$11,
         valor=$12, num_parcelas=$13, intervalo_dias=$14, status=$15, observacao=$16,
         updated_at=NOW()
       WHERE id=$17 AND empresa_id=$18`,
      [
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
        params.id,
        session.empresa_id_ativa,
      ],
    )
    if (result.rowCount === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
    }

    await client.query(
      `UPDATE tab_titulo_pagar
         SET cod_tipo_cobranca = $1, centro_custo_id = $2
       WHERE despesa_id = $3 AND status = 'A'`,
      [d.cod_tipo_cobranca ?? null, d.centro_custo_id ?? null, params.id],
    )

    await client.query(`DELETE FROM tab_despesa_rateio WHERE despesa_id = $1`, [params.id])
    for (const r of rateios) {
      await client.query(
        `INSERT INTO tab_despesa_rateio (despesa_id, centro_custo_id, percentual, valor)
         VALUES ($1,$2,$3,$4)`,
        [params.id, r.centro_custo_id, r.percentual, r.valor],
      )
    }

    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// DELETE /api/financeiro/despesas/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db     = getDb(session.database_name)
  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `SELECT id FROM tab_despesa WHERE id=$1 AND empresa_id=$2`,
      [params.id, session.empresa_id_ativa],
    )
    if (!rows.length) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
    }

    // Verifica se algum título a pagar tem baixa registrada (movimento de caixa ou banco)
    const { rows: titulosBaixados } = await client.query(
      `SELECT tp.id, tp.numero_titulo
       FROM tab_titulo_pagar tp
       WHERE tp.despesa_id = $1
         AND (
           EXISTS (SELECT 1 FROM tab_movimento_caixa mc WHERE mc.titulo_pagar_id = tp.id)
           OR
           EXISTS (SELECT 1 FROM tab_movimento_banco mb WHERE mb.titulo_pagar_id = tp.id)
         )`,
      [params.id],
    )
    if (titulosBaixados.length > 0) {
      await client.query('ROLLBACK')
      const titulos = titulosBaixados.map((r: { numero_titulo: string }) => r.numero_titulo).join(', ')
      return NextResponse.json(
        { erro: `Não é possível excluir esta despesa pois o(s) título(s) ${titulos} já possui(em) baixa registrada. Estorne o pagamento antes de excluir.` },
        { status: 409 },
      )
    }

    // Nula FKs circulares antes de apagar movimentos
    await client.query(
      `UPDATE tab_despesa SET movimento_caixa_id=NULL, movimento_banco_id=NULL WHERE id=$1`,
      [params.id],
    )

    // Apaga registros filhos em ordem
    await client.query(`DELETE FROM tab_despesa_rateio  WHERE despesa_id=$1`, [params.id])
    await client.query(`DELETE FROM tab_despesa_parcela WHERE despesa_id=$1`, [params.id])
    await client.query(`DELETE FROM tab_titulo_pagar    WHERE despesa_id=$1`, [params.id])
    await client.query(`DELETE FROM tab_movimento_caixa WHERE despesa_id=$1`, [params.id])
    await client.query(`DELETE FROM tab_movimento_banco  WHERE despesa_id=$1`, [params.id])

    await client.query(`DELETE FROM tab_despesa WHERE id=$1`, [params.id])

    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
