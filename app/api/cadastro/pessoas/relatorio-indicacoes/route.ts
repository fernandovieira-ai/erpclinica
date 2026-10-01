import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/cadastro/pessoas/relatorio-indicacoes?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&busca=
// Agrupa pacientes por quem os indicou (tab_pessoa.indicacao_pessoa_id/indicacao_nome).
// Indicador pode ter cadastro próprio (indicacao_pessoa_id) ou ser só um nome digitado — nesse
// caso agrupa por nome normalizado (upper/trim), já que não há como deduplicar variações de grafia.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const inicio = sp.get('inicio') || ''
  const fim    = sp.get('fim') || ''
  const busca  = sp.get('busca')?.trim() || ''

  if ((inicio && !fim) || (fim && !inicio)) {
    return NextResponse.json({ erro: 'Informe início e fim do período' }, { status: 400 })
  }
  if (inicio && fim && inicio > fim) {
    return NextResponse.json({ erro: 'A data final não pode ser anterior à inicial' }, { status: 400 })
  }

  const db = getDb(session.database_name)
  const temPeriodo = !!(inicio && fim)

  const conds: string[] = [
    'p.ind_paciente = true',
    `(p.indicacao_pessoa_id IS NOT NULL OR NULLIF(TRIM(p.indicacao_nome), '') IS NOT NULL)`,
  ]
  const params: unknown[] = []
  let pi = 1
  if (temPeriodo) {
    conds.push(`p.created_at >= $${pi++}::date`)
    params.push(inicio)
    conds.push(`p.created_at < ($${pi++}::date + INTERVAL '1 day')`)
    params.push(fim)
  }
  if (busca) {
    conds.push(`COALESCE(ip.nome, p.indicacao_nome) ILIKE $${pi++}`)
    params.push(`%${busca}%`)
  }

  try {
    const [{ rows }, { rows: [totais] }, { rows: [empresa] }] = await Promise.all([
      db.query(
        `SELECT
           p.indicacao_pessoa_id                     AS indicador_pessoa_id,
           MAX(COALESCE(ip.nome, p.indicacao_nome))  AS indicador_nome,
           MAX(NULLIF(p.indicacao_fone, ''))         AS indicador_fone,
           MAX(NULLIF(p.indicacao_ligacao, ''))      AS indicador_ligacao,
           COUNT(*)::int                              AS qtd,
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'id', p.id,
               'nome', p.nome,
               'telefone', COALESCE(p.celular, p.telefone),
               'data_cadastro', TO_CHAR(p.created_at, 'YYYY-MM-DD')
             ) ORDER BY p.nome
           )                                          AS pacientes
         FROM tab_pessoa p
         LEFT JOIN tab_pessoa ip ON ip.id = p.indicacao_pessoa_id
         WHERE ${conds.join(' AND ')}
         GROUP BY p.indicacao_pessoa_id, (CASE WHEN p.indicacao_pessoa_id IS NULL THEN UPPER(TRIM(p.indicacao_nome)) END)
         ORDER BY qtd DESC, indicador_nome`,
        params,
      ),
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE p.ind_paciente)                                                                           AS total_pacientes,
           COUNT(*) FILTER (WHERE p.ind_paciente AND (p.indicacao_pessoa_id IS NOT NULL OR NULLIF(TRIM(p.indicacao_nome), '') IS NOT NULL)) AS com_indicacao
         FROM tab_pessoa p
         WHERE p.ind_paciente = true
         ${temPeriodo ? `AND p.created_at >= $1::date AND p.created_at < ($2::date + INTERVAL '1 day')` : ''}`,
        temPeriodo ? [inicio, fim] : [],
      ),
      db.query(
        `SELECT COALESCE(NULLIF(TRIM(nome_fantasia), ''), razao_social) AS nome, logo_base64
           FROM tab_empresa WHERE id = $1`,
        [session.empresa_id_ativa],
      ),
    ])

    const totalPacientes = Number(totais.total_pacientes)
    const comIndicacao   = Number(totais.com_indicacao)

    return NextResponse.json({
      inicio, fim,
      resumo: {
        total_pacientes:   totalPacientes,
        com_indicacao:     comIndicacao,
        sem_indicacao:     totalPacientes - comIndicacao,
        total_indicadores: rows.length,
      },
      indicadores:  rows,
      empresa_nome: (empresa?.nome as string | undefined) ?? '',
      empresa_logo: (empresa?.logo_base64 as string | null | undefined) ?? null,
      emitido_por:  session.nome ?? '',
    })
  } catch (err) {
    console.error('[GET /api/cadastro/pessoas/relatorio-indicacoes]', err)
    return NextResponse.json({ erro: 'Erro ao gerar o relatório' }, { status: 500 })
  }
}
