import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/receitas-sistema
//   ?dados=true&agendamento_id=X  → dados do prescritor/paciente para o cabeçalho da receita
//   ?agendamento_id=X             → lista receitas do agendamento
//   ?paciente_id=X                → lista receitas do paciente
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db    = getDb(session.database_name)
  const agId  = req.nextUrl.searchParams.get('agendamento_id')
  const pacId = req.nextUrl.searchParams.get('paciente_id')
  const dados = req.nextUrl.searchParams.get('dados') === 'true'

  // Dados do prescritor + paciente para cabeçalho de impressão
  if (dados && agId) {
    const { rows } = await db.query(
      `SELECT prof.nome                                      AS profissional_nome,
              prof.crm,
              prof.crm_uf,
              pac.nome                                       AS paciente_nome,
              pac.cpf_cnpj                                   AS paciente_cpf,
              TO_CHAR(pac.data_nascimento, 'DD/MM/YYYY')     AS paciente_nascimento,
              TO_CHAR(a.data_hora_inicio,  'DD/MM/YYYY')     AS data_consulta,
              emp.razao_social                                AS empresa_razao_social,
              emp.nome_fantasia                               AS empresa_nome_fantasia,
              emp.logo_base64                                 AS empresa_logo_base64,
              emp.telefone                                    AS empresa_telefone,
              emp.logradouro                                  AS empresa_logradouro,
              emp.numero                                      AS empresa_numero,
              emp.complemento                                 AS empresa_complemento,
              emp.bairro                                      AS empresa_bairro,
              emp.cidade                                       AS empresa_cidade,
              emp.uf                                          AS empresa_uf,
              emp.cep                                          AS empresa_cep
       FROM tab_agendamento a
       JOIN tab_pessoa pac  ON pac.id = a.paciente_id
       JOIN tab_pessoa prof ON prof.id = a.profissional_id
       JOIN tab_empresa emp ON emp.id = a.empresa_id
       WHERE a.id = $1 AND a.empresa_id = $2`,
      [Number(agId), session.empresa_id_ativa],
    )
    if (!rows.length) return NextResponse.json({ erro: 'Agendamento não encontrado' }, { status: 404 })
    return NextResponse.json({ dados: rows[0] })
  }

  if (!agId && !pacId) {
    return NextResponse.json({ erro: 'Informe agendamento_id ou paciente_id' }, { status: 400 })
  }

  const cond  = agId ? 'rs.agendamento_id = $2' : 'rs.paciente_id = $2'
  const valor = agId ? Number(agId) : Number(pacId)

  const { rows } = await db.query(
    `SELECT rs.id,
            rs.agendamento_id,
            rs.paciente_id,
            rs.observacoes,
            rs.created_by,
            rs.created_at,
            COALESCE(
              json_agg(rsi ORDER BY rsi.ordem, rsi.id)
              FILTER (WHERE rsi.id IS NOT NULL),
              '[]'
            ) AS itens
     FROM tab_receita_sistema rs
     LEFT JOIN tab_receita_sistema_item rsi ON rsi.receita_id = rs.id
     WHERE rs.empresa_id = $1 AND ${cond}
     GROUP BY rs.id
     ORDER BY rs.created_at DESC`,
    [session.empresa_id_ativa, valor],
  )

  return NextResponse.json({ dados: rows })
}

// POST /api/clinica/receitas-sistema  — salva nova receita
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (
    !body?.agendamento_id ||
    !Array.isArray(body?.itens) ||
    body.itens.length === 0
  ) {
    return NextResponse.json({ erro: 'Dados inválidos' }, { status: 400 })
  }

  const db = getDb(session.database_name)

  const { rows: agRows } = await db.query(
    'SELECT id, paciente_id, profissional_id FROM tab_agendamento WHERE id = $1 AND empresa_id = $2',
    [body.agendamento_id, session.empresa_id_ativa],
  )
  if (!agRows.length) {
    return NextResponse.json({ erro: 'Agendamento não encontrado' }, { status: 404 })
  }
  const ag = agRows[0]

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const { rows: rec } = await client.query(
      `INSERT INTO tab_receita_sistema
         (empresa_id, agendamento_id, paciente_id, profissional_id, observacoes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [
        session.empresa_id_ativa, ag.id, ag.paciente_id, ag.profissional_id,
        body.observacoes ?? null,
        session.nome ?? null,
      ],
    )
    const receitaId = rec[0].id

    for (let i = 0; i < body.itens.length; i++) {
      const it = body.itens[i]
      await client.query(
        `INSERT INTO tab_receita_sistema_item
           (receita_id, medicamento_nome, codigo_produto, apresentacao,
            forma_farmaceutica, via_administracao, posologia, duracao, quantidade, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          receitaId,
          it.medicamento_nome,
          it.codigo_produto   ?? null,
          it.apresentacao     ?? null,
          it.forma_farmaceutica ?? null,
          it.via_administracao ?? null,
          it.posologia,
          it.duracao          ?? null,
          it.quantidade       ?? null,
          i,
        ],
      )
    }

    await client.query('COMMIT')
    return NextResponse.json({ id: receitaId })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}
