import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'

const replicarSchema = z.object({
  data_despesa: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
  valor:        z.number({ invalid_type_error: 'Valor inválido' }).positive('Valor deve ser maior que zero'),
  documento:    z.string().max(50).optional().nullable(),
  observacao:   z.string().max(5000).optional().nullable(),
})

// POST /api/financeiro/despesas/[id]/replicar
// Duplica uma despesa de pagamento imediato (destino Caixa ou Banco) pra outra data.
// A réplica já nasce Aprovada — gera o movimento de caixa/banco na hora, igual a um
// lançamento manual aprovado direto. (Não há fluxo de aprovação separado ainda; quando
// houver, reavaliar se a réplica deve nascer Pendente por padrão.)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const raw  = await req.json()
  const body = replicarSchema.safeParse(raw)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const r  = body.data
  const up = (v?: string | null) => (v ? v.toUpperCase() : null)
  const db = getDb(session.database_name)

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const { rows: origRows } = await client.query(
      `SELECT * FROM tab_despesa WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
      [params.id, session.empresa_id_ativa],
    )
    if (!origRows.length) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Despesa não encontrada' }, { status: 404 })
    }
    const orig = origRows[0]

    if (orig.status === 'C') {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Não é possível replicar uma despesa cancelada.' }, { status: 400 })
    }

    if (orig.destino !== 'B' && orig.destino !== 'C') {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Só é possível replicar despesas com pagamento em Caixa ou Banco.' }, { status: 400 })
    }

    // Mesma trava de POST/PATCH: tipo de despesa pode ter virado um grupo sintético
    // (ganhou filhos) depois que a despesa original foi criada — ou pode ter sido
    // excluído do cadastro, caso em que tdRows vem vazio.
    const { rows: tdRows } = await client.query(
      `SELECT td.natureza, EXISTS(SELECT 1 FROM tab_tipo_despesa f WHERE f.pai_id = td.id AND f.empresa_id = td.empresa_id) AS tem_filhos
       FROM tab_tipo_despesa td WHERE td.id=$1 AND td.empresa_id=$2`,
      [orig.tipo_despesa_id, session.empresa_id_ativa],
    )
    if (!tdRows.length) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'O tipo de despesa desta despesa não existe mais no cadastro — não é possível replicar.' }, { status: 400 })
    }
    if (tdRows[0].tem_filhos) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'O tipo de despesa desta despesa virou um grupo sintético (agrupador) — ajuste o tipo de despesa antes de replicar.' }, { status: 400 })
    }

    // Rateio da despesa original — usado pra copiar na réplica e, se o tipo for
    // Administrativa, pra validar que há pelo menos um rateio (mesma trava de POST/PATCH).
    const { rows: rateiosOrig } = await client.query(
      `SELECT centro_custo_id, percentual FROM tab_despesa_rateio WHERE despesa_id = $1 ORDER BY id`,
      [orig.id],
    )
    if (tdRows[0].natureza === 'A' && rateiosOrig.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ erro: 'Tipo de despesa Administrativa requer pelo menos um rateio de centro de custo — a despesa original não tem rateio cadastrado.' }, { status: 400 })
    }

    // Recalcula o rateio proporcionalmente ao novo valor (percentual preservado) antes
    // de gravar qualquer coisa — a última linha absorve a diferença de arredondamento;
    // se isso jogar o valor pra negativo (percentuais da origem somando mais que 100%,
    // dado corrompido), aborta com 400 em vez de gravar um rateio negativo.
    const novosRateios: Array<{ centro_custo_id: number; percentual: number; valor: number }> = []
    if (rateiosOrig.length) {
      let acumulado = 0
      for (let i = 0; i < rateiosOrig.length; i++) {
        const ehUltimo = i === rateiosOrig.length - 1
        const valorRateio = ehUltimo
          ? Math.round((r.valor - acumulado) * 100) / 100
          : Math.round(r.valor * (Number(rateiosOrig[i].percentual) / 100) * 100) / 100
        if (valorRateio < 0) {
          await client.query('ROLLBACK')
          return NextResponse.json({ erro: 'Rateio da despesa original inconsistente (percentuais somam mais que 100%) — não é possível replicar.' }, { status: 400 })
        }
        acumulado += valorRateio
        novosRateios.push({ centro_custo_id: rateiosOrig[i].centro_custo_id, percentual: rateiosOrig[i].percentual, valor: valorRateio })
      }
    }

    const { rows } = await client.query(
      `INSERT INTO tab_despesa
         (empresa_id, pessoa_id, tipo_despesa_id, cod_tipo_cobranca, centro_custo_id,
          conta_banco_id, ind_avista, destino,
          data_despesa, data_competencia, data_pagamento, documento,
          valor, num_parcelas, intervalo_dias, status, observacao, created_by, despesa_origem_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$9,$10,$11,1,$12,'A',$13,$14,$15)
       RETURNING *`,
      [
        session.empresa_id_ativa,
        orig.pessoa_id,
        orig.tipo_despesa_id,
        orig.cod_tipo_cobranca,
        orig.centro_custo_id,
        orig.conta_banco_id,
        orig.ind_avista,
        orig.destino,
        r.data_despesa,
        up(r.documento),
        r.valor,
        orig.intervalo_dias,
        r.observacao ?? null,
        session.nome ?? null,
        orig.id,
      ],
    )
    const novaId = rows[0].id

    // Copia o rateio de centro de custo já recalculado/validado acima.
    for (const nr of novosRateios) {
      await client.query(
        `INSERT INTO tab_despesa_rateio (despesa_id, centro_custo_id, percentual, valor) VALUES ($1,$2,$3,$4)`,
        [novaId, nr.centro_custo_id, nr.percentual, nr.valor],
      )
    }

    await client.query('COMMIT')

    // Pós-commit, melhor esforço: reconsulta a linha (o INSERT com RETURNING * captura o
    // estado antes do trigger AFTER INSERT preencher movimento_caixa_id/banco_id) só pra
    // deixar o log de auditoria completo. Tem try/catch próprio e nunca derruba a resposta
    // — a despesa já foi criada e commitada; se isso falhar (pool, rede), o cliente não
    // pode ver um erro e tentar de novo, duplicando a réplica.
    try {
      const { rows: finalRows } = await db.query(`SELECT * FROM tab_despesa WHERE id = $1`, [novaId])
      await registrarAuditoria(db, session, {
        tabela: 'tab_despesa',
        registroId: novaId,
        acao: 'INSERT',
        dadosDepois: finalRows[0] ?? rows[0],
      })
    } catch (auditErr) {
      console.error('[replicar] despesa criada, mas falhou ao registrar auditoria:', auditErr)
    }

    return NextResponse.json({ id: novaId }, { status: 201 })
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
