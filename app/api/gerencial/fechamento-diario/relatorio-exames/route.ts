import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { LIMITE_LINHAS, idOpcional, validarPeriodo, formaDePagamento } from '@/lib/gerencial/relatorio-fechamento'

// GET /api/gerencial/fechamento-diario/relatorio-exames?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&profissional_id=&tipo_id=&categoria_id=
// Base do relatório impresso "Exames pelo médico executante": só tipos com eh_exame = true (cadastro do tipo),
// que compareceram (AGUARDANDO/ATENDIDO) ou pagaram no período.
//
// Quem é o EXECUTANTE (padroes §22): no recebimento de um exame agendado no "médico da clínica" (placeholder,
// tab_pessoa.eh_clinica) o operador informa o executor e a rota de recebimentos TROCA agendamento.profissional_id
// por ele (e grava o solicitante em medico_solicitante_id). Então:
//   - profissional_id = médico que executou (exame já recebido ou agendado direto com o médico real);
//   - profissional_id = placeholder da clínica (eh_clinica) = executante AINDA A DEFINIR (exame não recebido).
// O filtro profissional_id é sobre o executante (a definir não casa com médico nenhum).
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp     = req.nextUrl.searchParams
  const inicio = sp.get('inicio') ?? ''
  const fim    = sp.get('fim') ?? ''
  const erroPeriodo = validarPeriodo(inicio, fim)
  if (erroPeriodo) return NextResponse.json(erroPeriodo, { status: 400 })

  const profissionalId = idOpcional(sp.get('profissional_id'))
  const tipoId         = idOpcional(sp.get('tipo_id'))
  const categoriaId    = idOpcional(sp.get('categoria_id'))
  if (profissionalId === 'invalido' || tipoId === 'invalido' || categoriaId === 'invalido') {
    return NextResponse.json({ erro: 'Filtro inválido' }, { status: 400 })
  }

  const empresaId = session.empresa_id_ativa
  const params: unknown[] = [empresaId, inicio, fim]
  const conds = [
    'a.empresa_id = $1',
    'a.data_hora_inicio >= $2::date',
    `a.data_hora_inicio <  ($3::date + INTERVAL '1 day')`,
    'tp.eh_exame = true',
    // Mesmo critério do relatório de atendimentos: compareceu OU tem pagamento (o "Vlr. Pago" confere com o Fechamento)
    `(a.status IN ('AGUARDANDO','ATENDIDO') OR rc.id IS NOT NULL)`,
  ]
  if (profissionalId) { params.push(profissionalId); conds.push(`a.profissional_id = $${params.length}`) }
  if (tipoId)         { params.push(tipoId);         conds.push(`a.tipo_id = $${params.length}`) }
  if (categoriaId)    { params.push(categoriaId);    conds.push(`a.categoria_id = $${params.length}`) }

  const db = getDb(session.database_name)

  try {
    const [{ rows }, { rows: [empresa] }] = await Promise.all([
      db.query(
        `SELECT
           a.id,
           pac.nome AS paciente_nome,
           cat.descricao AS categoria,
           TO_CHAR(a.data_hora_inicio, 'DD/MM/YYYY') AS data_visita,
           TO_CHAR(a.data_hora_inicio, 'HH24:MI')    AS hora_visita,
           pro.id AS executante_id, pro.nome AS executante_nome, (pro.eh_clinica IS TRUE) AS executante_a_definir,
           sol.nome AS solicitante_nome,
           tp.descricao AS exame,
           rc.valor_original, rc.total_recebimento,
           cp.descricao AS forma_descricao, cp.tipo_pagamento, vc.qtd_parcelas,
           COALESCE(atc.valor, tp.valor) AS valor_tabela
         FROM tab_agendamento a
           JOIN tab_pessoa pac ON pac.id = a.paciente_id
           JOIN tab_pessoa pro ON pro.id = a.profissional_id
           JOIN tab_agendamento_tipo tp ON tp.id = a.tipo_id
           LEFT JOIN tab_pessoa sol ON sol.id = a.medico_solicitante_id
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
        { erro: `Mais de ${LIMITE_LINHAS} exames no período - reduza o período ou filtre por médico/exame` },
        { status: 422 },
      )
    }

    const itens = rows.map(r => {
      const pago = r.total_recebimento != null
      return {
        pago,
        forma_pagamento:      formaDePagamento(pago, r.forma_descricao as string | null, r.tipo_pagamento as string | null, r.qtd_parcelas),
        tipo_pagamento:       pago ? ((r.tipo_pagamento as string | null) ?? null) : null,
        id:                   r.id as number,
        paciente_nome:        r.paciente_nome as string,
        categoria:            (r.categoria as string | null) ?? null,
        data_visita:          r.data_visita as string,
        hora_visita:          r.hora_visita as string,
        executante_id:        r.executante_id as number,
        executante_nome:      r.executante_nome as string,
        executante_a_definir: r.executante_a_definir as boolean,
        solicitante_nome:     (r.solicitante_nome as string | null) ?? null,
        exame:                r.exame as string,
        // Mesma regra do relatório de atendimentos: pago = valor gravado no recebimento; senão o valor atual de tabela
        valor_pagar:          pago ? Number(r.valor_original) || 0 : Number(r.valor_tabela) || 0,
        valor_pago:           pago ? Number(r.total_recebimento) || 0 : 0,
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
    console.error('[GET /api/gerencial/fechamento-diario/relatorio-exames]', err)
    return NextResponse.json({ erro: 'Erro ao gerar dados do relatório' }, { status: 500 })
  }
}
