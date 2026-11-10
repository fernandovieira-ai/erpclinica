'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

const INTERVALO_MS = 90_000 // 90s - deploy não é um evento frequente, não precisa checar rápido
const ESPERA_ANTES_RECARREGAR_MS = 4000 // dá tempo da pessoa ver o aviso antes do reload

// Detecta quando o servidor subiu uma versão nova (deploy no Railway, ou o próprio
// `next dev` reiniciando em desenvolvimento) e recarrega a página sozinho, sem
// precisar de F5 manual. Funciona comparando a marca de "quando o processo do
// servidor subiu" (GET /api/versao) com o valor capturado no primeiro carregamento
// desta aba - muda sozinho a cada redeploy (processo novo), sem precisar de hash de
// build do Next nem de variável específica da hospedagem.
export default function AtualizadorVersao() {
  const versaoRef = useRef<number | null>(null)
  const recarregandoRef = useRef(false)

  useEffect(() => {
    let cancelado = false

    const checar = async () => {
      try {
        const res = await fetch('/api/versao', { cache: 'no-store' })
        if (!res.ok) return
        const { versao } = await res.json()

        if (versaoRef.current === null) {
          versaoRef.current = versao
          return
        }
        if (versao !== versaoRef.current && !recarregandoRef.current) {
          recarregandoRef.current = true
          toast.message('Nova versão do sistema disponível — atualizando...', { duration: ESPERA_ANTES_RECARREGAR_MS })
          setTimeout(() => { if (!cancelado) window.location.reload() }, ESPERA_ANTES_RECARREGAR_MS)
        }
      } catch {
        // falha pontual de rede - tentativa seguinte do polling cobre
      }
    }

    checar()
    const id = setInterval(checar, INTERVALO_MS)
    return () => { cancelado = true; clearInterval(id) }
  }, [])

  return null
}
