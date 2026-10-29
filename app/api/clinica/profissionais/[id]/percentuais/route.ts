import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { registrarAuditoria } from '@/lib/auditoria'

type Params = { params: { id: string } }
type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }

async function validarProfissional(db: Queryable, id: string, empresaId: number) {
  const { rows } = await db.query(
    `SELECT id FROM tab_pessoa WHERE id = $1 AND empresa_id = $2 AND ind_profissional = true`,
    [id, empresaId],
  )
  return rows.length > 0
}

// Achata as regras (geral + overrides por categoria) num objeto legivel pro log
// ("TIPO" -> "35%" / "TIPO / CATEGORIA" -> "0% + valor fixo R$ 100.00"), pra tela de
// auditoria destacar exatamente o que mudou (tipo ausente = profissional nao realiza).
function resumoRegras(
  linhas: { tipo_id: number; descricao: string; categoria_id: number | null; categoria_descricao: string | null; percentual: number; valor_fixo: number | null }[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const l of linhas) {
    const base = l.categoria_id ? `${l.descricao} / ${l.categoria_descricao}` : l.descricao
    const chave = base in out ? `${base} #${l.tipo_id}${l.categoria_id ? `-${l.categoria_id}` : ''}` : base
    out[chave] = l.valor_fixo != null
      ? `${l.percentual}% + valor fixo R$ ${l.valor_fixo.toFixed(2)}`
      : `${l.percentual}%`
  }
  return out
}

// GET /api/clinica/profissionais/[id]/percentuais
// Lista todos os tipos de atendimento da empresa + a regra geral configurada (categoria_id NULL)
// pra este profissional + os overrides por categoria (quando houver).
// Sem linha geral configurada = nao configurado, usa 100% por padrao.
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)
  if (!(await validarProfissional(db as unknown as Queryable, params.id, session.empresa_id_ativa))) {
    return NextResponse.json({ erro: 'Profissional não encontrado' }, { status: 404 })
  }

  const [{ rows: gerais }, { rows: overrides }] = await Promise.all([
    db.query(
      `SELECT t.id AS tipo_id, t.descricao, t.ativo,
              ptp.percentual_profissional, ptp.valor_fixo
         FROM tab_agendamento_tipo t
         LEFT JOIN tab_profissional_tipo_percentual ptp
           ON ptp.tipo_id = t.id AND ptp.profissional_id = $1 AND ptp.categoria_id IS NULL
        WHERE t.empresa_id = $2
        ORDER BY t.ativo DESC, t.descricao`,
      [params.id, session.empresa_id_ativa],
    ),
    db.query(
      `SELECT ptp.tipo_id, ptp.categoria_id, c.descricao AS categoria_descricao, c.ativo AS categoria_ativa,
              ptp.percentual_profissional, ptp.valor_fixo
         FROM tab_profissional_tipo_percentual ptp
         JOIN tab_categoria c ON c.id = ptp.categoria_id
        WHERE ptp.profissional_id = $1 AND ptp.categoria_id IS NOT NULL
        ORDER BY c.descricao`,
      [params.id],
    ),
  ])

  const overridesPorTipo = new Map<number, typeof overrides>()
  for (const o of overrides) {
    const lista = overridesPorTipo.get(o.tipo_id) ?? []
    lista.push(o)
    overridesPorTipo.set(o.tipo_id, lista)
  }

  const dados = gerais.map(g => ({ ...g, overrides: overridesPorTipo.get(g.tipo_id) ?? [] }))

  return NextResponse.json({ dados })
}

// PUT /api/clinica/profissionais/[id]/percentuais
// Body: { percentuais: [{ tipo_id, percentual, valor_fixo, overrides: [{ categoria_id, percentual, valor_fixo }] }] }
//   A lista e o conjunto COMPLETO de tipos que o profissional realiza.
//   Tipo ausente da lista => removido (profissional nao realiza esse tipo, remove tambem seus overrides).
//   percentual null/vazio => tipo realizado com 100% (padrao).
//   valor_fixo (R$) so vale com percentual = 0: o profissional recebe esse valor por atendimento
//   e a clinica fica com o restante. Com percentual > 0 e gravado NULL.
//   overrides: regra especifica por categoria (convenio) — OPCIONAL, substitui a regra geral do
//   tipo so quando o atendimento tiver aquela categoria. Mesma regra de percentual/valor_fixo.
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
    const lista: {
      tipo_id: unknown; percentual: unknown; valor_fixo?: unknown
      overrides?: { categoria_id: unknown; percentual: unknown; valor_fixo?: unknown }[]
    }[] = Array.isArray(body?.percentuais) ? body.percentuais : []

    // tipos e categorias validos da empresa
    const [{ rows: tiposRows }, { rows: categoriasRows }] = await Promise.all([
      client.query(`SELECT id FROM tab_agendamento_tipo WHERE empresa_id = $1`, [empresaId]),
      client.query(`SELECT id FROM tab_categoria WHERE empresa_id = $1`, [empresaId]),
    ])
    const tiposValidos      = new Set<number>(tiposRows.map(r => r.id))
    const categoriasValidas = new Set<number>(categoriasRows.map(r => r.id))

    function normalizarRegra(raw: unknown, rawFixo: unknown): { pct: number; valorFixo: number | null } {
      const pctNum = raw === null || raw === undefined || raw === '' ? 100 : Number(raw as string | number)
      const pct = Number.isNaN(pctNum) ? 100 : Math.min(Math.max(pctNum, 0), 100)
      let valorFixo: number | null = null
      if (pct === 0 && rawFixo !== null && rawFixo !== undefined && rawFixo !== '') {
        const v = Number(rawFixo as string | number)
        if (Number.isFinite(v) && v >= 0) valorFixo = Math.round(Math.min(v, 9_999_999_999_999) * 100) / 100
      }
      return { pct, valorFixo }
    }

    // Conjunto de tipos que o profissional realiza (apos este save) + seus overrides por categoria
    const habilitados = new Map<number, { pct: number; valorFixo: number | null }>()
    const overridesPorTipo = new Map<number, Map<number, { pct: number; valorFixo: number | null }>>()
    for (const item of lista) {
      const tipoId = Number(item.tipo_id)
      if (!tiposValidos.has(tipoId)) continue
      habilitados.set(tipoId, normalizarRegra(item.percentual, item.valor_fixo))

      const mapaOverride = new Map<number, { pct: number; valorFixo: number | null }>()
      for (const ov of item.overrides ?? []) {
        const categoriaId = Number(ov.categoria_id)
        if (!categoriasValidas.has(categoriaId)) continue
        mapaOverride.set(categoriaId, normalizarRegra(ov.percentual, ov.valor_fixo))
      }
      if (mapaOverride.size > 0) overridesPorTipo.set(tipoId, mapaOverride)
    }

    const profissionalId = Number(params.id)

    await client.query('BEGIN')

    // Foto antes (travando as linhas) e depois, pra auditoria: % e valor fixo definem quanto o
    // profissional recebe, entao quem mudou e de quanto pra quanto precisa ficar registrado.
    const SQL_ESTADO = `SELECT ptp.tipo_id, t.descricao, ptp.categoria_id, c.descricao AS categoria_descricao,
                               ptp.percentual_profissional::float8 AS percentual, ptp.valor_fixo::float8 AS valor_fixo
                          FROM tab_profissional_tipo_percentual ptp
                          JOIN tab_agendamento_tipo t ON t.id = ptp.tipo_id
                          LEFT JOIN tab_categoria c ON c.id = ptp.categoria_id
                         WHERE ptp.profissional_id = $1 ORDER BY ptp.tipo_id, ptp.categoria_id`
    const { rows: antes } = await client.query(`${SQL_ESTADO} FOR UPDATE OF ptp`, [profissionalId])

    // Remove os tipos que nao estao mais na lista (remove tambem seus overrides, sem filtro de categoria)
    const idsHabilitados = [...habilitados.keys()]
    if (idsHabilitados.length > 0) {
      await client.query(
        `DELETE FROM tab_profissional_tipo_percentual
          WHERE profissional_id = $1 AND tipo_id <> ALL($2::int[])`,
        [profissionalId, idsHabilitados],
      )
    } else {
      await client.query(
        `DELETE FROM tab_profissional_tipo_percentual WHERE profissional_id = $1`,
        [profissionalId],
      )
    }

    // Upsert das regras gerais (categoria_id NULL) — um unico INSERT pro conjunto todo
    if (habilitados.size > 0) {
      const entradas = [...habilitados.entries()]
      await client.query(
        `INSERT INTO tab_profissional_tipo_percentual (empresa_id, profissional_id, tipo_id, percentual_profissional, valor_fixo)
         SELECT $1::int, $2::int, v.tipo_id, v.pct, v.valor_fixo
           FROM unnest($3::int[], $4::numeric[], $5::numeric[]) AS v(tipo_id, pct, valor_fixo)
         ON CONFLICT (profissional_id, tipo_id) WHERE categoria_id IS NULL
         DO UPDATE SET percentual_profissional = EXCLUDED.percentual_profissional,
                       valor_fixo              = EXCLUDED.valor_fixo,
                       updated_at = NOW()`,
        [
          empresaId, profissionalId,
          entradas.map(([tipoId]) => tipoId),
          entradas.map(([, v]) => v.pct),
          entradas.map(([, v]) => v.valorFixo),
        ],
      )
    }

    // Overrides por categoria: remove os que sairam da lista, upsert dos atuais
    const chavesOverride: string[] = []
    const tipoIdsOverride: number[] = []
    const categoriaIdsOverride: number[] = []
    const pctsOverride: number[] = []
    const fixosOverride: (number | null)[] = []
    for (const [tipoId, mapaOverride] of overridesPorTipo) {
      for (const [categoriaId, v] of mapaOverride) {
        chavesOverride.push(`${tipoId}:${categoriaId}`)
        tipoIdsOverride.push(tipoId)
        categoriaIdsOverride.push(categoriaId)
        pctsOverride.push(v.pct)
        fixosOverride.push(v.valorFixo)
      }
    }

    if (idsHabilitados.length > 0) {
      await client.query(
        `DELETE FROM tab_profissional_tipo_percentual
          WHERE profissional_id = $1 AND tipo_id = ANY($2::int[]) AND categoria_id IS NOT NULL
            AND (tipo_id::text || ':' || categoria_id::text) <> ALL($3::text[])`,
        [profissionalId, idsHabilitados, chavesOverride],
      )
    }

    if (tipoIdsOverride.length > 0) {
      await client.query(
        `INSERT INTO tab_profissional_tipo_percentual (empresa_id, profissional_id, tipo_id, categoria_id, percentual_profissional, valor_fixo)
         SELECT $1::int, $2::int, v.tipo_id, v.categoria_id, v.pct, v.valor_fixo
           FROM unnest($3::int[], $4::int[], $5::numeric[], $6::numeric[]) AS v(tipo_id, categoria_id, pct, valor_fixo)
         ON CONFLICT (profissional_id, tipo_id, categoria_id) WHERE categoria_id IS NOT NULL
         DO UPDATE SET percentual_profissional = EXCLUDED.percentual_profissional,
                       valor_fixo              = EXCLUDED.valor_fixo,
                       updated_at = NOW()`,
        [empresaId, profissionalId, tipoIdsOverride, categoriaIdsOverride, pctsOverride, fixosOverride],
      )
    }

    const { rows: depois } = await client.query(SQL_ESTADO, [profissionalId])
    await client.query('COMMIT')

    // So registra se algo mudou (salvar sem alterar nada nao gera ruido no log)
    if (JSON.stringify(antes) !== JSON.stringify(depois)) {
      await registrarAuditoria(getDb(session.database_name), session, {
        tabela: 'tab_profissional_tipo_percentual',
        registroId: profissionalId,
        acao: 'UPDATE',
        dadosAntes:  resumoRegras(antes),
        dadosDepois: resumoRegras(depois),
      })
    }

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
