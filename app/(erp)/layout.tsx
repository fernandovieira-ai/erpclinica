import { requireSession } from '@/lib/auth/server-session'
import Sidebar from '@/components/layout/Sidebar'
import { MensagensProvider } from '@/components/mensagens/MensagensContext'
import AtualizadorVersao from '@/components/layout/AtualizadorVersao'

export const dynamic = 'force-dynamic'

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <MensagensProvider meuUsuarioId={session.usuario_id}>
      <AtualizadorVersao />
      <div style={{ display: 'flex' }}>
        <Sidebar session={session} />
        <div className="content-area" tabIndex={-1} style={{ flex: 1, outline: 'none' }}>
          {children}
        </div>
      </div>
    </MensagensProvider>
  )
}
