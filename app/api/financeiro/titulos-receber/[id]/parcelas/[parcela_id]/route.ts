import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

type Params = { params: { id: string; parcela_id: string } }

// PATCH /api/financeiro/titulos-receber/[id]/parcelas/[parcela_id]
// body: { action: 'baixa', data_baixa?: string, destino_liquidacao: 'C'|'B', conta_banco_liq_id?: number }
//     | { action: 'estorno' }
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const tituloId  = Number(params.id)
  const parcelaId = Number(params.parcela_id)
  if (!tituloId || !parcelaId) return NextResponse.json({ erro: 'IDs inválidos' }, { status: 400 })

  const body = await req.json() as {
    action: 'baixa' | 'estorno'
    data_baixa?: string
    destino_liquidacao?: 'C' | 'B'
    conta_banco_liq_id?: number
  }
  const db     = getDb(session.database_name)
  const client = await db.connect()

  try {
    // Verifica que o título pertence à empresa
    const { rows: titRows } = await client.query(
      `SELECT id, status, pessoa_id, num_documento, numero_titulo, observacao
       FROM tab_titulo_receber WHERE id=$1 AND empresa_id=$2`,
      [tituloId, session.empresa_id_ativa],
    )
    if (!titRows.length) return NextResponse.json({ erro: 'Título não encontrado' }, { status: 404 })
    const titulo = titRows[0]

    // Verifica que a parcela pertence a este título
    const { rows: parcRows } = await client.query(
      `SELECT id, status, valor, valor_juros FROM tab_titulo_receber_parcela WHERE id=$1 AND titulo_id=$2`,
      [parcelaId, tituloId],
    )
    if (!parcRows.length) return NextResponse.json({ erro: 'Parcela não encontrada' }, { status: 404 })
    const parcela = parcRows[0]

    await client.query('BEGIN')

    if (body.action === 'baixa') {
      if (parcela.status === 'L') {
        await client.query('ROLLBACK')
        return NextResponse.json({ erro: 'Parcela já está liquidada' }, { status: 409 })
      }

      if (body.destino_liquidacao !== 'C' && body.destino_liquidacao !== 'B') {
        await client.query('ROLLBACK')
        return NextResponse.json({ erro: 'Informe o destino do recebimento (Caixa ou Banco)' }, { status: 400 })
      }
      if (body.destino_liquidacao === 'B' && !body.conta_banco_liq_id) {
        await client.query('ROLLBACK')
        return NextResponse.json({ erro: 'Informe a conta bancária de recebimento' }, { status: 400 })
      }

      const dataBaixa  = body.data_baixa || new Date().toISOString().slice(0, 10)
      const valor      = Number(parcela.valor) + Number(parcela.valor_juros ?? 0)
      const documento  = titulo.num_documento || titulo.numero_titulo

      // Cria o movimento (caixa ou banco) vinculado a esta parcela
      if (body.destino_liquidacao === 'B') {
        await client.query(
          `INSERT INTO tab_movimento_banco
             (empresa_id, conta_banco_id, titulo_receber_id, parcela_receber_id, pessoa_id,
              tipo, valor, data_movimento, documento, observacao, created_by)
           VALUES ($1,$2,$3,$4,$5,'E',$6,$7,$8,$9,$10)`,
          [
            session.empresa_id_ativa, body.conta_banco_liq_id, tituloId, parcelaId, titulo.pessoa_id,
            valor, dataBaixa, documento, titulo.observacao, session.nome ?? null,
          ],
        )
      } else {
        await client.query(
          `INSERT INTO tab_movimento_caixa
             (empresa_id, titulo_receber_id, parcela_receber_id, pessoa_id,
              tipo, valor, data_movimento, documento, observacao, created_by)
           VALUES ($1,$2,$3,$4,'E',$5,$6,$7,$8,$9)`,
          [
            session.empresa_id_ativa, tituloId, parcelaId, titulo.pessoa_id,
            valor, dataBaixa, documento, titulo.observacao, session.nome ?? null,
          ],
        )
      }

      // Liquida a parcela
      await client.query(
        `UPDATE tab_titulo_receber_parcela SET status='L' WHERE id=$1`,
        [parcelaId],
      )

      // Verifica se TODAS as parcelas do título estão agora liquidadas
      const { rows: pendentes } = await client.query(
        `SELECT COUNT(*) AS n FROM tab_titulo_receber_parcela WHERE titulo_id=$1 AND status='A'`,
        [tituloId],
      )
      const todasLiquidadas = Number(pendentes[0].n) === 0

      if (todasLiquidadas) {
        // Fecha o título — a trigger fn_trigger_liquidar_titulo_receber é NO-OP
        // para título parcelado (ver novos/24_parcela_aware_titulo_receber.sql),
        // então não cria movimento duplicado aqui.
        await client.query(
          `UPDATE tab_titulo_receber SET
             status='L',
             data_liquidacao=$2,
             valor_liquidado=(
               SELECT COALESCE(SUM(valor + valor_juros), 0)
               FROM tab_titulo_receber_parcela
               WHERE titulo_id=$1
             )
           WHERE id=$1`,
          [tituloId, dataBaixa],
        )
      } else {
        // Atualiza valor parcialmente liquidado no título (mantém status 'A')
        await client.query(
          `UPDATE tab_titulo_receber SET
             valor_liquidado=(
               SELECT COALESCE(SUM(valor + valor_juros), 0)
               FROM tab_titulo_receber_parcela
               WHERE titulo_id=$1 AND status='L'
             )
           WHERE id=$1`,
          [tituloId],
        )
      }

      await client.query('COMMIT')
      return NextResponse.json({ ok: true, titulo_liquidado: todasLiquidadas })
    }

    if (body.action === 'estorno') {
      if (parcela.status === 'A') {
        await client.query('ROLLBACK')
        return NextResponse.json({ erro: 'Parcela já está em aberto' }, { status: 409 })
      }

      // Localiza o movimento desta parcela (caixa ou banco) via parcela_receber_id
      const { rows: movCaixa } = await client.query(
        `SELECT id, conciliado FROM tab_movimento_caixa WHERE parcela_receber_id=$1`,
        [parcelaId],
      )
      const { rows: movBanco } = await client.query(
        `SELECT id, conciliado FROM tab_movimento_banco WHERE parcela_receber_id=$1`,
        [parcelaId],
      )

      const movimentoConciliado = movCaixa[0]?.conciliado || movBanco[0]?.conciliado
      if (movimentoConciliado) {
        await client.query('ROLLBACK')
        return NextResponse.json({ erro: 'Não é possível estornar: movimento já conciliado' }, { status: 409 })
      }

      if (movCaixa.length) await client.query(`DELETE FROM tab_movimento_caixa WHERE id=$1`, [movCaixa[0].id])
      if (movBanco.length) await client.query(`DELETE FROM tab_movimento_banco WHERE id=$1`, [movBanco[0].id])

      // Reabre a parcela
      await client.query(
        `UPDATE tab_titulo_receber_parcela SET status='A' WHERE id=$1`,
        [parcelaId],
      )

      // Reabre o título (se estava fechado) e recalcula valor_liquidado a partir
      // das parcelas 'L' remanescentes. A trigger fn_trigger_estorno_titulo_receber
      // é NO-OP para título parcelado, então não mexe em outras parcelas.
      await client.query(
        `UPDATE tab_titulo_receber SET
           status           = CASE WHEN status = 'L' THEN 'A' ELSE status END,
           data_liquidacao  = CASE WHEN status = 'L' THEN NULL ELSE data_liquidacao END,
           valor_liquidado  = (
             SELECT COALESCE(SUM(valor + valor_juros), 0)
             FROM tab_titulo_receber_parcela
             WHERE titulo_id=$1 AND status='L'
           )
         WHERE id=$1`,
        [tituloId],
      )

      await client.query('COMMIT')
      return NextResponse.json({ ok: true })
    }

    await client.query('ROLLBACK')
    return NextResponse.json({ erro: 'Ação inválida' }, { status: 400 })
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* já finalizada */ }
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ erro: 'Erro ao processar parcela', detalhes: msg }, { status: 500 })
  } finally {
    client.release()
  }
}
