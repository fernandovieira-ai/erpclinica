import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { gerarFaturasSelecaoSchema } from '@/lib/validators/cartao.schema'

// GET /api/financeiro/cartao/faturas/gerar?data_emissao_inicio=&data_emissao_fim=&data_vencimento_inicio=&data_vencimento_fim=&conta_banco_id=&adquirente=&bandeira=&modalidade=&busca=
// Lista as vendas no cartão pendentes que batem com o filtro, para o
// usuário conferir e escolher quais entram na fatura (não grava nada).
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `SELECT p.id AS parcela_id, v.id AS venda_cartao_id,
            v.conta_banco_id, cb.mnemonico AS conta_banco_desc,
            v.adquirente, v.bandeira, v.modalidade, v.nsu, v.codigo_autorizacao,
            TO_CHAR(v.data_venda, 'YYYY-MM-DD') AS data_venda,
            TO_CHAR(p.data_prevista, 'YYYY-MM-DD') AS data_prevista,
            p.numero_parcela, p.valor, p.valor_liquido
     FROM tab_venda_cartao_parcela p
     JOIN tab_venda_cartao v ON v.id = p.venda_cartao_id
     JOIN tab_conta_banco cb ON cb.id = v.conta_banco_id
     WHERE v.empresa_id = $1
       AND v.status = 'PENDENTE'
       AND p.status = 'PENDENTE'
       AND ($2::date    IS NULL OR p.data_prevista    <= $2)
       AND ($3::date    IS NULL OR p.data_prevista    >= $3)
       AND ($4::date    IS NULL OR v.data_venda::date >= $4)
       AND ($5::date    IS NULL OR v.data_venda::date <= $5)
       AND ($6::int     IS NULL OR v.conta_banco_id    = $6)
       AND ($7::varchar IS NULL OR v.adquirente        = $7)
       AND ($8::varchar IS NULL OR v.bandeira          = $8)
       AND ($9::varchar IS NULL OR v.modalidade        = $9)
       AND ($10::varchar IS NULL OR v.nsu ILIKE '%' || $10 || '%' OR v.codigo_autorizacao ILIKE '%' || $10 || '%')
     ORDER BY p.data_prevista, v.adquirente, v.id, p.numero_parcela
     LIMIT 500`,
    [
      session.empresa_id_ativa,
      sp.get('data_vencimento_fim') || null,
      sp.get('data_vencimento_inicio') || null,
      sp.get('data_emissao_inicio')    || null,
      sp.get('data_emissao_fim')       || null,
      sp.get('conta_banco_id')         || null,
      sp.get('adquirente')             || null,
      sp.get('bandeira')               || null,
      sp.get('modalidade')             || null,
      sp.get('busca')                  || null,
    ],
  )

  const valor_total = rows.reduce((acc, r) => acc + Number(r.valor_liquido), 0)
  return NextResponse.json({ dados: rows, total: rows.length, valor_total })
}

// POST /api/financeiro/cartao/faturas/gerar  — body: { parcela_ids: number[] }
// Agrupa exatamente as parcelas selecionadas (conferidas pelo usuário) em
// faturas por conta+adquirente+data prevista.
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const json = await req.json().catch(() => ({}))
  const body = gerarFaturasSelecaoSchema.safeParse(json)
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const db = getDb(session.database_name)

  try {
    const { rows } = await db.query(
      `SELECT * FROM fn_gerar_faturas_cartao_selecao($1, $2, $3)`,
      [session.empresa_id_ativa, body.data.parcela_ids, session.nome ?? null],
    )
    const { faturas_geradas, valor_total } = rows[0]
    return NextResponse.json({
      faturas_geradas: Number(faturas_geradas),
      valor_total:     Number(valor_total),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar faturas'
    return NextResponse.json({ erro: message }, { status: 400 })
  }
}
