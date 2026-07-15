import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/financeiro/cartao/faturas/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT f.id, f.empresa_id,
            f.conta_banco_id, cb.mnemonico AS conta_banco_desc,
            f.adquirente, TO_CHAR(f.data_prevista, 'YYYY-MM-DD') AS data_prevista,
            f.valor_previsto, f.valor_cobrado, f.qtd_parcelas, f.status,
            f.movimento_banco_id, TO_CHAR(f.data_confirmacao, 'YYYY-MM-DD') AS data_confirmacao,
            f.observacao, f.created_by, f.created_at,
            COALESCE((
              SELECT json_agg(
                       json_build_object(
                         'id', p.id,
                         'venda_cartao_id', p.venda_cartao_id,
                         'numero_parcela', p.numero_parcela,
                         'valor', p.valor,
                         'valor_liquido', p.valor_liquido,
                         'data_venda', TO_CHAR(v.data_venda, 'YYYY-MM-DD'),
                         'data_prevista', TO_CHAR(p.data_prevista, 'YYYY-MM-DD'),
                         'nsu', v.nsu
                       ) ORDER BY p.venda_cartao_id, p.numero_parcela
                     )
              FROM tab_venda_cartao_parcela p
              JOIN tab_venda_cartao v ON v.id = p.venda_cartao_id
              WHERE p.fatura_cartao_id = f.id
            ), '[]') AS parcelas
     FROM tab_fatura_cartao f
     JOIN tab_conta_banco cb ON cb.id = f.conta_banco_id
     WHERE f.id = $1 AND f.empresa_id = $2`,
    [params.id, session.empresa_id_ativa],
  )

  if (!rows.length) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}
