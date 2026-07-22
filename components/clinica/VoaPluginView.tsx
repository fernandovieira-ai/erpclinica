'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Loader2, Mic, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'

interface VoaMessage {
  eventName: string
  eventData?: unknown
}

interface VoaMountOptions {
  doctorId: string
  patientId: string
  consultationId: string
  options: {
    renderElement: HTMLElement
    darkMode?: boolean
    enableFillEhr?: boolean
    enableFileUpload?: boolean
    consultationType?: 'IN_PERSON' | 'TELEMEDICINE'
    allowChangeConsultationType?: boolean
    structuredOutputSchema?: Record<string, unknown>
    // Documentado só pra instalação via iframe (não confirmado no mount() do SDK
    // plugin.js) — testando se pré-seleciona o template e evita o usuário ter que
    // clicar na aba "Cardiologia" dentro do widget. Se a Voa ignorar, sem problema.
    clinicalType?: string
  }
}

// Campos que a Voa tenta extrair da consulta gravada e devolve via evento
// voa.plugin.ehr.structured_output. "diagnosticos" e "dados_antropometricos" usam os
// campos especiais da Voa ($ref CID / AnthropometricData) — validados e otimizados do
// lado deles, em vez de deixar a IA escrever texto livre pra diagnóstico/peso.
// Pressão fica de fora: não há campo especial equivalente, e é um valor curto — melhor
// digitado à mão (ou vem via parseDocumentoVoa, no fallback do documento completo).
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
    diagnosticos: {
      type: 'array',
      description: 'Diagnósticos ou hipóteses diagnósticas da consulta, um por CID identificado',
      items: { $ref: '#/$defs/CID' },
    },
    dados_antropometricos: { $ref: '#/$defs/AnthropometricData' },
    medicacao:              { type: 'string', description: 'Medicações prescritas ou em uso relatadas na consulta' },
    outras_condutas:        { type: 'string', description: 'Outras condutas, orientações ou encaminhamentos dados ao paciente' },
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
        uploadFiles: (files: File[]) => void
      }
    }
  }
}

const VOA_COR = '#7C3AED'
const SCRIPT_SRC = 'https://integration.voa.health/plugin.js'
let scriptPromise: Promise<void> | null = null
const INIT_TIMEOUT_MS   = 10000 // timeout para o init() — evita preso em "conectando..."
const READY_TIMEOUT_MS  = 12000 // se ready não vier após mount(), exibe container mesmo assim (auth error do Voa)

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

export type Status = 'loading' | 'ready' | 'error' | 'closed'

// Campo especial $ref: "#/$defs/CID" — vem como { code, description } (ou lista deles).
// Formata em texto "CODE — descrição", um por linha, pro nosso campo de diagnóstico.
function formatarDiagnosticosCID(valor: unknown): string | null {
  if (!Array.isArray(valor)) return null
  const linhas = valor
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const { code, description } = item as { code?: unknown; description?: unknown }
      return [code, description].filter(v => typeof v === 'string' && v.trim()).join(' — ')
    })
    .filter((s): s is string => !!s)
  return linhas.length > 0 ? linhas.join('\n') : null
}

// Campo especial $ref: "#/$defs/AnthropometricData" — { weight (kg), height (cm), imc }.
// Altura ainda não tem campo próprio no prontuário; peso e imc têm.
function formatarDadosAntropometricos(valor: unknown): { peso: string | null; imc: string | null } {
  if (!valor || typeof valor !== 'object') return { peso: null, imc: null }
  const { weight, imc } = valor as Record<string, unknown>
  return {
    peso: typeof weight === 'number' && !Number.isNaN(weight) ? String(weight) : null,
    imc:  typeof imc === 'number' && !Number.isNaN(imc) ? String(imc) : null,
  }
}

// voa.plugin.ehr.fill traz eventData.document (doc oficial da Voa) — o objeto com chave
// cobre esse caso. voa.plugin.ehr.document.copied não tem eventData documentado, mas na
// prática chega com o texto solto direto em eventData (confirmado no console) — daí o
// fallback de string. Mantém as outras chaves como proteção caso a Voa mude o formato.
function extrairTextoDocumento(eventData: unknown): string | null {
  if (typeof eventData === 'string' && eventData.trim()) return eventData
  if (eventData && typeof eventData === 'object') {
    for (const chave of ['document', 'content', 'text', 'markdown', 'documentContent']) {
      const valor = (eventData as Record<string, unknown>)[chave]
      if (typeof valor === 'string' && valor.trim()) return valor
    }
  }
  console.warn('[Voa event] documento recebido em formato não reconhecido — payload:', eventData)
  return null
}

// Modelo da Voa (clinicalType) é configurado por tipo de atendimento na tela de
// cadastro (tab_agendamento_tipo.voa_clinical_type) — não fica mais fixo aqui no
// código. Sem configuração pro tipo daquela consulta, cai nesse padrão da clínica.
const CLINICAL_TYPE_PADRAO = 'anamnesisCardiology'

interface Props {
  agendamentoId:     number
  doctorId:          number
  patientId:         number
  voaClinicalType?:  string | null
  onFechar:          () => void
  onDadosExtraidos?: (dados: Record<string, string>) => void
  onDocumentoGerado?: (texto: string) => void
  onStatusChange?:   (status: Status) => void
  onConsultaCriada?: (voaAtendimentoId: string, tipo: string) => void
}

// Permite ao pai empurrar arquivos anexados no NOSSO sistema também pro pipeline
// da Voa (uploadFiles), sem precisar do usuário arrastar de novo na UI dela.
export interface VoaPluginHandle {
  // Retorna false se a Voa não estiver montada/pronta nesse momento (sessão fechada).
  uploadFiles: (files: File[]) => boolean
}

function VoaPluginView(
  { agendamentoId, doctorId, patientId, voaClinicalType, onFechar, onDadosExtraidos, onDocumentoGerado, onStatusChange, onConsultaCriada }: Props,
  ref: React.Ref<VoaPluginHandle>,
) {
  const containerRef   = useRef<HTMLDivElement>(null)
  const [status,       setStatus]       = useState<Status>('loading')
  const [erro,         setErro]         = useState<string | null>(null)
  const [tentativa,    setTentativa]    = useState(0)
  const [showContainer, setShowContainer] = useState(false)

  // Ref para não reiniciar o plugin a cada re-render do formulário (o callback muda de
  // identidade a cada keystroke do pai, mas isso não deve remontar o widget da Voa).
  const onDadosExtraidosRef = useRef(onDadosExtraidos)
  useEffect(() => { onDadosExtraidosRef.current = onDadosExtraidos }, [onDadosExtraidos])
  const onFecharRef = useRef(onFechar)
  useEffect(() => { onFecharRef.current = onFechar }, [onFechar])
  const onDocumentoGeradoRef = useRef(onDocumentoGerado)
  useEffect(() => { onDocumentoGeradoRef.current = onDocumentoGerado }, [onDocumentoGerado])
  const onStatusChangeRef = useRef(onStatusChange)
  useEffect(() => { onStatusChangeRef.current = onStatusChange }, [onStatusChange])
  useEffect(() => { onStatusChangeRef.current?.(status) }, [status])
  const onConsultaCriadaRef = useRef(onConsultaCriada)
  useEffect(() => { onConsultaCriadaRef.current = onConsultaCriada }, [onConsultaCriada])

  useImperativeHandle(ref, () => ({
    uploadFiles: (files: File[]) => {
      if (!window.VoaPlugin || status !== 'ready') return false
      window.VoaPlugin.instance.uploadFiles(files)
      return true
    },
  }), [status])

  useEffect(() => {
    let cancelado = false
    let handler: ((msg: VoaMessage) => void) | undefined

    async function iniciar() {
      setStatus('loading')
      setShowContainer(false)
      setErro(null)
      try {
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
          console.log('[Voa event]', message.eventName, message.eventData)
          switch (message.eventName) {
            case 'voa.plugin.error.auth': {
              // eventData: { message: string } — usa o texto real da Voa em vez de um
              // genérico, ajuda a diferenciar token expirado de token inválido etc.
              const detalhe = message.eventData
              const msg = detalhe && typeof detalhe === 'object' && typeof (detalhe as Record<string, unknown>).message === 'string'
                ? (detalhe as Record<string, unknown>).message as string
                : 'Sessão da Voa expirou ou o token é inválido.'
              setStatus('error'); setErro(msg); break
            }
            case 'voa.plugin.ready':
              setStatus('ready'); setShowContainer(true); break
            case 'voa.plugin.closed':
              // A própria Voa encerrou a sessão (usuário fechou pelo widget dela) — avisa o pai
              // para tirar o "montado", senão o botão volta a oferecer "Retomar Voa" numa sessão
              // que já não existe mais do lado da Voa.
              setStatus('closed'); onFecharRef.current(); break
            case 'voa.plugin.ehr.structured_output': {
              // eventData: { output: {...}, from_cache: boolean } — os campos clínicos ficam
              // dentro de "output", não soltos no eventData (doc oficial da Voa).
              const dados = message.eventData
              const output = dados && typeof dados === 'object' ? (dados as Record<string, unknown>).output : null
              if (output && typeof output === 'object') {
                const limpo: Record<string, string> = {}
                for (const [chave, valor] of Object.entries(output)) {
                  if (chave === 'diagnosticos') {
                    const texto = formatarDiagnosticosCID(valor)
                    if (texto) limpo.diagnostico = texto
                    continue
                  }
                  if (chave === 'dados_antropometricos') {
                    const { peso, imc } = formatarDadosAntropometricos(valor)
                    if (peso) limpo.peso = peso
                    if (imc) limpo.imc = imc
                    continue
                  }
                  if (typeof valor === 'string' && valor.trim()) limpo[chave] = valor
                }
                if (Object.keys(limpo).length > 0) onDadosExtraidosRef.current?.(limpo)
              }
              break
            }
            // voa.plugin.ehr.fill: disparado pelo botão "Preencher prontuário" quando
            // enableFillEhr:true — eventData.document traz o documento inteiro em markdown
            // (fallback via parseDocumentoVoa no pai, junto com o structured_output acima).
            // voa.plugin.ehr.document.copied: botão "Copiar todo o documento" — a doc oficial
            // não documenta eventData pra esse evento, mas na prática vem com o texto direto
            // (confirmado no console); document.created NÃO traz texto (só {id, created_at},
            // por isso fica de fora daqui).
            case 'voa.plugin.ehr.fill':
            case 'voa.plugin.ehr.document.copied': {
              const texto = extrairTextoDocumento(message.eventData)
              if (texto) onDocumentoGeradoRef.current?.(texto)
              break
            }
            // Disparado uma vez, quando a Voa cria o registro interno da consulta —
            // guarda o uuid dela pra rastreabilidade (não crítico, ignora se faltar).
            case 'voa.plugin.ehr.created': {
              const dados = message.eventData
              if (dados && typeof dados === 'object') {
                const id  = (dados as Record<string, unknown>).id
                const tipo = (dados as Record<string, unknown>).type
                if (typeof id === 'string' && id.trim()) {
                  onConsultaCriadaRef.current?.(id, typeof tipo === 'string' ? tipo : '')
                }
              }
              break
            }
            // Upload de exames/laudos feito pelo usuário direto na UI da Voa
            // (enableFileUpload:true) — só feedback visual, o arquivo fica do lado da Voa.
            case 'voa.plugin.file.upload.success': {
              const dados = message.eventData as Record<string, unknown> | undefined
              const nome = typeof dados?.fileName === 'string' ? dados.fileName : 'Arquivo'
              toast.success(`${nome} enviado com sucesso para a Voa`)
              break
            }
            case 'voa.plugin.file.upload.error': {
              const dados = message.eventData as Record<string, unknown> | undefined
              const nome = typeof dados?.fileName === 'string' ? dados.fileName : 'Arquivo'
              const erro = dados?.error as Record<string, unknown> | undefined
              const detalhe = typeof erro?.message === 'string' ? erro.message : 'motivo desconhecido'
              toast.error(`Falha ao enviar ${nome} para a Voa: ${detalhe}`)
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
            // true = "Preencher prontuário" manda os dados por mensagem (ehr.fill +
            // structured_output). Com false, a Voa cai num fluxo de "clique para colar"
            // baseado em clipboard.read() que falha por permissão do navegador.
            enableFillEhr:          true,
            // Permite anexar exames/laudos (PDF/imagem) direto na UI da Voa — o arquivo
            // alimenta a IA dela na geração do documento, não vira anexo no nosso banco.
            enableFileUpload:       true,
            consultationType:       'IN_PERSON',
            // Clínica é só presencial hoje — trava a modalidade e remove essa etapa
            // extra de seleção que aparecia no início do atendimento.
            allowChangeConsultationType: false,
            structuredOutputSchema: PRONTUARIO_SCHEMA,
            // EXPERIMENTAL: só documentado pro instalador via iframe, não confirmado
            // pro mount() do SDK — testar se realmente pré-seleciona o modelo certo e
            // remover se a Voa simplesmente ignorar a chave. Vem configurado no
            // cadastro do tipo de atendimento; sem configuração, usa o padrão da clínica.
            clinicalType:           voaClinicalType || CLINICAL_TYPE_PADRAO,
          },
        })

        // Fallback: se ready não vier (ex: auth error silencioso), exibe
        // o container após READY_TIMEOUT_MS para revelar a UI interna do Voa
        setTimeout(() => {
          if (!cancelado) setShowContainer(true)
        }, READY_TIMEOUT_MS)

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
    }
  }, [agendamentoId, doctorId, patientId, voaClinicalType, tentativa])

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
          onClick={() => {
            // Só pede confirmação se há sessão viva de fato — evita perder o
            // documento gerado sem o usuário ter copiado antes.
            if (status === 'ready' && !confirm('Encerrar a gravação da Voa agora? Se ainda não copiou o documento gerado desta consulta, você pode perder o conteúdo.')) return
            onFechar()
          }}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 14px', fontSize: 13, fontWeight: 700,
            backgroundColor: 'var(--cor-erro)', border: 'none', borderRadius: 5,
            cursor: 'pointer', color: '#fff',
          }}
          title="Encerra a gravação (desmonta a Voa, não fica escutando em background)"
        >
          <X size={14} /> Fechar
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

      <div ref={containerRef} style={{ width: '100%', height: (status === 'ready' || showContainer) ? 'auto' : 0, minHeight: (status === 'ready' || showContainer) ? 400 : 0 }} />

      {status === 'ready' && (
        <div style={{
          padding: '6px 10px', fontSize: 11, color: 'var(--texto-terciario)',
          borderTop: '1px solid var(--borda-suave)', backgroundColor: 'var(--bg-card)',
        }}>
          Ao finalizar, clique em <strong>&quot;Preencher prontuário&quot;</strong> (ou &quot;Copiar todo o documento&quot;) dentro da Voa para trazer os dados para os campos abaixo automaticamente.
        </div>
      )}
    </div>
  )
}

export default forwardRef(VoaPluginView)
