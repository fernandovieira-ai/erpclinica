import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// Duração do token: cobre a duração média de uma consulta com folga
const EXPIRATION_SEGUNDOS = 43_200 // 12h

// POST /api/voa/token — gera o token da Voa para uma consulta específica,
// usando a configuração (token + ambiente) da empresa ativa na sessão.
export async function POST(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const agendamentoId = Number(body?.agendamento_id)
  if (!agendamentoId) {
    return NextResponse.json({ erro: 'agendamento_id é obrigatório' }, { status: 400 })
  }

  const db = getDb(session.database_name)

  // Nunca confiar em doctorId/patientId vindos do cliente — busca no banco pelo agendamento,
  // já trazendo a configuração da empresa na mesma consulta (evita um round-trip extra).
  const { rows } = await db.query(
    `SELECT a.id, a.paciente_id, a.profissional_id, e.voa_auth_token, e.voa_ambiente
     FROM tab_agendamento a
     JOIN tab_empresa e ON e.id = a.empresa_id
     WHERE a.id = $1 AND a.empresa_id = $2`,
    [agendamentoId, session.empresa_id_ativa],
  )
  if (rows.length === 0) {
    return NextResponse.json({ erro: 'Agendamento não encontrado' }, { status: 404 })
  }

  const agendamento = rows[0]
  const authToken   = agendamento.voa_auth_token
  const ambiente     = agendamento.voa_ambiente ?? 'desenvolvimento'
  if (!authToken) {
    return NextResponse.json(
      { erro: 'Integração Voa não configurada para esta empresa (Configurações → Empresa → Integração)' },
      { status: 503 },
    )
  }

  // A Voa documenta o "Auth Token" bruto como modo de desenvolvimento — validado
  // diretamente contra /auth/validate-integration-token/ e reutilizável sem troca por consulta.
  // Pendência: o Bearer Token gerado por /integration/identify/ (fluxo de produção abaixo) não
  // passou nessa validação nos testes (401) — confirmar com integration@voahealth.com antes de
  // usar em produção real.
  if (ambiente !== 'producao') {
    return NextResponse.json({ token: authToken })
  }

  try {
    const res = await fetch('https://api.voa.health/integration/identify/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-voa-token': authToken },
      body: JSON.stringify({
        consultation_id: String(agendamento.id),
        doctor_id:       String(agendamento.profissional_id),
        patient_id:      String(agendamento.paciente_id),
        expiration:      EXPIRATION_SEGUNDOS,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })

    if (!res.ok) {
      const detalhe = await res.text().catch(() => '')
      console.error('Falha ao autenticar com a Voa:', res.status, detalhe)
      return NextResponse.json({ erro: 'Falha ao autenticar com a Voa' }, { status: 502 })
    }

    const data = await res.json()
    return NextResponse.json({ token: data.token })
  } catch (error) {
    console.error('Erro ao conectar com a Voa:', error)
    return NextResponse.json({ erro: 'Erro ao conectar com a Voa' }, { status: 502 })
  }
}
