'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, RefreshCw, X } from 'lucide-react'

interface VoaMessage {
  eventName: string
  eventData?: Record<string, unknown>
}

interface VoaMountOptions {
  doctorId: string
  patientId: string
  consultationId: string
  options: {
    renderElement: HTMLElement
    darkMode?: boolean
    enableFillEhr?: boolean
    consultationType?: 'IN_PERSON' | 'TELEMEDICINE'
    structuredOutputSchema?: Record<string, unknown>
  }
}

// Campos que a Voa tenta extrair da consulta gravada e devolve via
// evento voa.plugin.ehr.structured_output — chaves iguais às do nosso prontuário
// (peso/pressão ficam de fora: são valores curtos/numéricos, melhor digitados à mão).
const PRONTUARIO_SCHEMA = {
  type: 'object',
  properties: {
    queixas:                 { type: 'string', description: 'Queixas principais relatadas pelo paciente no início da consulta' },
    hda:                     { type: 'string', description: 'História da doença atual' },
    antecedentes_familiares: { type: 'string', description: 'Antecedentes familiares relevantes mencionados na consulta' },
    antecedentes_pessoais:   { type: 'string', description: 'Antecedentes pessoais / histórico médico do paciente' },
    habitos:                 { type: 'string', description: 'Hábitos de vida do paciente: alimentação, atividade física, tabagismo, álcool etc.' },
    alergias:                { type: 'string', description: 'Alergias relatadas pelo paciente' },
    exame_fisico:            { type: 'string', description: 'Achados do exame físico realizado durante a consulta' },
    exames:                  { type: 'string', description: 'Exames solicitados ou resultados de exames mencionados' },
    diagnostico:             { type: 'string', description: 'Diagnóstico ou hipótese diagnóstica' },
    medicacao:               { type: 'string', description: 'Medicações prescritas ou em uso relatadas na consulta' },
    outras_condutas:         { type: 'string', description: 'Outras condutas, orientações ou encaminhamentos dados ao paciente' },
  },
}

declare global {
  interface Window {
    VoaPlugin?: {
      instance: {
        init: (opts: { token: string }) => Promise<void>
        mount: (opts: VoaMountOptions) => void
        unmount: () => void
        addMessageListener: (cb: (msg: VoaMessage) => void) => void
        removeMessageListener: (cb: (msg: VoaMessage) => void) => void
      }
    }
  }
}

const VOA_COR = '#7C3AED'
const SCRIPT_SRC = 'https://integration.voa.health/plugin.js'
let scriptPromise: Promise<void> | null = null
let ultimoUnmountMs = 0
const MIN_DELAY_REINIT = 1000 // ms mínimos entre unmount e próximo init (servidor precisa fechar sessão anterior)
const INIT_TIMEOUT_MS  = 15000 // timeout para o init() — evita ficar preso em "conectando..."

function carregarScript(): Promise<void> {
  if (window.VoaPlugin) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.type = 'module'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Falha ao carregar o script da Voa'))
    document.head.appendChild(script)
  })
  return scriptPromise
}

type Status = 'loading' | 'ready' | 'error' | 'closed'

interface Props {
  agendamentoId:     number
  doctorId:          number
  patientId:         number
  onFechar:          () => void
  onDadosExtraidos?: (dados: Record<string, string>) => void
}

export default function VoaPluginView({ agendamentoId, doctorId, patientId, onFechar, onDadosExtraidos }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [erro,   setErro]   = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  // Ref para não reiniciar o plugin a cada re-render do formulário (o callback muda de
  // identidade a cada keystroke do pai, mas isso não deve remontar o widget da Voa).
  const onDadosExtraidosRef = useRef(onDadosExtraidos)
  useEffect(() => { onDadosExtraidosRef.current = onDadosExtraidos }, [onDadosExtraidos])

  useEffect(() => {
    let cancelado = false
    let handler: ((msg: VoaMessage) => void) | undefined

    async function iniciar() {
      setStatus('loading')
      setErro(null)
      try {
        // Aguarda o SDK da Voa terminar o unmount anterior antes de reinicializar
        const elapsed = Date.now() - ultimoUnmountMs
        if (elapsed < MIN_DELAY_REINIT) {
          await new Promise(r => setTimeout(r, MIN_DELAY_REINIT - elapsed))
        }
        if (cancelado) return

        const res  = await fetch('/api/voa/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agendamento_id: agendamentoId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.erro || 'Não foi possível autenticar com a Voa')
        if (cancelado) return

        await carregarScript()
        if (cancelado || !window.VoaPlugin || !containerRef.current) {
          throw new Error('Plugin da Voa indisponível')
        }

        // Registra listener antes do init para não perder o evento ready
        handler = (message) => {
          if (!message || typeof message.eventName !== 'string') return
          switch (message.eventName) {
            case 'voa.plugin.error.auth':
              setStatus('error'); setErro('Sessão da Voa expirou ou o token é inválido.'); break
            case 'voa.plugin.ready':
              setStatus('ready'); break
            case 'voa.plugin.closed':
              setStatus('closed'); break
            case 'voa.plugin.ehr.structured_output': {
              const dados = message.eventData
              if (dados && typeof dados === 'object') {
                const limpo: Record<string, string> = {}
                for (const [chave, valor] of Object.entries(dados)) {
                  if (typeof valor === 'string' && valor.trim()) limpo[chave] = valor
                }
                if (Object.keys(limpo).length > 0) onDadosExtraidosRef.current?.(limpo)
              }
              break
            }
          }
        }
        window.VoaPlugin.instance.addMessageListener(handler)

        // Init com timeout — evita ficar preso em "conectando..." se o servidor
        // ainda não fechou a sessão anterior com o mesmo consultationId
        await Promise.race([
          window.VoaPlugin.instance.init({ token: data.token }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout ao conectar com a Voa. Tente novamente.')), INIT_TIMEOUT_MS)
          ),
        ])
        if (cancelado) return

        window.VoaPlugin.instance.mount({
          doctorId:       String(doctorId),
          patientId:      String(patientId),
          consultationId: String(agendamentoId),
          options: {
            renderElement:          containerRef.current,
            darkMode:               false,
            enableFillEhr:          false,
            consultationType:       'IN_PERSON',
            structuredOutputSchema: PRONTUARIO_SCHEMA,
          },
        })
      } catch (e) {
        if (cancelado) return
        setStatus('error')
        setErro(e instanceof Error ? e.message : String(e))
      }
    }

    iniciar()

    return () => {
      cancelado = true
      if (handler) window.VoaPlugin?.instance?.removeMessageListener(handler)
      window.VoaPlugin?.instance?.unmount()
      ultimoUnmountMs = Date.now()
    }
  }, [agendamentoId, doctorId, patientId, tentativa])

  return (
    <div style={{
      border: '1px solid var(--borda-media)', borderRadius: 6, overflow: 'hidden',
      backgroundColor: 'var(--bg-input)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
        borderBottom: `2px solid ${VOA_COR}`, backgroundColor: 'var(--bg-card)',
      }}>
        <Mic size={13} style={{ color: VOA_COR }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: VOA_COR }}>Voa</span>
        <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
          {status === 'loading' && '· conectando...'}
          {status === 'ready'   && '· gravando'}
          {status === 'closed'  && '· sessão encerrada'}
          {status === 'error'   && '· erro'}
        </span>
        <button
          type="button"
          onClick={onFechar}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', padding: 2,
          }}
          title="Fechar"
        >
          <X size={14} />
        </button>
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 20, fontSize: 12, color: 'var(--texto-terciario)' }}>
          <Loader2 size={14} className="spin" /> Carregando Voa...
        </div>
      )}

      {status === 'error' && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--cor-erro)' }}>{erro}</div>
          <button
            type="button"
            onClick={() => setTentativa(t => t + 1)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, width: 'fit-content',
              padding: '4px 10px', fontSize: 11.5, background: 'none',
              border: '1px solid var(--borda-media)', borderRadius: 4, cursor: 'pointer',
              color: 'var(--texto-secundario)',
            }}
          >
            <RefreshCw size={12} /> Tentar novamente
          </button>
        </div>
      )}

      <div ref={containerRef} style={{ width: '100%', height: status === 'ready' ? 560 : 0 }} />

      {status === 'ready' && (
        <div style={{
          padding: '6px 10px', fontSize: 11, color: 'var(--texto-terciario)',
          borderTop: '1px solid var(--borda-suave)', backgroundColor: 'var(--bg-card)',
        }}>
          Ao finalizar, clique em <strong>&quot;Preencher prontuário&quot;</strong> dentro da Voa para trazer os dados para os campos abaixo.
        </div>
      )}
    </div>
  )
}
