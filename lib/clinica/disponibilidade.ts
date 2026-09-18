// Regra de disponibilidade do profissional (exceção do dia > grade semanal > pausas).
// Compartilhada entre GET /profissionais/[id]/disponibilidade e POST /agendamentos,
// pra que a validação do lançamento rode no servidor em 1 ida ao banco (sem chamada extra do front).

export interface DadosDisponibilidade {
  dia_semana: number // 0=domingo ... 6=sábado
  excecao: { nao_atende: boolean; hora_inicio: string | null; hora_fim: string | null } | null
  agenda:  { ativo: boolean; hora_inicio: string; hora_fim: string } | null
  pausas:  { hora_inicio: string; hora_fim: string }[]
}

export type ResultadoDisponibilidade = { disponivel: true } | { disponivel: false; razao: string }

const NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

// Colunas prontas pra um SELECT. Parâmetros fixos: $1 = profissional_id, $2 = empresa_id.
// `dataExpr` é uma expressão SQL que resulta em DATE (ex.: `$3::date`).
// ATENÇÃO: `dataExpr` é concatenada no SQL — passe SOMENTE literais/expressões escritas no código
// (sempre com placeholders $N), NUNCA texto vindo de requisição, senão vira SQL injection.
export function sqlDadosDisponibilidade(dataExpr: string): string {
  const hhmm = (c: string) => `SUBSTRING(${c}::text, 1, 5)`
  return `
    EXTRACT(DOW FROM ${dataExpr})::int AS dia_semana,
    (SELECT row_to_json(x) FROM (
       SELECT nao_atende, ${hhmm('hora_inicio')} AS hora_inicio, ${hhmm('hora_fim')} AS hora_fim
       FROM tab_agenda_profissional_excecao
       WHERE profissional_id = $1 AND empresa_id = $2 AND data = ${dataExpr} LIMIT 1) x) AS excecao,
    (SELECT row_to_json(x) FROM (
       SELECT ativo, ${hhmm('hora_inicio')} AS hora_inicio, ${hhmm('hora_fim')} AS hora_fim
       FROM tab_agenda_profissional
       WHERE profissional_id = $1 AND empresa_id = $2 AND dia_semana = EXTRACT(DOW FROM ${dataExpr})::int LIMIT 1) x) AS agenda,
    (SELECT COALESCE(json_agg(json_build_object('hora_inicio', ${hhmm('hora_inicio')}, 'hora_fim', ${hhmm('hora_fim')})), '[]'::json)
       FROM tab_agenda_profissional_pausa
       WHERE profissional_id = $1 AND empresa_id = $2 AND dia_semana = EXTRACT(DOW FROM ${dataExpr})::int) AS pausas`
}

// horaInicio/horaFim no formato HH:MM (horário local da clínica)
export function avaliarDisponibilidade(
  dados: DadosDisponibilidade,
  horaInicio: string,
  horaFim: string,
): ResultadoDisponibilidade {
  const { excecao, agenda, pausas } = dados

  if (excecao) {
    if (excecao.nao_atende) {
      return { disponivel: false, razao: 'Profissional não atende nesta data (exceção)' }
    }
    // Horário especial no dia: o slot precisa caber nele
    if (excecao.hora_inicio && excecao.hora_fim) {
      if (horaInicio < excecao.hora_inicio || horaFim > excecao.hora_fim) {
        return {
          disponivel: false,
          razao: `Neste dia o profissional atende apenas de ${excecao.hora_inicio} a ${excecao.hora_fim}`,
        }
      }
    }
    return { disponivel: true }
  }

  if (!agenda || !agenda.ativo) {
    return { disponivel: false, razao: `Profissional não atende ${NOMES_DIA[dados.dia_semana]}` }
  }
  if (horaInicio < agenda.hora_inicio || horaFim > agenda.hora_fim) {
    return {
      disponivel: false,
      razao: `Profissional atende apenas de ${agenda.hora_inicio} a ${agenda.hora_fim} neste dia`,
    }
  }
  for (const pausa of pausas ?? []) {
    if (horaInicio < pausa.hora_fim && horaFim > pausa.hora_inicio) {
      return { disponivel: false, razao: `Conflito com período de pausa (${pausa.hora_inicio} - ${pausa.hora_fim})` }
    }
  }
  return { disponivel: true }
}
