import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { validarPeriodo } from '@/lib/gerencial/relatorio-fechamento'

// GET /api/gerencial/agendamentos-usuario?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&incluir_avulso=
// Agrupa agendamentos em 2 níveis por quem LANÇOU o registro (tab_agendamento.created_by — o
// usuário logado que criou o agendamento, não o médico/profissional) -> tipo de atendimento,
// com a contagem por status (AGENDADO/CONFIRMADO/AGUARDANDO/ATENDIDO/FALTOU/CANCELADO). Filtro de
// período é sobre a DATA DE LANÇAMENTO (created_at), não a data da consulta — é esse o pedido do
// relatório: produtividade de cadastro por usuário, não agenda do dia.
// Avulso (novos/73_agendamento_avulso.sql — lançado direto na tela de Recebimento, nunca passou
// pela agenda) fica fora por padrão, mesmo critério de GET /api/clinica/agendamentos.
const STATUS_AGENDAMENTO = ['AGENDADO', 'CONFIRMADO', 'AGUARDANDO', 'ATENDIDO', 'FALTOU', 'CANCELADO'] as const
type StatusAgendamento = typeof STATUS_AGENDAMENTO[number]

function contagemZerada(): Record<StatusAgendamento, number> {
  return { AGENDADO: 0, CONFIRMADO: 0, AGUARDANDO: 0, ATENDIDO: 0, FALTOU: 0, CANCELADO: 0 }
}
function totalContagem(c: Record<StatusAgendamento, number>): number {
  return STATUS_AGENDAMENTO.reduce((acc, s) => acc + c[s], 0)
}

export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp            = req.nextUrl.searchParams
  const inicio        = sp.get('inicio') || ''
  const fim           = sp.get('fim') || ''
  const incluirAvulso = sp.get('incluir_avulso') === 'true'

  if ((inicio && !fim) || (fim && !inicio)) {
    return NextResponse.json({ erro: 'Informe início e fim do período' }, { status: 400 })
  }
  // Formato validado por regex + teto de 366 dias (mesmo limite do Fechamento Diário) — sem
  // período aberto o filtro cairia num sequential scan cada vez mais caro conforme o histórico
  // crescer, e uma data mal formatada vira erro de cast no Postgres em vez de um 400 limpo.
  if (inicio && fim) {
    const erroPeriodo = validarPeriodo(inicio, fim)
    if (erroPeriodo) return NextResponse.json(erroPeriodo, { status: 400 })
  }

  const db = getDb(session.database_name)
  const temPeriodo = !!(inicio && fim)

  const conds: string[] = ['a.empresa_id = $1']
  const params: unknown[] = [session.empresa_id_ativa]
  let pi = 2
  if (temPeriodo) {
    conds.push(`a.created_at >= $${pi++}::date`)
    params.push(inicio)
    conds.push(`a.created_at < ($${pi++}::date + INTERVAL '1 day')`)
    params.push(fim)
  }
  if (!incluirAvulso) {
    conds.push(`a.avulso = false`)
  }

  try {
    const [{ rows }, { rows: [empresa] }] = await Promise.all([
      db.query(
        `SELECT
           COALESCE(NULLIF(TRIM(a.created_by), ''), 'NÃO IDENTIFICADO') AS usuario,
           a.tipo_id,
           COALESCE(tp.descricao, 'SEM TIPO') AS tipo_descricao,
           a.status,
           COUNT(*)::int AS qtd
         FROM tab_agendamento a
         LEFT JOIN tab_agendamento_tipo tp ON tp.id = a.tipo_id
         WHERE ${conds.join(' AND ')}
         GROUP BY usuario, a.tipo_id, tp.descricao, a.status
         ORDER BY usuario, tipo_descricao`,
        params,
      ),
      db.query(
        `SELECT COALESCE(NULLIF(TRIM(nome_fantasia), ''), razao_social) AS nome, logo_base64
           FROM tab_empresa WHERE id = $1`,
        [session.empresa_id_ativa],
      ),
    ])

    interface TipoDetalhe {
      tipo_id: number | null
      tipo_descricao: string
      contagem: Record<StatusAgendamento, number>
      total: number
    }
    interface UsuarioGrupo {
      usuario: string
      tipos: Map<string, TipoDetalhe>
    }

    const usuarios = new Map<string, UsuarioGrupo>()
    for (const r of rows) {
      let grupo = usuarios.get(r.usuario)
      if (!grupo) {
        grupo = { usuario: r.usuario, tipos: new Map() }
        usuarios.set(r.usuario, grupo)
      }
      const chaveTipo = String(r.tipo_id ?? 'null')
      let tipo = grupo.tipos.get(chaveTipo)
      if (!tipo) {
        tipo = { tipo_id: r.tipo_id, tipo_descricao: r.tipo_descricao, contagem: contagemZerada(), total: 0 }
        grupo.tipos.set(chaveTipo, tipo)
      }
      const status = r.status as StatusAgendamento
      if (STATUS_AGENDAMENTO.includes(status)) {
        tipo.contagem[status] += r.qtd
      }
    }

    const usuariosLista = [...usuarios.values()]
      .map((g) => {
        const tipos = [...g.tipos.values()]
          .map((t) => ({ ...t, total: totalContagem(t.contagem) }))
          .sort((a, b) => a.tipo_descricao.localeCompare(b.tipo_descricao))
        const contagem = contagemZerada()
        for (const t of tipos) {
          for (const s of STATUS_AGENDAMENTO) contagem[s] += t.contagem[s]
        }
        return { usuario: g.usuario, tipos, contagem, total: totalContagem(contagem) }
      })
      .sort((a, b) => b.total - a.total || a.usuario.localeCompare(b.usuario))

    const contagemGeral = contagemZerada()
    for (const u of usuariosLista) {
      for (const s of STATUS_AGENDAMENTO) contagemGeral[s] += u.contagem[s]
    }
    const totalGeral = totalContagem(contagemGeral)
    const comparecimentoBase = contagemGeral.ATENDIDO + contagemGeral.FALTOU
    const taxaComparecimento = comparecimentoBase > 0 ? (contagemGeral.ATENDIDO / comparecimentoBase) * 100 : null

    return NextResponse.json({
      inicio, fim,
      resumo: {
        qtd_usuarios:    usuariosLista.length,
        qtd_agendamentos: totalGeral,
        por_status:      contagemGeral,
        taxa_comparecimento: taxaComparecimento,
      },
      usuarios:     usuariosLista,
      empresa_nome: (empresa?.nome as string | undefined) ?? '',
      empresa_logo: (empresa?.logo_base64 as string | null | undefined) ?? null,
      emitido_por:  session.nome ?? '',
    })
  } catch (err) {
    console.error('[GET /api/gerencial/agendamentos-usuario]', err)
    return NextResponse.json({ erro: 'Erro ao gerar o relatório' }, { status: 500 })
  }
}
