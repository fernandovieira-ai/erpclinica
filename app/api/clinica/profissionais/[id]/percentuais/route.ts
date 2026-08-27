import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

type Params = { params: { id: string } }
type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

async function validarProfissional(db: Queryable, id: string, empresaId: number) {
  const { rows } = await db.query(
    `SELECT id FROM tab_pessoa WHERE id = $1 AND empresa_id = $2 AND ind_profissional = true`,
    [id, empresaId],
  )
  return rows.length > 0
}

// GET /api/clinica/profissionais/[id]/percentuais
// Lista todos os tipos de atendimento da empresa + o % configurado pra este
// profissional (null = nao configurado, usa 100% por padrao).
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  if (!(await validarProfissional(db as unknown as Queryable, params.id, session.empresa_id_ativa))) {
    return NextResponse.json({ erro: 'Profissional não encontrado' }, { status: 404 })
  }

  const { rows } = await db.query(
    `SELECT t.id AS tipo_id, t.descricao, t.ativo,
            ptp.percentual_profissional
       FROM tab_agendamento_tipo t
       LEFT JOIN tab_profissional_tipo_percentual ptp
         ON ptp.tipo_id = t.id AND ptp.profissional_id = $1
      WHERE t.empresa_id = $2
      ORDER BY t.ativo DESC, t.descricao`,
    [params.id, session.empresa_id_ativa],
  )

  return NextResponse.json({ dados: rows })
}

// PUT /api/clinica/profissionais/[id]/percentuais
// Body: { percentuais: [{ tipo_id, percentual }] }
//   A lista e o conjunto COMPLETO de tipos que o profissional realiza.
//   Tipo ausente da lista => removido (profissional nao realiza esse tipo).
//   percentual null/vazio => tipo realizado com 100% (padrao).
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const empresaId = session.empresa_id_ativa
  const client    = await getDb(session.database_name).connect()

  try {
    if (!(await validarProfissional(client as unknown as Queryable, params.id, empresaId))) {
      return NextResponse.json({ erro: 'Profissional não encontrado' }, { status: 404 })
    }

    const body = await req.json()
    const lista: { tipo_id: unknown; percentual: unknown }[] = Array.isArray(body?.percentuais) ? body.percentuais : []

    // tipos validos da empresa
    const { rows: tiposRows } = await client.query(
      `SELECT id FROM tab_agendamento_tipo WHERE empresa_id = $1`,
      [empresaId],
    )
    const tiposValidos = new Set<number>(tiposRows.map(r => r.id))

    // Conjunto de tipos que o profissional realiza (apos este save)
    const habilitados = new Map<number, number>()
    for (const item of lista) {
      const tipoId = Number(item.tipo_id)
      if (!tiposValidos.has(tipoId)) continue
      const raw = item.percentual
      const pct = raw === null || raw === undefined || raw === '' ? 100 : Number(raw as string | number)
      habilitados.set(tipoId, Number.isNaN(pct) ? 100 : Math.min(Math.max(pct, 0), 100))
    }

    await client.query('BEGIN')

    // Remove os tipos que nao estao mais na lista
    const idsHabilitados = [...habilitados.keys()]
    if (idsHabilitados.length > 0) {
      await client.query(
        `DELETE FROM tab_profissional_tipo_percentual
          WHERE profissional_id = $1 AND tipo_id <> ALL($2::int[])`,
        [params.id, idsHabilitados],
      )
    } else {
      await client.query(
        `DELETE FROM tab_profissional_tipo_percentual WHERE profissional_id = $1`,
        [params.id],
      )
    }

    for (const [tipoId, pct] of habilitados) {
      await client.query(
        `INSERT INTO tab_profissional_tipo_percentual (empresa_id, profissional_id, tipo_id, percentual_profissional)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (profissional_id, tipo_id)
         DO UPDATE SET percentual_profissional = EXCLUDED.percentual_profissional, updated_at = NOW()`,
        [empresaId, params.id, tipoId, pct],
      )
    }

    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* já finalizada */ }
    const message = err instanceof Error ? err.message : String(err)
    console.error('[percentuais] erro ao salvar:', message)
    return NextResponse.json({ erro: 'Erro ao salvar percentuais' }, { status: 500 })
  } finally {
    client.release()
  }
}
