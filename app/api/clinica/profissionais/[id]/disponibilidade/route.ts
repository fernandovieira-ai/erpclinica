import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/profissionais/[id]/disponibilidade?data=YYYY-MM-DD&hora_inicio=HH:MM&hora_fim=HH:MM
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const data = req.nextUrl.searchParams.get('data')
  const hora_inicio = req.nextUrl.searchParams.get('hora_inicio')
  const hora_fim = req.nextUrl.searchParams.get('hora_fim')

  if (!data || !hora_inicio || !hora_fim) {
    return NextResponse.json({ erro: 'Parâmetros obrigatórios: data, hora_inicio, hora_fim' }, { status: 400 })
  }

  const db = getDb(session.database_name)
  const profissionalId = Number(params.id)

  try {
    // Verificar se há exceção para esta data
    const { rows: excecoes } = await db.query(
      `SELECT nao_atende,
              SUBSTRING(hora_inicio::text, 1, 5) AS hora_inicio,
              SUBSTRING(hora_fim::text,    1, 5) AS hora_fim
       FROM tab_agenda_profissional_excecao
       WHERE profissional_id = $1 AND empresa_id = $2 AND data = $3`,
      [profissionalId, session.empresa_id_ativa, data],
    )

    if (excecoes.length > 0) {
      const exc = excecoes[0]
      if (exc.nao_atende) {
        return NextResponse.json({
          disponivel: false,
          razao: 'Profissional não atende nesta data (exceção)',
        })
      }
      // Se tem horário especial, validar se o slot cabe nele
      if (exc.hora_inicio && exc.hora_fim) {
        if (hora_inicio < exc.hora_inicio || hora_fim > exc.hora_fim) {
          return NextResponse.json({
            disponivel: false,
            razao: `Neste dia o profissional atende apenas de ${exc.hora_inicio} a ${exc.hora_fim}`,
          })
        }
      }
    } else {
      // Não há exceção, validar pelo dia da semana
      const [ano, mes, dia] = data.split('-').map(Number)
      const dataObj = new Date(ano, mes - 1, dia)
      const diaSemana = dataObj.getDay() // 0=Dom, 1=Seg, ..., 6=Sáb

      const { rows: agendaDias } = await db.query(
        `SELECT SUBSTRING(hora_inicio::text, 1, 5) AS hora_inicio,
                SUBSTRING(hora_fim::text,    1, 5) AS hora_fim,
                ativo
         FROM tab_agenda_profissional
         WHERE profissional_id = $1 AND empresa_id = $2 AND dia_semana = $3`,
        [profissionalId, session.empresa_id_ativa, diaSemana],
      )

      if (agendaDias.length === 0 || !agendaDias[0].ativo) {
        return NextResponse.json({
          disponivel: false,
          razao: `Profissional não atende ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][diaSemana]}`,
        })
      }

      const agenda = agendaDias[0]

      // Validar se o horário está dentro do range
      if (hora_inicio < agenda.hora_inicio || hora_fim > agenda.hora_fim) {
        return NextResponse.json({
          disponivel: false,
          razao: `Profissional atende apenas de ${agenda.hora_inicio} a ${agenda.hora_fim} neste dia`,
        })
      }

      // Validar pausas
      const { rows: pausas } = await db.query(
        `SELECT SUBSTRING(hora_inicio::text, 1, 5) AS hora_inicio,
                SUBSTRING(hora_fim::text,    1, 5) AS hora_fim
         FROM tab_agenda_profissional_pausa
         WHERE profissional_id = $1 AND empresa_id = $2 AND dia_semana = $3`,
        [profissionalId, session.empresa_id_ativa, diaSemana],
      )

      for (const pausa of pausas) {
        // Se o slot sobrepõe a pausa, não permite
        if (hora_inicio < pausa.hora_fim && hora_fim > pausa.hora_inicio) {
          return NextResponse.json({
            disponivel: false,
            razao: `Conflito com período de pausa (${pausa.hora_inicio} - ${pausa.hora_fim})`,
          })
        }
      }
    }

    return NextResponse.json({ disponivel: true })
  } catch (err) {
    console.error('Erro ao validar disponibilidade:', err)
    return NextResponse.json({ erro: 'Erro ao validar disponibilidade' }, { status: 500 })
  }
}
