import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { format, addDays } from 'date-fns'

// GET /api/clinica/profissionais/[id]/horarios-disponiveis?data_inicio=YYYY-MM-DD&duracao_min=30&dias_com_vaga=10
// Retorna TODOS os slots livres, agrupados por dia, até acumular `dias_com_vaga` dias com
// pelo menos 1 horário livre (ou até varrer `max_dias`). Mesma regra de disponibilidade
// de /proximo-horario (grade semanal, pausas, exceções, agendamentos existentes), mas
// devolvendo a lista inteira em vez de parar no primeiro slot encontrado.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db             = getDb(session.database_name)
  const profissionalId = Number(params.id)
  const sp              = req.nextUrl.searchParams
  const dataInicio      = sp.get('data_inicio') || format(new Date(), 'yyyy-MM-dd')
  const duracaoMin      = Number(sp.get('duracao_min') || 0)
  const diasComVagaAlvo = Math.min(Number(sp.get('dias_com_vaga') || 10), 30)

  if (duracaoMin <= 0) {
    return NextResponse.json({ erro: 'Parâmetro obrigatório: duracao_min' }, { status: 400 })
  }

  const MAX_DIAS = 60

  try {
    const { rows: agenda } = await db.query<{
      dia_semana: number; hora_inicio: string; hora_fim: string; intervalo_min: number; ativo: boolean
    }>(
      `SELECT dia_semana,
              SUBSTRING(hora_inicio::text, 1, 5) AS hora_inicio,
              SUBSTRING(hora_fim::text,    1, 5) AS hora_fim,
              intervalo_min, ativo
       FROM tab_agenda_profissional
       WHERE profissional_id = $1 AND empresa_id = $2`,
      [profissionalId, session.empresa_id_ativa],
    )

    if (agenda.filter(a => a.ativo).length === 0) {
      return NextResponse.json({ erro: 'Profissional sem agenda ativa cadastrada' }, { status: 404 })
    }

    const { rows: pausas } = await db.query<{
      dia_semana: number; hora_inicio: string; hora_fim: string
    }>(
      `SELECT dia_semana,
              SUBSTRING(hora_inicio::text, 1, 5) AS hora_inicio,
              SUBSTRING(hora_fim::text,    1, 5) AS hora_fim
       FROM tab_agenda_profissional_pausa
       WHERE profissional_id = $1 AND empresa_id = $2`,
      [profissionalId, session.empresa_id_ativa],
    )

    const dataFim = format(addDays(new Date(`${dataInicio}T12:00:00`), MAX_DIAS), 'yyyy-MM-dd')
    const { rows: excecoes } = await db.query<{
      data: string; nao_atende: boolean
      hora_inicio: string | null; hora_fim: string | null; intervalo_min: number | null
    }>(
      `SELECT TO_CHAR(data, 'YYYY-MM-DD')            AS data,
              nao_atende,
              SUBSTRING(hora_inicio::text, 1, 5)     AS hora_inicio,
              SUBSTRING(hora_fim::text,    1, 5)     AS hora_fim,
              intervalo_min
       FROM tab_agenda_profissional_excecao
       WHERE profissional_id = $1 AND empresa_id = $2 AND data BETWEEN $3 AND $4`,
      [profissionalId, session.empresa_id_ativa, dataInicio, dataFim],
    )

    const { rows: agendamentos } = await db.query<{
      data: string; hora_ini: string; hora_fim: string
    }>(
      `SELECT TO_CHAR(data_hora_inicio, 'YYYY-MM-DD') AS data,
              TO_CHAR(data_hora_inicio, 'HH24:MI')    AS hora_ini,
              TO_CHAR(data_hora_fim,    'HH24:MI')    AS hora_fim
       FROM tab_agendamento
       WHERE profissional_id = $1 AND empresa_id = $2
         AND status NOT IN ('CANCELADO', 'FALTOU')
         AND DATE(data_hora_inicio) BETWEEN $3 AND $4`,
      [profissionalId, session.empresa_id_ativa, dataInicio, dataFim],
    )

    function addMin(hhmm: string, min: number): string {
      const [h, m] = hhmm.split(':').map(Number)
      const total  = h * 60 + m + min
      return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    }

    function slotConflita(data: string, ini: string, fim: string): boolean {
      return agendamentos.some(ag => ag.data === data && ini < ag.hora_fim && fim > ag.hora_ini)
    }

    function slotEmPausa(diaSemana: number, ini: string, fim: string): boolean {
      return pausas
        .filter(p => p.dia_semana === diaSemana)
        .some(p => ini < p.hora_fim && fim > p.hora_inicio)
    }

    const agora     = new Date()
    const dataHoje  = format(agora, 'yyyy-MM-dd')
    const horaAgora = format(agora, 'HH:mm')

    const [yy, mm, dd] = dataInicio.split('-').map(Number)
    let current = new Date(yy, mm - 1, dd)

    const dias: { data: string; slots: string[] }[] = []
    let ultimoDiaVarrido = dataInicio

    for (let d = 0; d < MAX_DIAS && dias.length < diasComVagaAlvo; d++, current = addDays(current, 1)) {
      const dataStr   = format(current, 'yyyy-MM-dd')
      const diaSemana = current.getDay()
      const isHoje    = dataStr === dataHoje
      ultimoDiaVarrido = dataStr

      let hIni: string, hFim: string, intervalo: number

      const exc = excecoes.find(e => e.data === dataStr)
      if (exc) {
        if (exc.nao_atende) continue
        if (exc.hora_inicio && exc.hora_fim) {
          hIni      = exc.hora_inicio
          hFim      = exc.hora_fim
          intervalo = exc.intervalo_min ?? 30
        } else {
          const dia = agenda.find(a => a.dia_semana === diaSemana && a.ativo)
          if (!dia) continue
          hIni      = dia.hora_inicio
          hFim      = dia.hora_fim
          intervalo = dia.intervalo_min
        }
      } else {
        const dia = agenda.find(a => a.dia_semana === diaSemana && a.ativo)
        if (!dia) continue
        hIni      = dia.hora_inicio
        hFim      = dia.hora_fim
        intervalo = dia.intervalo_min
      }

      let slotIni = hIni

      if (isHoje) {
        const [hn, mn] = horaAgora.split(':').map(Number)
        const totalNow = hn * 60 + mn + 1
        const slots    = Math.ceil(totalNow / intervalo)
        const afterNow = addMin('00:00', slots * intervalo)
        if (afterNow > slotIni) slotIni = afterNow
        if (slotIni < hIni) slotIni = hIni
      }

      const slotsDoDia: string[] = []
      while (slotIni < hFim) {
        const slotFim = addMin(slotIni, duracaoMin)
        if (slotFim > hFim) break

        if (!slotEmPausa(diaSemana, slotIni, slotFim) && !slotConflita(dataStr, slotIni, slotFim)) {
          slotsDoDia.push(slotIni)
        }
        slotIni = addMin(slotIni, intervalo)
      }

      if (slotsDoDia.length > 0) {
        dias.push({ data: dataStr, slots: slotsDoDia })
      }
    }

    const proximaBusca = format(addDays(new Date(`${ultimoDiaVarrido}T12:00:00`), 1), 'yyyy-MM-dd')

    return NextResponse.json({ dias, proxima_busca: proximaBusca })
  } catch (err) {
    console.error('Erro ao buscar horários disponíveis:', err)
    return NextResponse.json({ erro: 'Erro ao buscar horários disponíveis' }, { status: 500 })
  }
}
