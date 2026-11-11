'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Conversa } from '@/types/mensagem.types'
import { tocarAlertaMensagem } from './somAlerta'

const INTERVALO_SOM_MS = 4000

// Mantém a lista de conversas e escuta o SSE de /api/mensagens/stream.
// `tick` incrementa a cada evento 'update' — o painel de thread aberta usa
// isso como gatilho pra refazer o fetch da conversa ativa (novas mensagens
// chegando ou confirmação de leitura do outro lado).
export function useMensagens() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [tick, setTick]           = useState(0)

  const refetchConversas = useCallback(async () => {
    try {
      const res = await fetch('/api/mensagens/conversas')
      if (!res.ok) return
      const novas: Conversa[] = (await res.json()).dados ?? []
      setConversas(novas)
    } catch {
      // tentativa seguinte do SSE cobre uma falha pontual
    }
  }, [])

  useEffect(() => {
    refetchConversas()

    const es = new EventSource('/api/mensagens/stream')
    es.addEventListener('update', () => {
      setTick(t => t + 1)
      refetchConversas()
    })
    // readyState CLOSED num 'error' significa que o servidor rejeitou a conexão
    // (ex.: sessão expirou, 401) — o EventSource não vai reabrir sozinho nesse caso,
    // então não há retry indevido a cortar. Uma falha de rede transitória deixa o
    // readyState em CONNECTING e o próprio EventSource tenta de novo (comportamento
    // nativo, não precisa de código aqui).
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        console.warn('[mensagens] conexão SSE encerrada pelo servidor')
      }
    }

    return () => es.close()
  }, [refetchConversas])

  const totalNaoLidas = conversas.reduce(
    (acc, c) => acc + c.nao_lidas + (c.pendente_grupo && !c.ultima_mensagem_de_mim ? 1 : 0),
    0,
  )
  // Reflete o estado atual (não um evento pontual): enquanto houver algo pendente
  // o indicador visual (CSS infinite) e o som continuam, e param sozinhos assim que
  // totalNaoLidas volta a 0 (mensagem lida / fila assumida por alguém) — "toca até
  // alguém atender", não só um aviso de 2s na chegada.
  const pulsando = totalNaoLidas > 0
  // Som toca pra qualquer mensagem não lida (individual ou fila da Recepção) —
  // mesmo alerta de piscar + apitar até alguém abrir a conversa.
  useEffect(() => {
    if (!pulsando) return
    tocarAlertaMensagem()
    const id = setInterval(tocarAlertaMensagem, INTERVALO_SOM_MS)
    return () => clearInterval(id)
  }, [pulsando])

  return { conversas, totalNaoLidas, tick, pulsando, refetchConversas }
}
