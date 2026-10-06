import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/financeiro/despesas/relatorio-tipo?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&busca=
// Agrupa despesas em 2 níveis pelo plano de contas (tab_tipo_despesa): sintético (pai_id IS NULL)
// -> analítico (pai_id = sintético) -> lançamentos. Período obrigatório em par (início+fim).
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

  const conds: string[] = ['d.empresa_id = $1', `d.status <> 'C'`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2
  if (temPeriodo) {
    conds.push(`d.data_despesa >= $${pi++}::date`)
    params.push(inicio)
    conds.push(`d.data_despesa < ($${pi++}::date + INTERVAL '1 day')`)
    params.push(fim)
  }
  if (busca) {
    conds.push(`(p.nome ILIKE $${pi} OR d.documento ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  try {
    const [{ rows }, { rows: [empresa] }] = await Promise.all([
      db.query(
        `SELECT
           d.id, d.data_despesa, d.documento, d.valor, d.status, d.observacao,
           p.nome AS pessoa_nome,
           td.id AS analitico_id, td.codigo AS analitico_codigo, td.descricao AS analitico_descricao,
           COALESCE(tp.id, td.id)             AS sintetico_id,
           COALESCE(tp.codigo, td.codigo)     AS sintetico_codigo,
           COALESCE(tp.descricao, td.descricao) AS sintetico_descricao
         FROM tab_despesa d
         JOIN tab_tipo_despesa td ON td.id = d.tipo_despesa_id
         LEFT JOIN tab_tipo_despesa tp ON tp.id = td.pai_id AND tp.empresa_id = d.empresa_id
         LEFT JOIN tab_pessoa p ON p.id = d.pessoa_id
         WHERE ${conds.join(' AND ')}
         ORDER BY COALESCE(tp.codigo, td.codigo), td.codigo, d.data_despesa, d.id`,
        params,
      ),
      db.query(
        `SELECT COALESCE(NULLIF(TRIM(nome_fantasia), ''), razao_social) AS nome, logo_base64
           FROM tab_empresa WHERE id = $1`,
        [session.empresa_id_ativa],
      ),
    ])

    // Agrupa em memória: sintético -> analítico -> itens
    interface Item {
      id: number; data_despesa: string; documento: string | null
      valor: number; status: string; observacao: string | null; pessoa_nome: string | null
    }
    interface Analitico { id: number; codigo: string; descricao: string; itens: Item[] }
    interface Sintetico { id: number; codigo: string; descricao: string; analiticos: Map<number, Analitico> }

    const sinteticos = new Map<number, Sintetico>()
    for (const r of rows) {
      let sint = sinteticos.get(r.sintetico_id)
      if (!sint) {
        sint = { id: r.sintetico_id, codigo: r.sintetico_codigo, descricao: r.sintetico_descricao, analiticos: new Map() }
        sinteticos.set(r.sintetico_id, sint)
      }
      let anal = sint.analiticos.get(r.analitico_id)
      if (!anal) {
        anal = { id: r.analitico_id, codigo: r.analitico_codigo, descricao: r.analitico_descricao, itens: [] }
        sint.analiticos.set(r.analitico_id, anal)
      }
      anal.itens.push({
        id: r.id,
        data_despesa: r.data_despesa instanceof Date ? r.data_despesa.toISOString().slice(0, 10) : String(r.data_despesa).slice(0, 10),
        documento: r.documento,
        valor: Number(r.valor),
        status: r.status,
        observacao: r.observacao,
        pessoa_nome: r.pessoa_nome,
      })
    }

    const grupos = [...sinteticos.values()]
      .sort((a, b) => a.codigo.localeCompare(b.codigo))
      .map((s) => {
        const analiticos = [...s.analiticos.values()]
          .sort((a, b) => a.codigo.localeCompare(b.codigo))
          .map((a) => ({
            ...a,
            qtd: a.itens.length,
            total: a.itens.reduce((acc, i) => acc + i.valor, 0),
          }))
        return {
          id: s.id,
          codigo: s.codigo,
          descricao: s.descricao,
          analiticos,
          qtd: analiticos.reduce((acc, a) => acc + a.qtd, 0),
          total: analiticos.reduce((acc, a) => acc + a.total, 0),
        }
      })

    const qtdTotal   = grupos.reduce((acc, g) => acc + g.qtd, 0)
    const valorTotal = grupos.reduce((acc, g) => acc + g.total, 0)

    return NextResponse.json({
      inicio, fim,
      resumo: {
        qtd_despesas:        qtdTotal,
        valor_total:         valorTotal,
        qtd_tipos_sinteticos: grupos.length,
        qtd_tipos_analiticos: grupos.reduce((acc, g) => acc + g.analiticos.length, 0),
      },
      grupos,
      empresa_nome: (empresa?.nome as string | undefined) ?? '',
      empresa_logo: (empresa?.logo_base64 as string | null | undefined) ?? null,
      emitido_por:  session.nome ?? '',
    })
  } catch (err) {
    console.error('[GET /api/financeiro/despesas/relatorio-tipo]', err)
    return NextResponse.json({ erro: 'Erro ao gerar o relatório' }, { status: 500 })
  }
}
