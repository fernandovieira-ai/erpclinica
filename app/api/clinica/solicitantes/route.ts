import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDb } from '@/lib/db'

// GET /api/clinica/solicitantes
// Lista pra alimentar o dropdown "Médico Solicitante" do recebimento: profissionais da
// própria clínica (ind_profissional, exceto o placeholder eh_clinica) + médicos externos
// cadastrados só como solicitante (ind_solicitante) — ver novos/76_medico_solicitante_externo.sql.
// Não usar essa rota pra "Médico Executor" nem pra nenhum seletor de agenda/escala: quem
// só tem ind_solicitante não é profissional da clínica (externo = true identifica isso).
// Sem filtro de busca por nome: a lista é pequena, o front (BuscarSolicitante em
// RecebimentoModal.tsx) busca ela inteira uma vez e filtra localmente conforme digita.
export async function GET(req: NextRequest) {
  const session = await getSession(req)
  if (!session) return NextResponse.json({ erro: 'Não autenticado' }, { status: 401 })

  const db = getDb(session.database_name)

  const { rows } = await db.query(
    `SELECT p.id, p.nome, p.crm, p.crm_uf, (p.ind_profissional = false) AS externo
     FROM tab_pessoa p
     WHERE p.empresa_id = $1 AND p.ativo = true AND p.eh_clinica = false
       AND (p.ind_profissional = true OR p.ind_solicitante = true)
     ORDER BY p.nome`,
    [session.empresa_id_ativa],
  )

  return NextResponse.json({ dados: rows })
}
