'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileSignature, Loader2, RefreshCw, X } from 'lucide-react'

interface PacienteMemed {
  idExterno:       string
  nome:            string
  cpf:             string
  sexo:            'Masculino' | 'Feminino'
  data_nascimento: string
  telefone?:       string
  endereco?:       string
  cidade?:         string
}

declare global {
  interface Window {
    MdSinapsePrescricao?: {
      event: { add: (eventName: string, callback: (module: { name: string }) => void) => void }
    }
    MdHub?: {
      module:  { show: (moduleName: string) => void; hide: (moduleName: string) => void }
      command: { send: (moduleName: string, command: string, payload: Record<string, unknown>) => Promise<unknown> }
      event:   { add: (eventName: string, callback: (data: unknown) => void) => void }
    }
  }
}

const MEMED_COR  = '#059669'
// Homologação: https://doc.memed.com.br/docs/primeiros-passos — produção usa outro
// script, fornecido pela Memed junto das chaves de produção (setar NEXT_PUBLIC_MEMED_SCRIPT_URL).
const SCRIPT_SRC = process.env.NEXT_PUBLIC_MEMED_SCRIPT_URL || 'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js'

// ─────────────────────────────────────────────────────────────────────────────
// Estado do hub da Memed — vive fora do React porque o hub em si (window.MdHub)
// é um singleton por ABA do navegador, não por componente. Depois que o script
// carrega e autentica um prescritor uma vez, recarregar o <script> com outro
// data-token não reinicializa nada (a Memed ignora a segunda tag) e o evento
// core:moduleInit nunca dispara de novo — é por isso que "fechar e abrir de
// novo" travava em "carregando": o código ficava esperando um callback que
// nunca viria. A partir daqui, o hub só é inicializado uma vez por aba; toda
// reabertura reaproveita o mesmo hub e só troca o paciente exibido.
let hubProfissionalId: number | null = null
let hubPronto = false
let scriptCarregando: Promise<void> | null = null
let listenersRegistrados = false

interface ContextoAtivo {
  agendamentoId: number
  onEmitida?:    () => void
  onFechado:     () => void
}
let contextoAtivo: ContextoAtivo | null = null

interface MedicamentoPrescrito { nome?: string; posologia?: string }
interface PrescricaoImpressaPayload {
  id?: string | number
  prescriptionUuid?: string
  medicamentos?: MedicamentoPrescrito[]
}

// Formato documentado em doc.memed.com.br/docs/frontend/eventos-mdhub/prescricao-impressa —
// não existe campo de URL direta do PDF no payload; guardamos o id da prescrição e um
// resumo dos medicamentos, e a Memed mantém o histórico completo pesquisável por CPF.
async function salvarHistorico(dadosEvento: unknown) {
  const ctx = contextoAtivo
  if (!ctx) return
  try {
    const dados  = (dadosEvento ?? {}) as PrescricaoImpressaPayload
    const resumo = Array.isArray(dados.medicamentos)
      ? dados.medicamentos.map(m => [m.nome, m.posologia].filter(Boolean).join(' — ')).filter(Boolean).join('; ')
      : null
    await fetch('/api/clinica/receitas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agendamento_id:      ctx.agendamentoId,
        memed_prescricao_id: (dados.id != null ? String(dados.id) : dados.prescriptionUuid) ?? null,
        medicamentos:        resumo,
      }),
    })
    toast.success('Receita emitida e registrada no histórico')
    ctx.onEmitida?.()
  } catch {
    toast.error('Receita emitida, mas houve falha ao salvar no histórico')
  }
}

// Registrado uma única vez por aba — a Memed não expõe um "event.remove", então em
// vez de reregistrar a cada abertura (o que acumularia listeners duplicados), um único
// listener persistente delega para o contexto (agendamento) ativo no momento do evento.
function registrarListenersUmaVez() {
  if (listenersRegistrados || !window.MdHub) return
  listenersRegistrados = true
  window.MdHub.event.add('prescricaoImpressa', salvarHistorico)
  // Dispara quando o próprio usuário fecha o módulo pela UI da Memed (não só quando
  // chamamos module.hide) — mantém nosso painel sincronizado nesse caso também.
  window.MdSinapsePrescricao?.event.add('core:moduleHide', (module: { name: string }) => {
    if (module.name === 'plataforma.prescricao') contextoAtivo?.onFechado()
  })
}

function carregarScript(token: string): Promise<void> {
  if (scriptCarregando) return scriptCarregando
  scriptCarregando = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.setAttribute('data-token', token)
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => { scriptCarregando = null; reject(new Error('Falha ao carregar o script da Memed')) }
    document.body.appendChild(script)
  })
  return scriptCarregando
}

type Status = 'loading' | 'aberta' | 'error'

interface Props {
  agendamentoId:  number
  profissionalId: number
  onFechar:       () => void
  onEmitida?:     () => void
}

export default function MemedPrescricao({ agendamentoId, profissionalId, onFechar, onEmitida }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [erro,   setErro]   = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  // onFechar/onEmitida são recriados a cada render do componente pai (ver HistoricoClinico) —
  // via ref pra não reiniciar iniciar() (e reautenticar na Memed) a cada re-render, mesmo
  // motivo do onDadosExtraidosRef em VoaPluginView.tsx.
  const onFecharRef  = useRef(onFechar)
  const onEmitidaRef = useRef(onEmitida)
  useEffect(() => { onFecharRef.current = onFechar }, [onFechar])
  useEffect(() => { onEmitidaRef.current = onEmitida }, [onEmitida])

  useEffect(() => {
    let cancelado = false

    async function abrirComPaciente(paciente: PacienteMemed) {
      if (!window.MdHub) return
      registrarListenersUmaVez()
      contextoAtivo = {
        agendamentoId,
        onEmitida: () => onEmitidaRef.current?.(),
        onFechado: () => { if (!cancelado) onFecharRef.current() },
      }
      try {
        // command.send devolve um thenable próprio do SDK da Memed (nem sempre implementa
        // .catch) — Promise.resolve normaliza pra uma Promise de verdade antes de encadear.
        await Promise.resolve(window.MdHub.command.send('plataforma.prescricao', 'setPaciente', { ...paciente }))
        window.MdHub.module.show('plataforma.prescricao')
        if (!cancelado) setStatus('aberta')
      } catch {
        if (!cancelado) { setStatus('error'); setErro('Falha ao configurar o paciente na Memed') }
      }
    }

    async function iniciar() {
      setStatus('loading')
      setErro(null)
      try {
        if (hubPronto && hubProfissionalId !== null && hubProfissionalId !== profissionalId) {
          throw new Error('Já há uma prescrição da Memed aberta nesta aba para outro profissional. Feche a aba/recarregue a página para trocar de profissional.')
        }

        const res  = await fetch('/api/clinica/memed/prescritor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agendamento_id: agendamentoId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.erro || 'Não foi possível autenticar com a Memed')
        if (cancelado) return

        if (hubPronto) {
          // Hub já inicializado nesta aba — reabre direto, sem recarregar o script.
          await abrirComPaciente(data.paciente)
          return
        }

        hubProfissionalId = profissionalId
        await carregarScript(data.token)
        if (cancelado) return

        await new Promise<void>(resolve => {
          window.MdSinapsePrescricao?.event.add('core:moduleInit', (module: { name: string }) => {
            if (module.name !== 'plataforma.prescricao') return
            hubPronto = true
            resolve()
          })
        })
        if (cancelado) return
        await abrirComPaciente(data.paciente)
      } catch (e) {
        if (cancelado) return
        setStatus('error')
        setErro(e instanceof Error ? e.message : String(e))
      }
    }

    iniciar()

    // Some o módulo sempre que o painel desmonta, mesmo quando não é pelo botão "Fechar"
    // daqui (ex: usuário clica em "Editar prontuário" com a Memed aberta) — evita deixar
    // a tela cheia da Memed órfã, sem nosso painel pra fechá-la depois.
    return () => { cancelado = true; window.MdHub?.module.hide('plataforma.prescricao') }
  }, [agendamentoId, profissionalId, tentativa])

  return (
    <div style={{ border: '1px solid var(--borda-media)', borderRadius: 6, overflow: 'hidden', backgroundColor: 'var(--bg-input)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
        borderBottom: `2px solid ${MEMED_COR}`, backgroundColor: 'var(--bg-card)',
      }}>
        <FileSignature size={13} style={{ color: MEMED_COR }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: MEMED_COR }}>Memed</span>
        <span style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
          {status === 'loading' && '· conectando...'}
          {status === 'aberta'  && '· aberta em tela cheia'}
          {status === 'error'   && '· erro'}
        </span>
        <button
          type="button"
          onClick={onFechar}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', padding: 2 }}
          title="Fechar"
        >
          <X size={14} />
        </button>
      </div>

      {status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 20, fontSize: 12, color: 'var(--texto-terciario)' }}>
          <Loader2 size={14} className="spin" /> Carregando Memed...
        </div>
      )}

      {status === 'aberta' && (
        <div style={{ padding: '10px 12px', fontSize: 11.5, color: 'var(--texto-secundario)' }}>
          A prescrição da Memed abriu em tela cheia. Ao finalizar e emitir a receita, ela é
          salva automaticamente aqui no histórico do paciente.
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
    </div>
  )
}
