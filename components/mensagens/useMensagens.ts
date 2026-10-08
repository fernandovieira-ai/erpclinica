'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Conversa } from '@/types/mensagem.types'

const DURACAO_PULSO_MS = 2200

// Mantém a lista de conversas e escuta o SSE de /api/mensagens/stream.
// `tick` incrementa a cada evento 'update' — o painel de thread aberta usa
// isso como gatilho pra refazer o fetch da conversa ativa (novas mensagens
// chegando ou confirmação de leitura do outro lado).
// Compara a lista nova com a anterior pra detectar mensagem recebida (nao_lidas
// subiu) e fazer o indicador pulsar por alguns segundos — sem alertar no
// carregamento inicial da página (só em mudanças depois disso). O destaque da
// mensagem em si não precisa de temporizador: ela fica visível na lista até o
// usuário abrir a conversa (nao_lidas volta a 0 e ela some sozinha da lista).
export function useMensagens() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [tick, setTick]           = useState(0)
  const [pulsando, setPulsando]   = useState(false)

  const conversasRef = useRef<Conversa[]>([])
  const primeiraCargaRef = useRef(true)
  const pulsoTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const refetchConversas = useCallback(async () => {
    try {
      const res = await fetch('/api/mensagens/conversas')
      if (!res.ok) return
      const novas: Conversa[] = (await res.json()).dados ?? []
      const anteriores = conversasRef.current

      if (!primeiraCargaRef.current) {
        const chegouAlgo = novas.some(c => {
          if (c.ultima_mensagem_de_mim || c.nao_lidas === 0) return false
          const antes = anteriores.find(a => a.usuario_id === c.usuario_id)
          return !antes || c.nao_lidas > antes.nao_lidas
        })
        if (chegouAlgo) {
          setPulsando(true)
          clearTimeout(pulsoTimerRef.current)
          pulsoTimerRef.current = setTimeout(() => setPulsando(false), DURACAO_PULSO_MS)
        }
      }

      primeiraCargaRef.current = false
      conversasRef.current = novas
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

  const totalNaoLidas = conversas.reduce((acc, c) => acc + c.nao_lidas, 0)

  return { conversas, totalNaoLidas, tick, pulsando, refetchConversas }
}
