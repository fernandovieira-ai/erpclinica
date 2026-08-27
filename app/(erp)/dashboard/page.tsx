import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import AgendamentosWidget from '@/components/dashboard/AgendamentosWidget'
import EmpresaBadge from '@/components/dashboard/EmpresaBadge'

export default async function DashboardPage() {
  const session = await requireSession()

  const db = getDb(session.database_name)
  const { rows } = await db.query<{ razao_social: string; nome_fantasia: string | null }>(
    `SELECT razao_social, nome_fantasia FROM tab_empresa WHERE id = $1`,
    [session.empresa_id_ativa],
  )
  const empresa = rows[0]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        {empresa && (
          <EmpresaBadge nome={empresa.nome_fantasia || empresa.razao_social} />
        )}
      </div>

      <div className="page-body">
        <div style={{ padding: '32px 0 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--texto-principal)', marginBottom: 4 }}>
            Bem-vindo, {session.nome}!
          </div>
          <div style={{ fontSize: 13, color: 'var(--texto-terciario)' }}>
            Resumo dos agendamentos de hoje
          </div>
        </div>

        <AgendamentosWidget />
      </div>
    </>
  )
}
