'use client'

import { createContext, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMensagens } from './useMensagens'
import MensagensPanel from './MensagensPanel'

interface MensagensContextValue {
  totalNaoLidas: number
  pulsando:      boolean
  conversasNaoLidas: ReturnType<typeof useMensagens>['conversas']
  chatOpen:      boolean
  abrirPainel:   (id?: number, nome?: string) => void
  fecharPainel:  () => void
}

const MensagensContext = createContext<MensagensContextValue | null>(null)

// Provider único pro app inteiro: fica acima da Sidebar (que tem position:fixed +
// z-index próprio, criando um contexto de empilhamento) e renderiza o MensagensPanel
// via portal direto no <body>. Sem o portal, qualquer zIndex do painel fica preso
// abaixo do z-index da sidebar quando comparado com um overlay de modal fora dela
// (ex.: o prontuário do paciente) — o painel nunca consegue ficar por cima.
// Isso também permite que qualquer tela (ex.: o modal de prontuário, que não pode
// ser fechado no meio do atendimento) ofereça seu próprio atalho pra abrir o chat,
// sem precisar passar pela Sidebar.
export function MensagensProvider({ meuUsuarioId, children }: { meuUsuarioId: number; children: React.ReactNode }) {
  const { conversas, totalNaoLidas, tick, pulsando, refetchConversas } = useMensagens()
  const [chatOpen, setChatOpen] = useState(false)
  const [pedidoAbrir, setPedidoAbrir] = useState<{ id: number; nome: string; ts: number } | null>(null)

  function abrirPainel(id?: number, nome?: string) {
    setChatOpen(true)
    if (id != null && nome != null) setPedidoAbrir({ id, nome, ts: Date.now() })
  }

  const conversasNaoLidas = conversas.filter(c => c.nao_lidas > 0)

  return (
    <MensagensContext.Provider
      value={{ totalNaoLidas, pulsando, conversasNaoLidas, chatOpen, abrirPainel, fecharPainel: () => setChatOpen(false) }}
    >
      {children}
      {typeof document !== 'undefined' && createPortal(
        <MensagensPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          conversas={conversas}
          tick={tick}
          meuUsuarioId={meuUsuarioId}
          onRefetchConversas={refetchConversas}
          pedidoAbrir={pedidoAbrir}
        />,
        document.body,
      )}
    </MensagensContext.Provider>
  )
}

export function useMensagensContext() {
  const ctx = useContext(MensagensContext)
  if (!ctx) throw new Error('useMensagensContext precisa estar dentro de MensagensProvider')
  return ctx
}
