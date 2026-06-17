import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { receitaSchema } from '@/lib/validators/receita.schema'

// GET /api/financeiro/receitas/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const [{ rows }, { rows: parcelas }, { rows: rateios }] = await Promise.all([
    db.query(
      `SELECT r.id, r.empresa_id,
              r.pessoa_id, p.nome AS pessoa_nome,
              r.tipo_receita_id, tr.descricao AS tipo_receita_desc,
              tr.natureza AS tipo_receita_natureza,
              r.cod_tipo_cobranca, tc.des_tipo_cobranca AS tipo_cobranca_desc,
              r.centro_custo_id, cc.descricao AS centro_custo_desc,
              r.conta_banco_id, cb.mnemonico AS conta_banco_desc,
              r.ind_avista, r.destino,
              TO_CHAR(r.data_receita,      'YYYY-MM-DD') AS data_receita,
              TO_CHAR(r.data_competencia,  'YYYY-MM-DD') AS data_competencia,
              TO_CHAR(r.data_recebimento,  'YYYY-MM-DD') AS data_recebimento,
              r.documento, r.valor, r.num_parcelas, r.intervalo_dias,
              r.status, r.observacao, r.created_by, r.created_at, r.updated_at
       FROM tab_receita r
       LEFT JOIN tab_pessoa           p  ON p.id  = r.pessoa_id
       LEFT JOIN tab_tipo_receita     tr ON tr.id = r.tipo_receita_id
       LEFT JOIN tab_tipo_cobranca    tc ON tc.cod_tipo_cobranca = r.cod_tipo_cobranca
       LEFT JOIN tab_centro_custo     cc ON cc.id = r.centro_custo_id
       LEFT JOIN tab_conta_banco      cb ON cb.id = r.conta_banco_id
       WHERE r.id = $1 AND r.empresa_id = $2`,
      [params.id, session.empresa_id_ativa],
    ),
    db.query(
      `SELECT id, numero_parcela, TO_CHAR(data_vencimento,'YYYY-MM-DD') AS data_vencimento,
              valor, titulo_receber_id
       FROM tab_receita_parcela
       WHERE receita_id = $1
       ORDER BY numero_parcela`,
      [params.id],
    ),
    db.query(
      `SELECT rr.id, rr.centro_custo_id,
              cc.codigo, cc.descricao,
              rr.percentual, rr.valor
       FROM tab_receita_rateio rr
       LEFT JOIN tab_centro_custo cc ON cc.id = rr.centro_custo_id
       WHERE rr.receita_id = $1
       ORDER BY rr.id`,
      [params.id],
    ),
  ])

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json({ ...rows[0], parcelas, rateios })
}

// PATCH /api/financeiro/receitas/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const raw = await req.json()
  const db  = getDb(session.database_name)

  // Atualização rápida de status apenas
  if ('status' in raw && Object.keys(raw).length === 1) {
    await db.query(
      `UPDATE tab_receita SET status=$1, updated_at=NOW() WHERE id=$2 AND empresa_id=$3`,
      [raw.status, params.id, session.empresa_id_ativa],
    )
    return NextResponse.json({ ok: true })
  }

  const body = receitaSchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const d       = body.data
  const rateios: Array<{centro_custo_id: number; percentual: number; valor: number}> = Array.isArray(raw.rateios) ? raw.rateios : []
  const up      = (v?: string | null) => (v ? v.toUpperCase() : null)
  const dt      = (v?: string | null) => (v && v.trim() ? v : null)

  if (d.destino === 'B' && !d.conta_banco_id) {
    return NextResponse.json({ erro: 'Recebimento em banco requer conta bancária.' }, { status: 400 })
  }

  if (!d.destino && !d.cod_tipo_cobranca) {
    return NextResponse.json({ erro: 'Tipo de Cobrança é obrigatório para receitas parceladas.' }, { status: 400 })
  }

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const result = await client.query(
      `UPDATE tab_receita SET
         pessoa_id=$1, tipo_receita_id=$2, cod_tipo_cobranca=$3, centro_custo_id=$4,
         conta_banco_id=$5, ind_avista=$6, destino=$7,
         data_receita=$8, data_competencia=$9, data_recebimento=$10, documento=$11,
         valor=$12, num_parcelas=$13, intervalo_dias=$14, status=$15, observacao=$16,
         updated_at=NOW()
       WHERE id=$17 AND empresa_id=$18`,
      [
        d.pessoa_id,
        d.tipo_receita_id,
        d.cod_tipo_cobranca  ?? null,
        d.centro_custo_id    ?? null,
        d.conta_banco_id     ?? null,
        d.ind_avista,
        d.destino            ?? null,
        dt(d.data_receita),
        dt(d.data_competencia),
        dt(d.data_recebimento),
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
      `UPDATE tab_titulo_receber
         SET cod_tipo_cobranca = $1, centro_custo_id = $2
       WHERE receita_id = $3 AND status = 'A'`,
      [d.cod_tipo_cobranca ?? null, d.centro_custo_id ?? null, params.id],
    )

    await client.query(`DELETE FROM tab_receita_rateio WHERE receita_id = $1`, [params.id])
    for (const r of rateios) {
      await client.query(
        `INSERT INTO tab_receita_rateio (receita_id, centro_custo_id, percentual, valor)
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

// DELETE /api/financeiro/receitas/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db     = getDb(session.database_name)
  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `SELECT id FROM tab_receita WHERE id=$1 AND empresa_id=$2`,
      [params.id, session.empresa_id_ativa],
    )
    if (!rows.length) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
    }

    // Verifica se algum título a receber tem baixa registrada
    const { rows: titulosBaixados } = await client.query(
      `SELECT tr.id, tr.numero_titulo
       FROM tab_titulo_receber tr
       WHERE tr.receita_id = $1
         AND (
           EXISTS (SELECT 1 FROM tab_movimento_caixa mc WHERE mc.titulo_receber_id = tr.id)
           OR
           EXISTS (SELECT 1 FROM tab_movimento_banco mb WHERE mb.titulo_receber_id = tr.id)
         )`,
      [params.id],
    )
    if (titulosBaixados.length > 0) {
      await client.query('ROLLBACK')
      const titulos = titulosBaixados.map((r: { numero_titulo: string }) => r.numero_titulo).join(', ')
      return NextResponse.json(
        { erro: `Não é possível excluir esta receita pois o(s) título(s) ${titulos} já possui(em) baixa registrada. Estorne o recebimento antes de excluir.` },
        { status: 409 },
      )
    }

    // Nula FKs circulares antes de apagar movimentos
    await client.query(
      `UPDATE tab_receita SET movimento_caixa_id=NULL, movimento_banco_id=NULL WHERE id=$1`,
      [params.id],
    )

    // Apaga registros filhos em ordem
    await client.query(`DELETE FROM tab_receita_rateio   WHERE receita_id=$1`, [params.id])
    await client.query(`DELETE FROM tab_receita_parcela  WHERE receita_id=$1`, [params.id])
    await client.query(`DELETE FROM tab_titulo_receber   WHERE receita_id=$1`, [params.id])
    await client.query(`DELETE FROM tab_movimento_caixa  WHERE receita_id=$1`, [params.id])
    await client.query(`DELETE FROM tab_movimento_banco   WHERE receita_id=$1`, [params.id])

    await client.query(`DELETE FROM tab_receita WHERE id=$1`, [params.id])

    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
