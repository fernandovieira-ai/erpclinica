import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { bloqueioHorarioSchema } from '@/lib/validators/bloqueio-agenda.schema'
import { registrarAuditoria } from '@/lib/auditoria'

const up = (v: string | null | undefined) => (v ? v.trim().toUpperCase() || null : null)

const COLUNAS = `id, profissional_id, TO_CHAR(data, 'YYYY-MM-DD') AS data,
                 TO_CHAR(hora_inicio, 'HH24:MI') AS hora_inicio,
                 TO_CHAR(hora_fim,    'HH24:MI') AS hora_fim,
                 motivo`

// GET /api/clinica/agenda-profissional-bloqueio?profissional_id=X&inicio=YYYY-MM-DD&fim=YYYY-MM-DD
// profissional_id é opcional (sem ele, traz de todos — usado pela agenda com filtro "Todos");
// inicio/fim são opcionais e inclusivos.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const profissionalId = sp.get('profissional_id')
  const inicio = sp.get('inicio')
  const fim    = sp.get('fim')
  if ((inicio && !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) || (fim && !/^\d{4}-\d{2}-\d{2}$/.test(fim))) {
    return NextResponse.json({ erro: 'Datas inválidas (YYYY-MM-DD)' }, { status: 400 })
  }

  const conds: string[]   = ['empresa_id = $1']
  const params: unknown[] = [session.empresa_id_ativa]
  if (profissionalId) {
    const pid = Number(profissionalId)
    if (!Number.isInteger(pid) || pid <= 0) return NextResponse.json({ erro: 'profissional_id inválido' }, { status: 400 })
    params.push(pid); conds.push(`profissional_id = $${params.length}`)
  }
  if (inicio)         { params.push(inicio);                 conds.push(`data >= $${params.length}`) }
  if (fim)            { params.push(fim);                    conds.push(`data <= $${params.length}`) }

  const db = getDb(session.database_name)
  const { rows } = await db.query(
    `SELECT ${COLUNAS} FROM tab_agenda_profissional_bloqueio
     WHERE ${conds.join(' AND ')}
     ORDER BY data, hora_inicio`,
    params,
  )
  return NextResponse.json({ dados: rows })
}

// POST /api/clinica/agenda-profissional-bloqueio — bloqueia uma faixa de horário numa data
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = bloqueioHorarioSchema.safeParse(await req.json())
  if (!body.success) {
    const msg = body.error.issues[0]?.message ?? 'Dados inválidos'
    return NextResponse.json({ erro: msg }, { status: 400 })
  }
  const d  = body.data
  const db = getDb(session.database_name)

  try {
    // Bloqueio de data passada não faz sentido (só bloquearia histórico) — mesma referência
    // de "hoje" do banco que o resto da agenda usa.
    const { rows: [chk] } = await db.query(
      `SELECT ($1::date < CURRENT_DATE) AS passado,
              EXISTS (SELECT 1 FROM tab_pessoa WHERE id = $2 AND empresa_id = $3 AND ind_profissional = true) AS prof_ok`,
      [d.data, d.profissional_id, session.empresa_id_ativa],
    )
    if (chk.passado)  return NextResponse.json({ erro: 'Não é possível bloquear uma data que já passou' }, { status: 422 })
    if (!chk.prof_ok) return NextResponse.json({ erro: 'Profissional inválido' }, { status: 422 })

    // O NOT EXISTS fica no próprio INSERT (mesmo padrão do POST de agendamentos): a janela de
    // corrida entre checar sobreposição e gravar cai de uma ida de rede ao banco pra
    // microssegundos. 0 linhas = já existe bloqueio sobreposto criado entre a checagem e o INSERT.
    const { rows: [novo] } = await db.query(
      `INSERT INTO tab_agenda_profissional_bloqueio
         (empresa_id, profissional_id, data, hora_inicio, hora_fim, motivo, created_by)
       SELECT $1::int, $2::int, $3::date, $4::time, $5::time, $6::varchar, $7::varchar
       WHERE NOT EXISTS (
         SELECT 1 FROM tab_agenda_profissional_bloqueio
         WHERE profissional_id = $2::int AND empresa_id = $1::int AND data = $3::date
           AND hora_inicio < $5::time AND hora_fim > $4::time
       )
       RETURNING ${COLUNAS}`,
      [session.empresa_id_ativa, d.profissional_id, d.data, d.hora_inicio, d.hora_fim, up(d.motivo), session.nome],
    )

    if (!novo) {
      // Faixas sobrepostas ficariam "presas" uma na outra: remover só uma deixaria o horário ainda bloqueado
      return NextResponse.json(
        { erro: 'Já existe um bloqueio que se sobrepõe a esse horário. Remova-o antes.' },
        { status: 409 },
      )
    }

    await registrarAuditoria(db, session, {
      tabela: 'tab_agenda_profissional_bloqueio',
      registroId: novo.id,
      acao: 'INSERT',
      dadosDepois: novo,
    })

    return NextResponse.json(novo, { status: 201 })
  } catch (err) {
    console.error('[POST /api/clinica/agenda-profissional-bloqueio]', err)
    return NextResponse.json({ erro: 'Erro ao bloquear horário' }, { status: 500 })
  }
}
