// Integração server-side com a API da Voa (contexto do atendimento).
// Nunca importar isso em um Client Component - authToken vem de tab_empresa, por
// tenant, nunca deve chegar no frontend.
import type { Pool } from 'pg'

const VOA_API_URL = 'https://integration.voa.health/api/v1'

const CAMPOS_CONTEXTO: [string, string][] = [
  ['Queixas',                 'queixas'],
  ['HDA',                     'hda'],
  ['Diagnóstico',             'diagnostico'],
  ['Medicação',               'medicacao'],
  ['Alergias',                'alergias'],
  ['Antecedentes pessoais',   'antecedentes_pessoais'],
  ['Antecedentes familiares', 'antecedentes_familiares'],
  ['Hábitos',                 'habitos'],
  ['Exame físico',            'exame_fisico'],
  ['Exames',                  'exames'],
  ['Outras condutas',         'outras_condutas'],
]

const MAX_CONSULTAS_CONTEXTO = 10

function formatarBlocoConsulta(p: Record<string, unknown>): string | null {
  const linhas = CAMPOS_CONTEXTO
    .map(([label, chave]) => {
      const valor = p[chave]
      return typeof valor === 'string' && valor.trim() ? `- **${label}:** ${valor.trim()}` : null
    })
    .filter((l): l is string => !!l)
  if (linhas.length === 0) return null
  const data = p.created_at ? new Date(p.created_at as string).toLocaleDateString('pt-BR') : 'data desconhecida'
  return `### Consulta em ${data}\n${linhas.join('\n')}`
}

// Histórico de prontuários anteriores do paciente (exceto o do atendimento atual, que
// ainda não existe ou está sendo criado agora), formatado em markdown pro campo
// "Contexto do paciente" da Voa - informação clínica que não vem da gravação desta consulta.
export async function montarContextoHistorico(
  db: Pool, empresaId: number, pacienteId: number, agendamentoAtualId: number,
): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT created_at, queixas, hda, antecedentes_familiares, antecedentes_pessoais,
            habitos, alergias, exame_fisico, exames, diagnostico, medicacao, outras_condutas
     FROM tab_prontuario
     WHERE empresa_id = $1 AND paciente_id = $2 AND agendamento_id <> $3
     ORDER BY created_at DESC
     LIMIT $4`,
    [empresaId, pacienteId, agendamentoAtualId, MAX_CONSULTAS_CONTEXTO],
  )
  const blocos = rows.map(formatarBlocoConsulta).filter((b): b is string => !!b)
  if (blocos.length === 0) return null
  return `## Histórico de consultas anteriores\n\n${blocos.join('\n\n')}`
}

// Pré-cria o atendimento na Voa (POST /ehr/) já com o histórico do paciente em
// extra.context, antes do widget ser montado no frontend. Evita depender do
// addBackgroundHistory via JS, que só funciona se o profissional já tiver aberto
// manualmente a aba "Contexto do atendimento" dentro da própria Voa (o campo só existe,
// e só registra o callback, depois de montado - não temos como saber quando isso ocorre).
//
// Endpoint não documentado publicamente pela Voa - confirmado via teste direto (2026-07-28):
// idempotente por consultation_id (POST repetido reaproveita o mesmo EHR e NÃO sobrescreve
// o contexto já salvo - por isso só vale a pena chamar quando há contexto novo pra mandar).
// Nunca lança - é um "nice to have"; se falhar, a consulta segue normalmente sem o contexto.
export async function criarAtendimentoVoaComContexto(params: {
  authToken:      string
  consultationId: string
  doctorId:       string
  patientId:      string
  contexto:       string
}): Promise<void> {
  try {
    const res = await fetch(`${VOA_API_URL}/ehr/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-voa-token': params.authToken },
      body: JSON.stringify({
        type:            'IN_PERSON',
        consultation_id: params.consultationId,
        doctor_id:       params.doctorId,
        patient_id:      params.patientId,
        extra:           { context: params.contexto },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.error('Falha ao pré-criar atendimento na Voa com contexto:', res.status, await res.text().catch(() => ''))
    }
  } catch (error) {
    console.error('Erro ao conectar com a Voa (pré-criar atendimento com contexto):', error)
  }
}
