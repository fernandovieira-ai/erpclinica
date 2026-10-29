import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import type { DreBloco, DreLinha, DreLinhaResultado, DreResponse } from '@/types/cadastros.types'

// GET /api/gerencial/dre?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
//
// DRE gerencial consolidado do período (v1: total único, sem quebra
// mensal — ver padroes.md). Receita Bruta = valor cheio do atendimento
// (sem abater repasse médico). Por pedido do usuário (2026-10-28),
// "(CSV) Custos" por enquanto só traz o que está lançado de fato em
// tab_despesa — o repasse médico (tab_recebimento_consulta.valor_profissional)
// NÃO entra ainda, mesmo sendo custo na planilha de referência do
// cliente (ver padroes.md §61). Agrupamento de despesas usa a hierarquia
// já existente em tab_tipo_despesa (pai_id): cada "sintético" de topo
// mapeia pra um bloco do DRE (ver BLOCO_POR_CODIGO). Investimento/CAPEX
// (código '5', ind_capex) fica fora do DRE.
//
// As fontes (receita por tipo de atendimento, despesas por tipo) já são
// agregadas em SQL (GROUP BY), não linha a linha — o resultado
// trafegado é O(categorias), não O(lançamentos).

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DIAS = 5 * 366 // até ~5 anos de período

const BLOCO_POR_CODIGO: Record<string, DreBloco['chave'] | 'capex'> = {
  '1': 'custos',       // (CSV) Custos
  '2': 'opex',         // (SG&A) Despesas
  '3': 'opex',         // Folha de Pagamento
  '4': 'comercial',    // Investimento MKT
  '5': 'capex',        // Investimento (CAPEX) — fora do DRE
  '6': 'financeiras',  // Despesas Financeiras
  '7': 'comercial',    // Despesas Comerciais
  '8': 'opex',         // Despesas Administrativa
  '9': 'imposto',      // Imposto - DAS
}

const TITULO_BLOCO: Record<DreBloco['chave'], string> = {
  receita:     'Receita Bruta',
  imposto:     'Impostos sobre Receita',
  custos:      '(CSV) Custos',
  opex:        'Despesas Operacionais',
  comercial:   'Despesas Comerciais e Marketing',
  financeiras: 'Despesas Financeiras',
}

function construirLinhas(
  registros: { nome: string; valor: number }[],
  sinal: 1 | -1,
): DreLinha[] {
  const porNome = new Map<string, number>()
  for (const r of registros) porNome.set(r.nome, (porNome.get(r.nome) ?? 0) + sinal * Number(r.valor))
  return [...porNome.entries()]
    .map(([descricao, valor]) => ({ descricao, valor }))
    .sort((a, b) => b.valor - a.valor || a.descricao.localeCompare(b.descricao))
}

function somarLinhas(linhas: DreLinha[]): number {
  return linhas.reduce((s, l) => s + l.valor, 0)
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const inicio = sp.get('inicio') || ''
  const fim    = sp.get('fim') || ''

  if (!DATA_RE.test(inicio) || !DATA_RE.test(fim)) {
    return NextResponse.json({ erro: 'Informe início e fim do período (YYYY-MM-DD)' }, { status: 400 })
  }
  if (inicio > fim) {
    return NextResponse.json({ erro: 'A data final não pode ser anterior à inicial' }, { status: 400 })
  }
  const dias = (new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000
  if (dias > MAX_DIAS) {
    return NextResponse.json({ erro: 'Período muito longo' }, { status: 400 })
  }

  const empresaId = session.empresa_id_ativa
  const db        = getDb(session.database_name)

  try {
    const [
      { rows: receitaRows },
      { rows: despesaRows },
      { rows: [empresa] },
    ] = await Promise.all([
      db.query(
        `SELECT at.descricao AS nome, SUM(rc.total_recebimento) AS valor
           FROM tab_recebimento_consulta rc
           JOIN tab_agendamento a      ON a.id  = rc.agendamento_id
           JOIN tab_agendamento_tipo at ON at.id = a.tipo_id
          WHERE rc.empresa_id = $1
            AND rc.data_recebimento >= $2::date AND rc.data_recebimento <= $3::date
          GROUP BY at.descricao`,
        [empresaId, inicio, fim],
      ),
      db.query(
        `SELECT COALESCE(tp.codigo, td.codigo) AS bloco_codigo, td.descricao AS nome, SUM(d.valor) AS valor
           FROM tab_despesa d
           JOIN tab_tipo_despesa td      ON td.id = d.tipo_despesa_id
           LEFT JOIN tab_tipo_despesa tp ON tp.id = td.pai_id
          WHERE d.empresa_id = $1
            AND d.status <> 'C'
            AND d.data_despesa >= $2::date AND d.data_despesa <= $3::date
          GROUP BY COALESCE(tp.codigo, td.codigo), td.descricao`,
        [empresaId, inicio, fim],
      ),
      db.query(
        `SELECT COALESCE(NULLIF(TRIM(nome_fantasia), ''), razao_social) AS nome
           FROM tab_empresa WHERE id = $1`,
        [empresaId],
      ),
    ])

    const despesasPorBloco: Record<string, { nome: string; valor: number }[]> = {
      custos: [], opex: [], comercial: [], financeiras: [], imposto: [],
    }
    for (const r of despesaRows as { bloco_codigo: string; nome: string; valor: string }[]) {
      const bloco = BLOCO_POR_CODIGO[r.bloco_codigo]
      if (!bloco || bloco === 'capex') continue // CAPEX fica fora do DRE
      despesasPorBloco[bloco].push({ nome: r.nome, valor: Number(r.valor) })
    }

    const linhasReceita = construirLinhas(receitaRows as any, 1)
    const linhasImposto = construirLinhas(despesasPorBloco.imposto, -1)
    const linhasCustos  = construirLinhas(despesasPorBloco.custos, -1)
    const linhasOpex        = construirLinhas(despesasPorBloco.opex, -1)
    const linhasComercial   = construirLinhas(despesasPorBloco.comercial, -1)
    const linhasFinanceiras = construirLinhas(despesasPorBloco.financeiras, -1)

    function bloco(chave: DreBloco['chave'], linhas: DreLinha[]): DreBloco {
      return { chave, titulo: TITULO_BLOCO[chave], linhas, subtotal: somarLinhas(linhas) }
    }

    const blocoReceita     = bloco('receita', linhasReceita)
    const blocoImposto     = bloco('imposto', linhasImposto)
    const blocoCustos      = bloco('custos', linhasCustos)
    const blocoOpex        = bloco('opex', linhasOpex)
    const blocoComercial   = bloco('comercial', linhasComercial)
    const blocoFinanceiras = bloco('financeiras', linhasFinanceiras)

    const receitaBruta   = blocoReceita.subtotal
    const receitaLiquida = receitaBruta + blocoImposto.subtotal
    const lucroBruto     = receitaLiquida + blocoCustos.subtotal
    const ebitda         = lucroBruto + blocoOpex.subtotal + blocoComercial.subtotal
    const lucroLiquido   = ebitda + blocoFinanceiras.subtotal

    const margem = (v: number) => (receitaBruta ? v / receitaBruta : null)

    const resultado: DreLinhaResultado[] = [
      { chave: 'receita_bruta',   descricao: 'Receita Bruta',   valor: receitaBruta },
      { chave: 'receita_liquida', descricao: 'Receita Líquida', valor: receitaLiquida },
      { chave: 'lucro_bruto',     descricao: 'Lucro Bruto',     valor: lucroBruto,   margem: margem(lucroBruto) },
      { chave: 'ebitda',          descricao: 'EBITDA',          valor: ebitda,       margem: margem(ebitda) },
      { chave: 'lucro_liquido',   descricao: 'Lucro Líquido',   valor: lucroLiquido, margem: margem(lucroLiquido) },
    ]

    const resposta: DreResponse = {
      inicio, fim,
      blocos: [blocoReceita, blocoImposto, blocoCustos, blocoOpex, blocoComercial, blocoFinanceiras],
      resultado,
      empresa_nome: (empresa?.nome as string | undefined) ?? '',
    }

    return NextResponse.json(resposta)
  } catch (err) {
    console.error('[GET /api/gerencial/dre]', err)
    return NextResponse.json({ erro: 'Erro ao gerar o DRE' }, { status: 500 })
  }
}
