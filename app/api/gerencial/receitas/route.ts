import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/gerencial/receitas?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&busca=
// Lançamento a lançamento (1 linha por recebimento pago), no formato do relatório gerencial de receita
// (planilha "RECEITA" do cliente): paciente, procedimento, médico executante/solicitante, forma de
// pagamento, taxa de cartão e repasse profissional x clínica — tudo já calculado no momento do
// recebimento (tab_recebimento_consulta.valor_profissional/valor_clinica), não recalculado aqui.
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

  const conds: string[] = ['rc.empresa_id = $1', `rc.status_recebimento = 'PAGO'`]
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2
  if (temPeriodo) {
    conds.push(`rc.data_recebimento >= $${pi++}::date`)
    params.push(inicio)
    conds.push(`rc.data_recebimento < ($${pi++}::date + INTERVAL '1 day')`)
    params.push(fim)
  }
  if (busca) {
    conds.push(`(pac.nome ILIKE $${pi} OR tp.descricao ILIKE $${pi})`)
    params.push(`%${busca}%`)
    pi++
  }

  try {
    const [{ rows }, { rows: [empresa] }] = await Promise.all([
      db.query(
        `SELECT
           rc.id, rc.data_recebimento, rc.total_recebimento,
           pac.nome AS paciente_nome,
           exec.nome AS executante_nome,
           sol.nome AS solicitante_nome,
           tp.descricao AS procedimento,
           cp.descricao AS forma_pagamento, cp.tipo_pagamento,
           vc.qtd_parcelas, vc.percentual_mdr_aplicado,
           rc.percentual_profissional, rc.valor_profissional, rc.valor_clinica
         FROM tab_recebimento_consulta rc
         JOIN tab_agendamento a ON a.id = rc.agendamento_id
         LEFT JOIN tab_pessoa pac  ON pac.id = rc.paciente_id
         LEFT JOIN tab_pessoa exec ON exec.id = a.profissional_id
         LEFT JOIN tab_pessoa sol  ON sol.id = a.medico_solicitante_id
         LEFT JOIN tab_agendamento_tipo tp ON tp.id = a.tipo_id
         LEFT JOIN tab_condicao_pagamento cp ON cp.id = rc.condicao_pagamento_id
         LEFT JOIN tab_venda_cartao vc ON vc.id = rc.venda_cartao_id
         WHERE ${conds.join(' AND ')}
         ORDER BY rc.data_recebimento, rc.id`,
        params,
      ),
      db.query(
        `SELECT COALESCE(NULLIF(TRIM(nome_fantasia), ''), razao_social) AS nome, logo_base64
           FROM tab_empresa WHERE id = $1`,
        [session.empresa_id_ativa],
      ),
    ])

    const itens = rows.map((r) => {
      const valorBruto   = Number(r.total_recebimento)
      const percentualMdr = r.percentual_mdr_aplicado != null ? Number(r.percentual_mdr_aplicado) : 0
      // Taxa rateada pelo valor do próprio item, não pelo valor total da venda de cartão
      // (vc.valor_bruto) — um recebimento em lote (N atendimentos pagos numa única tacada de
      // cartão) compartilha o mesmo venda_cartao_id entre as N linhas de tab_recebimento_consulta,
      // então usar vc.valor_bruto como base repetia a taxa cheia da venda em cada linha.
      const valorTaxa    = percentualMdr > 0 ? Math.round(valorBruto * (percentualMdr / 100) * 100) / 100 : 0
      const valorLiquido = Math.round((valorBruto - valorTaxa) * 100) / 100
      return {
        id: r.id,
        data_recebimento: r.data_recebimento instanceof Date ? r.data_recebimento.toISOString().slice(0, 10) : String(r.data_recebimento).slice(0, 10),
        paciente_nome: r.paciente_nome,
        executante_nome: r.executante_nome,
        solicitante_nome: r.solicitante_nome,
        procedimento: r.procedimento,
        forma_pagamento: r.forma_pagamento,
        tipo_pagamento: r.tipo_pagamento,
        qtd_parcelas: r.qtd_parcelas,
        percentual_taxa: percentualMdr,
        valor_taxa: valorTaxa,
        valor_bruto: valorBruto,
        valor_liquido: valorLiquido,
        percentual_profissional: Number(r.percentual_profissional ?? 0),
        valor_profissional: Number(r.valor_profissional ?? 0),
        valor_clinica: Number(r.valor_clinica ?? 0),
      }
    })

    // Resumo por forma de pagamento (bloco "por forma" da planilha de origem)
    const porForma = new Map<string, { forma_pagamento: string; qtd: number; valor_bruto: number }>()
    for (const i of itens) {
      const chave = i.forma_pagamento ?? '—'
      const atual = porForma.get(chave) ?? { forma_pagamento: chave, qtd: 0, valor_bruto: 0 }
      atual.qtd += 1
      atual.valor_bruto += i.valor_bruto
      porForma.set(chave, atual)
    }

    const resumo = {
      qtd_atendimentos:   itens.length,
      valor_bruto:        itens.reduce((acc, i) => acc + i.valor_bruto, 0),
      valor_taxas:        itens.reduce((acc, i) => acc + i.valor_taxa, 0),
      valor_liquido:      itens.reduce((acc, i) => acc + i.valor_liquido, 0),
      valor_profissional: itens.reduce((acc, i) => acc + i.valor_profissional, 0),
      valor_clinica:      itens.reduce((acc, i) => acc + i.valor_clinica, 0),
    }

    return NextResponse.json({
      inicio, fim,
      resumo,
      itens,
      por_forma: [...porForma.values()].sort((a, b) => b.valor_bruto - a.valor_bruto),
      empresa_nome: (empresa?.nome as string | undefined) ?? '',
      empresa_logo: (empresa?.logo_base64 as string | null | undefined) ?? null,
      emitido_por:  session.nome ?? '',
    })
  } catch (err) {
    console.error('[GET /api/gerencial/receitas]', err)
    return NextResponse.json({ erro: 'Erro ao gerar o relatório' }, { status: 500 })
  }
}
