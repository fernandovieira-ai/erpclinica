import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

const LIMITE_LINHAS  = 5000
const LIMITE_DIAS    = 366
const REGEX_DATA     = /^\d{4}-\d{2}-\d{2}$/

function idOpcional(v: string | null): number | null | 'invalido' {
  if (!v) return null
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 'invalido'
}

// GET /api/gerencial/fechamento-diario/relatorio?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&profissional_id=&categoria_id=
// Base do relatório impresso "Pacientes pelo tipo de atendimento": pacientes que compareceram
// (AGUARDANDO/ATENDIDO) ou pagaram no período, com o valor a pagar (tabela) e o efetivamente pago.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const inicio = sp.get('inicio') ?? ''
  const fim    = sp.get('fim') ?? ''
  if (!REGEX_DATA.test(inicio) || !REGEX_DATA.test(fim)) {
    return NextResponse.json({ erro: 'Informe o período (inicio e fim no formato YYYY-MM-DD)' }, { status: 400 })
  }
  const dias = (Date.parse(fim) - Date.parse(inicio)) / 86_400_000
  if (!Number.isFinite(dias) || dias < 0) {
    return NextResponse.json({ erro: 'A data final não pode ser anterior à inicial' }, { status: 400 })
  }
  if (dias > LIMITE_DIAS) {
    return NextResponse.json({ erro: `Período máximo de ${LIMITE_DIAS} dias` }, { status: 400 })
  }

  const profissionalId = idOpcional(sp.get('profissional_id'))
  const categoriaId    = idOpcional(sp.get('categoria_id'))
  if (profissionalId === 'invalido' || categoriaId === 'invalido') {
    return NextResponse.json({ erro: 'Filtro inválido' }, { status: 400 })
  }

  const empresaId = session.empresa_id_ativa
  const params: unknown[] = [empresaId, inicio, fim]
  const conds = [
    'a.empresa_id = $1',
    'a.data_hora_inicio >= $2::date',
    `a.data_hora_inicio <  ($3::date + INTERVAL '1 day')`,
    // Compareceu (aguardando/atendido) OU tem pagamento: assim o "Vlr. Pago" total confere com o
    // "Total Recebido" do Fechamento Diário (que soma todo recebimento PAGO, inclusive de quem faltou).
    `(a.status IN ('AGUARDANDO','ATENDIDO') OR rc.id IS NOT NULL)`,
  ]
  if (profissionalId) { params.push(profissionalId); conds.push(`a.profissional_id = $${params.length}`) }
  if (categoriaId)    { params.push(categoriaId);    conds.push(`a.categoria_id = $${params.length}`) }

  const db = getDb(session.database_name)

  try {
    const [{ rows }, { rows: [empresa] }] = await Promise.all([
      db.query(
        `SELECT
           a.id,
           pac.nome AS paciente_nome,
           COALESCE(NULLIF(TRIM(pac.celular), ''), NULLIF(TRIM(pac.telefone), '')) AS telefone,
           cat.descricao AS categoria,
           TO_CHAR(a.data_hora_inicio, 'DD/MM/YYYY') AS data_visita,
           TO_CHAR(a.data_hora_inicio, 'HH24:MI')    AS hora_visita,
           pro.id AS profissional_id, pro.nome AS profissional_nome,
           tp.descricao AS tipo_descricao,
           rc.valor_original, rc.total_recebimento,
           cp.descricao AS forma_descricao, cp.tipo_pagamento, vc.qtd_parcelas,
           COALESCE(atc.valor, tp.valor) AS valor_tabela
         FROM tab_agendamento a
           JOIN tab_pessoa pac ON pac.id = a.paciente_id
           JOIN tab_pessoa pro ON pro.id = a.profissional_id
           LEFT JOIN tab_agendamento_tipo tp ON tp.id = a.tipo_id
           LEFT JOIN tab_agendamento_tipo_categoria atc ON atc.tipo_id = a.tipo_id AND atc.categoria_id = a.categoria_id
           LEFT JOIN tab_categoria cat ON cat.id = a.categoria_id
           LEFT JOIN tab_recebimento_consulta rc ON rc.agendamento_id = a.id AND rc.status_recebimento = 'PAGO'
           LEFT JOIN tab_condicao_pagamento cp ON cp.id = rc.condicao_pagamento_id
           LEFT JOIN tab_venda_cartao vc ON vc.id = rc.venda_cartao_id
         WHERE ${conds.join(' AND ')}
         ORDER BY a.data_hora_inicio, pac.nome
         LIMIT ${LIMITE_LINHAS + 1}`,
        params,
      ),
      db.query(
        `SELECT COALESCE(NULLIF(TRIM(nome_fantasia), ''), razao_social) AS nome, logo_base64
           FROM tab_empresa WHERE id = $1`,
        [empresaId],
      ),
    ])

    if (rows.length > LIMITE_LINHAS) {
      return NextResponse.json(
        { erro: `Mais de ${LIMITE_LINHAS} atendimentos no período - reduza o período ou filtre por médico` },
        { status: 422 },
      )
    }

    const itens = rows.map(r => {
      const pago = r.total_recebimento != null
      // Forma de pagamento da consulta: condição escolhida no recebimento; crédito parcelado mostra o nº de parcelas
      const parcelas = Number(r.qtd_parcelas) || 0
      const forma = !pago ? null
        : `${(r.forma_descricao as string | null) ?? 'NÃO INFORMADA'}${r.tipo_pagamento === 'credito' && parcelas > 1 ? ` ${parcelas}x` : ''}`
      return {
        pago,
        forma_pagamento:   forma,
        tipo_pagamento:    pago ? ((r.tipo_pagamento as string | null) ?? null) : null,
        id:                r.id as number,
        paciente_nome:     r.paciente_nome as string,
        telefone:          (r.telefone as string | null) ?? null,
        categoria:         (r.categoria as string | null) ?? null,
        data_visita:       r.data_visita as string,
        hora_visita:       r.hora_visita as string,
        profissional_id:   r.profissional_id as number,
        profissional_nome: r.profissional_nome as string,
        tipo_descricao:    (r.tipo_descricao as string | null) ?? null,
        // Pago: o que foi recebido. A pagar: valor de tabela cobrado (com recebimento, o gravado
        // no momento do pagamento; sem recebimento, o valor atual do tipo pra categoria).
        valor_pagar:       pago ? Number(r.valor_original) || 0 : Number(r.valor_tabela) || 0,
        valor_pago:        pago ? Number(r.total_recebimento) || 0 : 0,
      }
    })

    return NextResponse.json({
      inicio, fim,
      empresa_nome:  (empresa?.nome as string | undefined) ?? '',
      empresa_logo:  (empresa?.logo_base64 as string | null | undefined) ?? null,
      emitido_por:   session.nome ?? '',
      itens,
    })
  } catch (err) {
    console.error('[GET /api/gerencial/fechamento-diario/relatorio]', err)
    return NextResponse.json({ erro: 'Erro ao gerar dados do relatório' }, { status: 500 })
  }
}
