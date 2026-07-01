import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { z } from 'zod'

type Params = { params: { id: string } }

// Schema de validação para salvar valores
const putSchema = z.object({
  valores: z.array(
    z.object({
      categoria_id: z.number().int().positive(),
      valor:        z.number().nonnegative(),
      valor_prazo:  z.number().nonnegative().optional().default(0),
    }),
  ),
})

// GET — lista todas as categorias ativas com o valor definido para este tipo
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const tipoId = parseInt(params.id, 10)
  if (isNaN(tipoId)) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 })

  const db = getDb(session.database_name)

  // Verifica se o tipo pertence à empresa
  const { rows: tipo } = await db.query(
    `SELECT id FROM tab_agendamento_tipo WHERE id = $1 AND empresa_id = $2`,
    [tipoId, session.empresa_id_ativa],
  )
  if (!tipo[0]) return NextResponse.json({ erro: 'Tipo não encontrado' }, { status: 404 })

  const { rows } = await db.query(
    `SELECT
       c.id   AS categoria_id,
       c.descricao,
       v.valor,
       v.valor_prazo
     FROM tab_categoria c
     LEFT JOIN tab_agendamento_tipo_categoria v
            ON v.categoria_id = c.id AND v.tipo_id = $1
     WHERE c.empresa_id = $2 AND c.ativo = true
     ORDER BY c.descricao`,
    [tipoId, session.empresa_id_ativa],
  )

  return NextResponse.json(rows)
}

// PUT — salva (upsert) os valores por categoria para este tipo
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const tipoId = parseInt(params.id, 10)
  if (isNaN(tipoId)) return NextResponse.json({ erro: 'ID inválido' }, { status: 400 })

  const body = putSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ erro: body.error.flatten() }, { status: 400 })

  const db = getDb(session.database_name)

  // Verifica se o tipo pertence à empresa
  const { rows: tipo } = await db.query(
    `SELECT id FROM tab_agendamento_tipo WHERE id = $1 AND empresa_id = $2`,
    [tipoId, session.empresa_id_ativa],
  )
  if (!tipo[0]) return NextResponse.json({ erro: 'Tipo não encontrado' }, { status: 404 })

  const { valores } = body.data

  await db.query('BEGIN')
  try {
    // Remove vínculos que não foram enviados (limpeza de zeros/removidos)
    await db.query(
      `DELETE FROM tab_agendamento_tipo_categoria WHERE tipo_id = $1`,
      [tipoId],
    )

    // Insere apenas os que têm ao menos um valor > 0
    for (const v of valores) {
      if (v.valor > 0 || (v.valor_prazo ?? 0) > 0) {
        await db.query(
          `INSERT INTO tab_agendamento_tipo_categoria (empresa_id, tipo_id, categoria_id, valor, valor_prazo)
           VALUES ($1, $2, $3, $4, $5)`,
          [session.empresa_id_ativa, tipoId, v.categoria_id, v.valor, v.valor_prazo ?? null],
        )
      }
    }

    await db.query('COMMIT')
  } catch (err) {
    await db.query('ROLLBACK')
    console.error('Erro ao salvar valores por categoria:', err)
    return NextResponse.json({ erro: 'Erro interno ao salvar' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
