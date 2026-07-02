import { requireSession } from '@/lib/auth/server-session'
import AgendamentosWidget from '@/components/dashboard/AgendamentosWidget'

export default async function DashboardPage() {
  const session = await requireSession()

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
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
