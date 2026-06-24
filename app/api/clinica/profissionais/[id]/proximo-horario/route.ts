import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'
import { format, addDays } from 'date-fns'

// GET /api/clinica/profissionais/[id]/proximo-horario?data_inicio=YYYY-MM-DD&duracao_min=30&hora_inicio_min=HH:MM
// Retorna o próximo slot disponível considerando: grade semanal, pausas, exceções e agendamentos existentes.
// hora_inicio_min: no primeiro dia, inicia a busca a partir deste horário (ex: slot clicado no calendário).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db             = getDb(session.database_name)
  const profissionalId = Number(params.id)
  const sp             = req.nextUrl.searchParams
  const dataInicio     = sp.get('data_inicio')    || format(new Date(), 'yyyy-MM-dd')
  const duracaoParam   = Number(sp.get('duracao_min') || 0) // 0 = usar intervalo_min da grade
  const horaInicioMinParam = sp.get('hora_inicio_min') || null  // HH:MM ou null

  const MAX_DIAS = 60

  try {
    // Grade semanal do profissional
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

    // Pausas de todos os dias
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

    // Exceções no intervalo de busca
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

    // Agendamentos existentes no intervalo (não cancelados / faltou)
    // TO_CHAR sem timezone é intencional: compatível com como o frontend envia os horários
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

    // ── Utilitários ────────────────────────────────────────────────────────────
    function addMin(hhmm: string, min: number): string {
      const [h, m] = hhmm.split(':').map(Number)
      const total  = h * 60 + m + min
      return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    }

    function slotConflita(data: string, ini: string, fim: string): boolean {
      // OVERLAPS: ini1 < fim2 AND fim1 > ini2
      return agendamentos.some(ag => ag.data === data && ini < ag.hora_fim && fim > ag.hora_ini)
    }

    function slotEmPausa(diaSemana: number, ini: string, fim: string): boolean {
      return pausas
        .filter(p => p.dia_semana === diaSemana)
        .some(p => ini < p.hora_fim && fim > p.hora_inicio)
    }

    // ── Iteração por dia ────────────────────────────────────────────────────────
    const agora     = new Date()
    const dataHoje  = format(agora, 'yyyy-MM-dd')
    const horaAgora = format(agora, 'HH:mm')

    const [yy, mm, dd] = dataInicio.split('-').map(Number)
    let current = new Date(yy, mm - 1, dd)

    for (let d = 0; d < MAX_DIAS; d++, current = addDays(current, 1)) {
      const dataStr  = format(current, 'yyyy-MM-dd')
      const diaSemana = current.getDay() // 0=Dom … 6=Sáb
      const isHoje   = dataStr === dataHoje

      let hIni: string, hFim: string, intervalo: number

      // Verificar exceção para esta data
      const exc = excecoes.find(e => e.data === dataStr)

      if (exc) {
        if (exc.nao_atende) continue
        if (exc.hora_inicio && exc.hora_fim) {
          hIni      = exc.hora_inicio
          hFim      = exc.hora_fim
          intervalo = exc.intervalo_min ?? 30
        } else {
          // Exceção sem horário especial: usa a grade semanal normal
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

      const duracao = duracaoParam > 0 ? duracaoParam : intervalo

      // Ponto de partida: hora_inicio do profissional neste dia
      let slotIni = hIni

      // No primeiro dia, honrar hora_inicio_min (slot clicado no calendário)
      // mas apenas se for depois do início da grade (senão usa a grade)
      if (d === 0 && horaInicioMinParam && horaInicioMinParam > hIni) {
        const [hm, mm] = horaInicioMinParam.split(':').map(Number)
        const aligned  = Math.ceil((hm * 60 + mm) / intervalo) * intervalo
        slotIni = addMin('00:00', aligned)
      }

      // Avançar além do horário atual se for hoje
      if (isHoje) {
        const [hn, mn] = horaAgora.split(':').map(Number)
        const totalNow = hn * 60 + mn + 1  // +1 para não iniciar no minuto exato
        const slots    = Math.ceil(totalNow / intervalo)
        const afterNow = addMin('00:00', slots * intervalo)
        if (afterNow > slotIni) slotIni = afterNow
        if (slotIni < hIni) slotIni = hIni  // nunca antes do início da grade
      }

      // Iterar slots
      while (slotIni < hFim) {
        const slotFim = addMin(slotIni, duracao)
        if (slotFim > hFim) break

        if (!slotEmPausa(diaSemana, slotIni, slotFim) && !slotConflita(dataStr, slotIni, slotFim)) {
          return NextResponse.json({ data: dataStr, hora_inicio: slotIni, hora_fim: slotFim })
        }

        slotIni = addMin(slotIni, intervalo)
      }
    }

    return NextResponse.json(
      { erro: `Nenhum horário disponível nos próximos ${MAX_DIAS} dias` },
      { status: 404 },
    )

  } catch (err) {
    console.error('Erro ao buscar próximo horário:', err)
    return NextResponse.json({ erro: 'Erro ao buscar próximo horário' }, { status: 500 })
  }
}
