import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { autenticarTokenGohighlevel } from '@/lib/integracoes/gohighlevel-auth'
import { calcularValoresRecebimento } from '@/lib/clinica/calculo-recebimento'

// GET /api/integracoes/gohighlevel/recebimentos?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&page=&limit=
// Rota externa — autenticada por token de API (Authorization: Bearer <token>), não por sessão.
// Espelha o bloco "itens" de /api/gerencial/receitas (pedido-api-vita-09nov.pdf item 2), que hoje
// só sai exportando Excel na mão. Paginado (a rota interna não pagina — período inteiro —, mas
// aqui faz sentido pra polling periódico).
export async function GET(req: NextRequest) {
  const auth = await autenticarTokenGohighlevel(req)
  if (auth instanceof NextResponse) return auth
  const { database_name, empresa_id } = auth

  const sp     = req.nextUrl.searchParams
  const inicio = sp.get('inicio') || ''
  const fim    = sp.get('fim') || ''
  const page   = Math.max(1, Number(sp.get('page') || 1))
  const limit  = Math.min(500, Number(sp.get('limit') || 100))
  const offset = (page - 1) * limit

  const db = getDb(database_name)

  const conds: string[] = ['rc.empresa_id = $1', `rc.status_recebimento = 'PAGO'`]
  const params: unknown[] = [empresa_id]
  if (inicio) {
    conds.push(`rc.data_recebimento >= $${params.length + 1}::date`)
    params.push(inicio)
  }
  if (fim) {
    conds.push(`rc.data_recebimento < ($${params.length + 1}::date + INTERVAL '1 day')`)
    params.push(fim)
  }
  const where = conds.join(' AND ')

  try {
    const [{ rows: countRows }, { rows }] = await Promise.all([
      db.query(`SELECT COUNT(*) AS n FROM tab_recebimento_consulta rc WHERE ${where}`, params),
      db.query(
        `SELECT
           rc.id, rc.data_recebimento, rc.paciente_id, rc.total_recebimento,
           a.profissional_id AS executante_id, exec.nome AS executante_nome,
           sol.nome AS solicitante_nome,
           tp.descricao AS procedimento,
           cp.descricao AS forma_pagamento,
           vc.qtd_parcelas, vc.percentual_mdr_aplicado,
           rc.valor_profissional, rc.valor_clinica
         FROM tab_recebimento_consulta rc
         JOIN tab_agendamento a ON a.id = rc.agendamento_id
         LEFT JOIN tab_pessoa exec ON exec.id = a.profissional_id
         LEFT JOIN tab_pessoa sol  ON sol.id = a.medico_solicitante_id
         LEFT JOIN tab_agendamento_tipo tp ON tp.id = a.tipo_id
         LEFT JOIN tab_condicao_pagamento cp ON cp.id = rc.condicao_pagamento_id
         LEFT JOIN tab_venda_cartao vc ON vc.id = rc.venda_cartao_id
         WHERE ${where}
         ORDER BY rc.data_recebimento, rc.id
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ])

    const total = Number(countRows[0].n)
    const dados = rows.map((r) => {
      const valorBruto = Number(r.total_recebimento)
      const percentualMdr = r.percentual_mdr_aplicado != null ? Number(r.percentual_mdr_aplicado) : 0
      const { valorTaxa, valorLiquido } = calcularValoresRecebimento(valorBruto, percentualMdr)
      return {
        id: r.id,
        data_recebimento: r.data_recebimento instanceof Date ? r.data_recebimento.toISOString().slice(0, 10) : String(r.data_recebimento).slice(0, 10),
        paciente_id: r.paciente_id,
        procedimento: r.procedimento,
        executante_nome: r.executante_nome,
        solicitante_nome: r.solicitante_nome,
        forma_pagamento: r.forma_pagamento,
        qtd_parcelas: r.qtd_parcelas,
        valor_bruto: valorBruto,
        valor_taxa: valorTaxa,
        valor_liquido: valorLiquido,
        valor_profissional: Number(r.valor_profissional ?? 0),
        valor_clinica: Number(r.valor_clinica ?? 0),
      }
    })

    return NextResponse.json({ dados, total, page, limit, pages: Math.ceil(total / limit) })
  } catch (err) {
    console.error('[GET /api/integracoes/gohighlevel/recebimentos]', err)
    return NextResponse.json({ erro: 'Erro ao consultar recebimentos' }, { status: 500 })
  }
}
