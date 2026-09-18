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

// Achata as regras num objeto legivel pro log ("TIPO" -> "35%" / "0% + valor fixo R$ 100.00"),
// pra tela de auditoria destacar exatamente o que mudou (tipo ausente = profissional nao realiza).
function resumoRegras(
  linhas: { tipo_id: number; descricao: string; percentual: number; valor_fixo: number | null }[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const l of linhas) {
    const chave = l.descricao in out ? `${l.descricao} #${l.tipo_id}` : l.descricao
    out[chave] = l.valor_fixo != null
      ? `${l.percentual}% + valor fixo R$ ${l.valor_fixo.toFixed(2)}`
      : `${l.percentual}%`
  }
  return out
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
            ptp.percentual_profissional, ptp.valor_fixo
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
//   valor_fixo (R$) so vale com percentual = 0: o profissional recebe esse valor por atendimento
//   e a clinica fica com o restante. Com percentual > 0 e gravado NULL.
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
    const lista: { tipo_id: unknown; percentual: unknown; valor_fixo?: unknown }[] = Array.isArray(body?.percentuais) ? body.percentuais : []

    // tipos validos da empresa
    const { rows: tiposRows } = await client.query(
      `SELECT id FROM tab_agendamento_tipo WHERE empresa_id = $1`,
      [empresaId],
    )
    const tiposValidos = new Set<number>(tiposRows.map(r => r.id))

    // Conjunto de tipos que o profissional realiza (apos este save)
    const habilitados = new Map<number, { pct: number; valorFixo: number | null }>()
    for (const item of lista) {
      const tipoId = Number(item.tipo_id)
      if (!tiposValidos.has(tipoId)) continue
      const raw = item.percentual
      const pctNum = raw === null || raw === undefined || raw === '' ? 100 : Number(raw as string | number)
      const pct = Number.isNaN(pctNum) ? 100 : Math.min(Math.max(pctNum, 0), 100)

      // Valor fixo so existe com percentual 0; vazio/invalido/negativo = sem valor fixo
      let valorFixo: number | null = null
      const rawFixo = item.valor_fixo
      if (pct === 0 && rawFixo !== null && rawFixo !== undefined && rawFixo !== '') {
        const v = Number(rawFixo as string | number)
        if (Number.isFinite(v) && v >= 0) valorFixo = Math.round(Math.min(v, 9_999_999_999_999) * 100) / 100
      }
      habilitados.set(tipoId, { pct, valorFixo })
    }

    const profissionalId = Number(params.id)

    await client.query('BEGIN')

    // Foto antes (travando as linhas) e depois, pra auditoria: % e valor fixo definem quanto o
    // profissional recebe, entao quem mudou e de quanto pra quanto precisa ficar registrado.
    const SQL_ESTADO = `SELECT ptp.tipo_id, t.descricao,
                               ptp.percentual_profissional::float8 AS percentual, ptp.valor_fixo::float8 AS valor_fixo
                          FROM tab_profissional_tipo_percentual ptp
                          JOIN tab_agendamento_tipo t ON t.id = ptp.tipo_id
                         WHERE ptp.profissional_id = $1 ORDER BY ptp.tipo_id`
    const { rows: antes } = await client.query(`${SQL_ESTADO} FOR UPDATE OF ptp`, [profissionalId])

    // Remove os tipos que nao estao mais na lista
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

    // Um unico INSERT pro conjunto todo (eram N idas ao banco, uma por tipo)
    if (habilitados.size > 0) {
      const entradas = [...habilitados.entries()]
      await client.query(
        `INSERT INTO tab_profissional_tipo_percentual (empresa_id, profissional_id, tipo_id, percentual_profissional, valor_fixo)
         SELECT $1::int, $2::int, v.tipo_id, v.pct, v.valor_fixo
           FROM unnest($3::int[], $4::numeric[], $5::numeric[]) AS v(tipo_id, pct, valor_fixo)
         ON CONFLICT (profissional_id, tipo_id)
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
