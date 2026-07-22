'use client'

import { forwardRef, useEffect, useRef, useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, Trash2, ArrowLeft, Search, Plus, X, Camera, User, RefreshCw, Trash } from 'lucide-react'
import { pessoaSchema, type PessoaInput } from '@/lib/validators/pessoa.schema'
import type { Pessoa } from '@/types/cadastros.types'
import MoneyInput from '@/components/ui/MoneyInput'
import HistoricoClinico from '@/components/clinica/HistoricoClinico'

interface AgendaDia {
  id?:           number
  dia_semana:    number
  hora_inicio:   string
  hora_fim:      string
  intervalo_min: number
  ativo:         boolean
}

interface AgendaPausa {
  id?:         number
  dia_semana:  number
  hora_inicio: string
  hora_fim:    string
  descricao?:  string
}

interface AgendaExcecao {
  id?:         number
  data:        string
  descricao?:  string
  nao_atende:  boolean
  hora_inicio?: string
  hora_fim?:   string
  intervalo_min?: number
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

interface Props { pessoa?: Pessoa; papelInicial?: string }

const UFS: { sigla: string; nome: string }[] = [
  { sigla: 'AC', nome: 'ACRE' },
  { sigla: 'AL', nome: 'ALAGOAS' },
  { sigla: 'AP', nome: 'AMAPA' },
  { sigla: 'AM', nome: 'AMAZONAS' },
  { sigla: 'BA', nome: 'BAHIA' },
  { sigla: 'CE', nome: 'CEARA' },
  { sigla: 'DF', nome: 'DISTRITO FEDERAL' },
  { sigla: 'ES', nome: 'ESPIRITO SANTO' },
  { sigla: 'GO', nome: 'GOIAS' },
  { sigla: 'MA', nome: 'MARANHAO' },
  { sigla: 'MT', nome: 'MATO GROSSO' },
  { sigla: 'MS', nome: 'MATO GROSSO DO SUL' },
  { sigla: 'MG', nome: 'MINAS GERAIS' },
  { sigla: 'PA', nome: 'PARA' },
  { sigla: 'PB', nome: 'PARAIBA' },
  { sigla: 'PR', nome: 'PARANA' },
  { sigla: 'PE', nome: 'PERNAMBUCO' },
  { sigla: 'PI', nome: 'PIAUI' },
  { sigla: 'RJ', nome: 'RIO DE JANEIRO' },
  { sigla: 'RN', nome: 'RIO GRANDE DO NORTE' },
  { sigla: 'RS', nome: 'RIO GRANDE DO SUL' },
  { sigla: 'RO', nome: 'RONDONIA' },
  { sigla: 'RR', nome: 'RORAIMA' },
  { sigla: 'SC', nome: 'SANTA CATARINA' },
  { sigla: 'SP', nome: 'SAO PAULO' },
  { sigla: 'SE', nome: 'SERGIPE' },
  { sigla: 'TO', nome: 'TOCANTINS' },
]

// Linha de formulário estilo ERP: Label: [campo]
function FormRow({ label, children, fullWidth }: { label: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: fullWidth ? '1fr' : '110px 1fr',
      alignItems: 'center',
      gap: '2px 6px',
      minHeight: 26,
    }}>
      {!fullWidth && (
        <label style={{
          textAlign: 'right', fontSize: 12,
          color: 'var(--texto-secundario)', whiteSpace: 'nowrap',
          paddingRight: 2,
        }}>
          {label}
        </label>
      )}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

// Input compacto estilo ERP — usa forwardRef para compatibilidade com react-hook-form
const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, onBlur, onFocus, onChange, type, ...props }, ref) {
    // 'search' = chave_pix, 'date' = datas — ambos não devem ser convertidos p/ maiúsculas
    const isText = type !== 'email' && type !== 'number' && type !== 'search' && type !== 'date'
    return (
      <input
        ref={ref}
        type={type === 'search' ? 'text' : type}
        {...props}
        style={{
          width: '100%', padding: '3px 6px',
          backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
          border: '1px solid var(--borda-media)', borderRadius: 3,
          fontSize: 12, fontFamily: 'var(--fonte-sans)',
          outline: 'none',
          textTransform: isText ? 'uppercase' : 'none',
          ...style,
        }}
        onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)'; onFocus?.(e) }}
        onBlur={e  => { e.target.style.borderColor = 'var(--borda-media)';  onBlur?.(e)  }}
        onChange={e => {
          if (isText) e.target.value = e.target.value.toUpperCase()
          onChange?.(e)
        }}
      />
    )
  }
)

// Select compacto — usa forwardRef para compatibilidade com react-hook-form
const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ style, ...props }, ref) {
    return (
      <select
        ref={ref}
        {...props}
        style={{
          width: '100%', padding: '3px 6px',
          backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
          border: '1px solid var(--borda-media)', borderRadius: 3,
          fontSize: 12,
          ...style,
        }}
      />
    )
  }
)

// Checkbox estilo ERP
const Check = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { label: string }>(
  function Check({ label, ...props }, ref) {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
        color: 'var(--texto-principal)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <input ref={ref} type="checkbox" {...props} style={{ cursor: 'pointer' }} />
        {label}
      </label>
    )
  }
)

// Seção com borda e título (estilo fieldset ERP)
function Secao({ titulo, children, style }: { titulo: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <fieldset className="form-fieldset" style={{ margin: 0, ...style }}>
      <legend>{titulo}</legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </fieldset>
  )
}

function FotoCaptura({ foto, onChange }: { foto?: string | null; onChange: (v: string | null) => void }) {
  const [modo,      setModo]      = useState<'idle' | 'camera' | 'preview'>('idle')
  const [capturada, setCapturada] = useState<string | null>(null)
  const [cameras,   setCameras]   = useState<MediaDeviceInfo[]>([])
  const [cameraId,  setCameraId]  = useState<string>('')
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  function pararStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => pararStream(), [])

  async function iniciarStream(deviceId?: string) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: 400, height: 400 }
        : { width: 400, height: 400, facingMode: 'user' },
    })
    pararStream()
    streamRef.current = stream
    return stream
  }

  async function abrirCamera() {
    try {
      await iniciarStream(cameraId || undefined)
      setModo('camera')  // monta o <video> — stream é anexado no useEffect abaixo

      // Labels só ficam disponíveis depois que a permissão é concedida
      const devices = await navigator.mediaDevices.enumerateDevices()
      const vids = devices.filter(d => d.kind === 'videoinput')
      setCameras(vids)
      if (!cameraId && vids[0]) setCameraId(vids[0].deviceId)
    } catch {
      import('sonner').then(({ toast }) => toast.error('Câmera não disponível ou sem permissão'))
    }
  }

  async function trocarCamera(id: string) {
    setCameraId(id)
    try {
      await iniciarStream(id)
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current
        videoRef.current.play().catch(() => {})
      }
    } catch {
      import('sonner').then(({ toast }) => toast.error('Não foi possível usar essa câmera'))
    }
  }

  // Anexa o stream ao <video> depois que o elemento monta no DOM
  useEffect(() => {
    if (modo === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [modo])

  function capturar() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const side = Math.min(video.videoWidth, video.videoHeight)
    const ox   = (video.videoWidth  - side) / 2
    const oy   = (video.videoHeight - side) / 2
    canvas.width = 220; canvas.height = 220
    canvas.getContext('2d')!.drawImage(video, ox, oy, side, side, 0, 0, 220, 220)
    setCapturada(canvas.toDataURL('image/jpeg', 0.82))
    pararStream()
    setModo('preview')
  }

  function confirmar() { onChange(capturada); setCapturada(null); setModo('idle') }
  function cancelar()  { pararStream(); setCapturada(null); setModo('idle') }

  const AVATAR = 110

  return (
    <>
      {/* Modal câmera / preview */}
      {modo !== 'idle' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          backgroundColor: 'rgba(0,0,0,0.72)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)', borderRadius: 12,
            padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--texto-principal)', letterSpacing: '0.02em' }}>
              {modo === 'camera' ? 'Posicione o rosto no centro' : 'Confirmar foto'}
            </div>

            {modo === 'camera' && cameras.length > 1 && (
              <select
                value={cameraId}
                onChange={e => trocarCamera(e.target.value)}
                style={{
                  width: 280, padding: '6px 8px', fontSize: 12,
                  borderRadius: 6, border: '1px solid var(--borda-media)',
                  backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                }}
              >
                {cameras.map((c, i) => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label || `Câmera ${i + 1}`}
                  </option>
                ))}
              </select>
            )}

            {modo === 'camera' && (
              <video ref={videoRef} autoPlay playsInline muted style={{
                width: 280, height: 280, objectFit: 'cover', borderRadius: '50%',
                border: '4px solid var(--cor-primaria)',
                backgroundColor: '#000',
              }} />
            )}
            {modo === 'preview' && capturada && (
              <img src={capturada} alt="preview" style={{
                width: 280, height: 280, objectFit: 'cover', borderRadius: '50%',
                border: '4px solid var(--cor-primaria)',
              }} />
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              {modo === 'camera' && (
                <button type="button" onClick={capturar} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px',
                  backgroundColor: 'var(--cor-primaria)', color: '#fff',
                  border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600,
                }}>
                  <Camera size={14} /> Capturar
                </button>
              )}
              {modo === 'preview' && (<>
                <button type="button" onClick={confirmar} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px',
                  backgroundColor: 'var(--cor-primaria)', color: '#fff',
                  border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600,
                }}>
                  Usar esta foto
                </button>
                <button type="button" onClick={abrirCamera} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                  background: 'none', border: '1px solid var(--borda-media)',
                  borderRadius: 6, fontSize: 13, cursor: 'pointer', color: 'var(--texto-secundario)',
                }}>
                  <RefreshCw size={13} /> Tirar novamente
                </button>
              </>)}
              <button type="button" onClick={cancelar} style={{
                padding: '8px 16px', background: 'none',
                border: '1px solid var(--borda-media)', borderRadius: 6,
                fontSize: 13, cursor: 'pointer', color: 'var(--texto-secundario)',
              }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Avatar + botões */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: AVATAR, height: AVATAR, borderRadius: '50%',
          overflow: 'hidden',
          border: foto ? '3px solid var(--cor-primaria)' : '2px dashed var(--borda-media)',
          backgroundColor: 'var(--bg-input)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }} onClick={abrirCamera} title="Clique para tirar uma foto">
          {foto
            ? <img src={foto} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <User size={44} color="var(--texto-terciario)" strokeWidth={1.2} />
          }
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={abrirCamera} style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
            background: 'none', border: '1px solid var(--borda-media)', borderRadius: 4,
            fontSize: 11, cursor: 'pointer', color: 'var(--texto-secundario)',
            whiteSpace: 'nowrap',
          }}>
            <Camera size={11} /> {foto ? 'Nova foto' : 'Tirar foto'}
          </button>
          {foto && (
            <button type="button" onClick={() => onChange(null)} title="Remover foto" style={{
              padding: '3px 6px', background: 'none',
              border: '1px solid var(--borda-media)', borderRadius: 4,
              fontSize: 11, cursor: 'pointer', color: 'var(--cor-erro)', lineHeight: 1,
            }}>
              <X size={11} />
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function BuscarPessoa({
  pessoaId, nome, onSelect, onNomeChange, onLimpar, placeholder,
}: {
  pessoaId?: number | null
  nome?: string | null
  onSelect: (id: number, nome: string) => void
  onNomeChange: (nome: string) => void
  onLimpar: () => void
  placeholder?: string
}) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<{ id: number; nome: string; cpf_cnpj: string | null }[]>([])
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)

  async function buscar() {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    try {
      const res = await fetch(`/api/cadastro/pessoas?busca=${encodeURIComponent(q)}&limit=10`)
      const d   = await res.json()
      setResults(d.dados ?? [])
      setOpen(true)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  if (pessoaId) {
    return (
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1 }}>
        <span style={{
          flex: 1, padding: '3px 6px', fontSize: 12,
          backgroundColor: 'var(--bg-input)', border: '1px solid var(--cor-primaria)',
          borderRadius: 3, color: 'var(--texto-principal)', textTransform: 'uppercase',
        }}>
          {nome}
          <span style={{ fontSize: 10, color: 'var(--cor-primaria)', marginLeft: 6 }}>#{pessoaId}</span>
        </span>
        <button type="button" onClick={onLimpar} title="Desvincular"
          style={{ padding: '3px 6px', background: 'none', border: '1px solid var(--borda-media)',
            borderRadius: 3, cursor: 'pointer', color: 'var(--cor-erro)', lineHeight: 1 }}>
          <X size={11} />
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', gap: 4 }}>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />}
      <input
        type="text"
        value={nome || query}
        placeholder={placeholder ?? 'Nome ou CPF...'}
        onChange={e => { setQuery(e.target.value); onNomeChange(e.target.value.toUpperCase()) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscar() } }}
        style={{
          flex: 1, padding: '3px 6px', fontSize: 12, fontFamily: 'var(--fonte-sans)',
          backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
          border: '1px solid var(--borda-media)', borderRadius: 3, outline: 'none',
          textTransform: 'uppercase',
        }}
        onFocus={e => { e.target.style.borderColor = 'var(--cor-primaria)' }}
        onBlur={e  => { e.target.style.borderColor = 'var(--borda-media)' }}
      />
      <button type="button" onClick={buscar} disabled={loading} title="Buscar pessoa cadastrada"
        style={{
          display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
          background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
          fontSize: 11, cursor: loading ? 'not-allowed' : 'pointer',
          color: loading ? 'var(--texto-terciario)' : 'var(--cor-primaria)',
          whiteSpace: 'nowrap', opacity: loading ? 0.6 : 1,
        }}>
        <Search size={11} /> {loading ? '...' : 'Vincular'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda-media)',
          borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          maxHeight: 200, overflowY: 'auto',
        }}>
          {results.length === 0 ? (
            <div style={{ padding: '8px', fontSize: 12, color: 'var(--texto-secundario)' }}>
              Nenhum cadastro encontrado — nome será salvo como texto.
            </div>
          ) : results.map(p => (
            <button key={p.id} type="button" onClick={() => { onSelect(p.id, p.nome); setQuery(''); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px',
                fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--texto-principal)', borderBottom: '1px solid var(--borda-suave)',
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover, rgba(0,0,0,0.05))' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}>
              {p.nome}
              {p.cpf_cnpj && <span style={{ fontSize: 10, color: 'var(--texto-terciario)', marginLeft: 6 }}>{p.cpf_cnpj}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function mascaraCpfCnpj(valor: string, pj: boolean): string {
  const d = valor.replace(/\D/g, '').slice(0, pj ? 14 : 11)
  if (pj) {
    return d
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

const ABAS_PESSOA = ['Principal', 'Financeiro', 'Fiscal / Obs', 'Agenda', 'Consultas'] as const
type AbaPessoa = typeof ABAS_PESSOA[number]

export default function PessoaFormPage({ pessoa, papelInicial }: Props) {
  const router  = useRouter()
  const [saving,       setSaving]      = useState(false)
  const [deleting,     setDeleting]    = useState(false)
  const [excluding,    setExcluding]   = useState(false)
  const [aba,          setAba]         = useState<AbaPessoa>('Principal')
  const [buscandoCep,  setBuscandoCep]  = useState(false)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)

  // ── Tipos de cobrança ────────────────────────────────────
  const [tiposCobranca, setTiposCobranca] = useState<{ cod_tipo_cobranca: number; des_tipo_cobranca: string }[]>([])

  useEffect(() => {
    fetch('/api/cadastro/formas-pagamento?ativo=true&limit=200')
      .then(r => r.json())
      .then(d => setTiposCobranca(d.dados ?? []))
      .catch(() => {})
  }, [])

  // ── Agenda do profissional ───────────────────────────────
  const [agenda,            setAgenda]            = useState<AgendaDia[]>([])
  const [pausas,            setPausas]            = useState<AgendaPausa[]>([])
  const [excecoes,          setExcecoes]          = useState<AgendaExcecao[]>([])
  const [loadingAgenda,     setLoadingAgenda]     = useState(false)
  const [salvandoDia,       setSalvandoDia]       = useState<number | null>(null)
  const [salvarPausaAbrirEm, setSalvarPausaAbrirEm] = useState<number | null>(null)
  const [mostrarNovaExcecao, setMostrarNovaExcecao] = useState(false)

  const carregarAgenda = useCallback(async () => {
    if (!pessoa?.id) return
    setLoadingAgenda(true)
    try {
      const [resDias, resPausas, resExcecoes] = await Promise.all([
        fetch(`/api/clinica/agenda-profissional?profissional_id=${pessoa.id}`),
        fetch(`/api/clinica/agenda-profissional-pausa?profissional_id=${pessoa.id}`),
        fetch(`/api/clinica/agenda-profissional-excecao?profissional_id=${pessoa.id}`),
      ])
      const dias = await resDias.json()
      const pausasData = await resPausas.json()
      const excecoesDatas = await resExcecoes.json()
      setAgenda(dias.dados ?? [])
      setPausas(pausasData.dados ?? [])
      setExcecoes(excecoesDatas.dados ?? [])
    } finally { setLoadingAgenda(false) }
  }, [pessoa?.id])

  useEffect(() => {
    if (aba === 'Agenda' && pessoa?.id) carregarAgenda()
  }, [aba, carregarAgenda, pessoa?.id])

  // Estado local da grade (7 dias)
  const [grade, setGrade] = useState<Record<number, { hora_inicio: string; hora_fim: string; intervalo_min: number; ativo: boolean; id?: number }>>(() => ({}))

  useEffect(() => {
    const mapa: typeof grade = {}
    for (const d of agenda) {
      mapa[d.dia_semana] = { hora_inicio: d.hora_inicio, hora_fim: d.hora_fim, intervalo_min: d.intervalo_min, ativo: d.ativo, id: d.id }
    }
    setGrade(mapa)
  }, [agenda])

  async function salvarDia(dia: number) {
    if (!pessoa?.id) return
    const slot = grade[dia]
    if (!slot?.hora_inicio || !slot?.hora_fim) { toast.error('Informe hora início e fim'); return }
    setSalvandoDia(dia)
    try {
      const res = await fetch('/api/clinica/agenda-profissional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profissional_id: pessoa.id,
          dia_semana:      dia,
          hora_inicio:     slot.hora_inicio,
          hora_fim:        slot.hora_fim,
          intervalo_min:   slot.intervalo_min ?? 30,
          ativo:           slot.ativo ?? true,
        }),
      })
      if (!res.ok) { toast.error('Erro ao salvar horário'); return }
      const salvo = await res.json()
      setGrade(g => ({ ...g, [dia]: { ...g[dia], id: salvo.id } }))
      toast.success(`${DIAS_SEMANA[dia]} salvo!`)
    } finally { setSalvandoDia(null) }
  }

  async function removerDia(dia: number) {
    const slot = grade[dia]
    if (!slot?.id) { setGrade(g => { const c = { ...g }; delete c[dia]; return c }); return }
    if (!confirm(`Remover ${DIAS_SEMANA[dia]} da agenda?`)) return
    try {
      await fetch(`/api/clinica/agenda-profissional/${slot.id}`, { method: 'DELETE' })
      setGrade(g => { const c = { ...g }; delete c[dia]; return c })
      toast.success(`${DIAS_SEMANA[dia]} removido`)
    } catch { toast.error('Erro ao remover') }
  }

  function adicionarDia(dia: number) {
    setGrade(g => ({ ...g, [dia]: { hora_inicio: '08:00', hora_fim: '18:00', intervalo_min: 30, ativo: true } }))
  }

  // ── Funções de pausa intraday ───────────────────────────────
  async function salvarPausa(dia: number, pausa: AgendaPausa) {
    if (!pessoa?.id || !pausa.hora_inicio || !pausa.hora_fim) {
      toast.error('Informe horários da pausa')
      return
    }
    try {
      const res = await fetch('/api/clinica/agenda-profissional-pausa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profissional_id: pessoa.id,
          dia_semana: dia,
          hora_inicio: pausa.hora_inicio,
          hora_fim: pausa.hora_fim,
          descricao: pausa.descricao || null,
        }),
      })
      if (!res.ok) { toast.error('Erro ao salvar pausa'); return }
      const salva = await res.json()
      setPausas(ps => [...ps.filter(p => !(p.dia_semana === dia && !p.id)), { ...pausa, id: salva.id, dia_semana: dia }])
      toast.success('Pausa salva!')
      setSalvarPausaAbrirEm(null)
    } catch { toast.error('Erro ao salvar pausa') }
  }

  async function removerPausa(pausaId: number) {
    if (!confirm('Remover esta pausa?')) return
    try {
      await fetch(`/api/clinica/agenda-profissional-pausa/${pausaId}`, { method: 'DELETE' })
      setPausas(ps => ps.filter(p => p.id !== pausaId))
      toast.success('Pausa removida')
    } catch { toast.error('Erro ao remover pausa') }
  }

  // ── Funções de exceção (data específica) ───────────────────────────────
  async function salvarExcecao(exc: AgendaExcecao) {
    if (!pessoa?.id || !exc.data) {
      toast.error('Informe a data da exceção')
      return
    }
    if (!exc.nao_atende && (!exc.hora_inicio || !exc.hora_fim)) {
      toast.error('Se atende neste dia, informe os horários')
      return
    }
    try {
      const res = await fetch('/api/clinica/agenda-profissional-excecao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profissional_id: pessoa.id,
          data: exc.data,
          descricao: exc.descricao || null,
          nao_atende: exc.nao_atende,
          hora_inicio: exc.nao_atende ? null : exc.hora_inicio,
          hora_fim: exc.nao_atende ? null : exc.hora_fim,
          intervalo_min: exc.intervalo_min ?? 30,
        }),
      })
      if (!res.ok) { toast.error('Erro ao salvar exceção'); return }
      const salva = await res.json()
      setExcecoes(es => [...es.filter(e => e.data !== exc.data), { ...exc, id: salva.id }])
      toast.success('Exceção salva!')
      setMostrarNovaExcecao(false)
    } catch { toast.error('Erro ao salvar exceção') }
  }

  async function removerExcecao(excecaoId: number) {
    if (!confirm('Remover esta exceção?')) return
    try {
      await fetch(`/api/clinica/agenda-profissional-excecao/${excecaoId}`, { method: 'DELETE' })
      setExcecoes(es => es.filter(e => e.id !== excecaoId))
      toast.success('Exceção removida')
    } catch { toast.error('Erro ao remover exceção') }
  }

  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { errors } } = useForm<PessoaInput>({
    resolver: zodResolver(pessoaSchema),
    defaultValues: {
      tipo_pessoa: 'F', cpf_cnpj: '', data_nascimento: '', cep: '',
      sexo: undefined, cor_raca: '', estado_civil: '', naturalidade: '', profissao: '', altura: null, peso: null, foto: null,
      pai_pessoa_id: null, pai_nome: '', pai_paciente: false,
      mae_pessoa_id: null, mae_nome: '', mae_paciente: false,
      conjuge_pessoa_id: null, conjuge_nome: '', conjuge_paciente: false,
      indicacao_pessoa_id: null, indicacao_nome: '', indicacao_fone: '', indicacao_ligacao: '',
      crm: '', crm_uf: '',
      ind_cliente: false, ind_fornecedor: false,
      ind_banco: false, ind_transportador: false,
      ind_paciente: papelInicial === 'paciente', ind_profissional: papelInicial === 'profissional',
      limite_credito: 0, cod_tipo_cobranca: null, contribuinte_icms: false, optante_simples: false,
    },
  })

  useEffect(() => {
    if (!pessoa) return
    const rawDoc = (pessoa.cpf_cnpj ?? '').replace(/\D/g, '')
    reset({
      tipo_pessoa:       pessoa.tipo_pessoa,
      nome:              pessoa.nome,
      nome_fantasia:     pessoa.nome_fantasia ?? '',
      cpf_cnpj:          mascaraCpfCnpj(rawDoc, pessoa.tipo_pessoa === 'J'),
      data_nascimento:   pessoa.data_nascimento
                           ? String(pessoa.data_nascimento).slice(0, 10)
                           : '',
      sexo:              pessoa.sexo ?? undefined,
      cor_raca:          pessoa.cor_raca ?? '',
      estado_civil:      pessoa.estado_civil ?? '',
      naturalidade:      pessoa.naturalidade ?? '',
      profissao:         pessoa.profissao ?? '',
      altura:            pessoa.altura != null ? Number(pessoa.altura) : null,
      peso:              pessoa.peso   != null ? Number(pessoa.peso)   : null,
      foto:              pessoa.foto ?? null,
      pai_pessoa_id:     pessoa.pai_pessoa_id ?? null,
      pai_nome:          pessoa.pai_nome ?? '',
      pai_paciente:      pessoa.pai_paciente ?? false,
      mae_pessoa_id:     pessoa.mae_pessoa_id ?? null,
      mae_nome:          pessoa.mae_nome ?? '',
      mae_paciente:      pessoa.mae_paciente ?? false,
      conjuge_pessoa_id: pessoa.conjuge_pessoa_id ?? null,
      conjuge_nome:      pessoa.conjuge_nome ?? '',
      conjuge_paciente:  pessoa.conjuge_paciente ?? false,
      indicacao_pessoa_id: pessoa.indicacao_pessoa_id ?? null,
      indicacao_nome:    pessoa.indicacao_nome ?? '',
      indicacao_fone:    pessoa.indicacao_fone ?? '',
      indicacao_ligacao: pessoa.indicacao_ligacao ?? '',
      rg_ie:             pessoa.rg_ie ?? '',
      im:                pessoa.im ?? '',
      crm:               pessoa.crm ?? '',
      crm_uf:            pessoa.crm_uf ?? '',
      ind_cliente:       pessoa.ind_cliente,
      ind_fornecedor:    pessoa.ind_fornecedor,
      ind_banco:         pessoa.ind_banco,
      ind_transportador: pessoa.ind_transportador,
      ind_paciente:      pessoa.ind_paciente,
      ind_profissional:  pessoa.ind_profissional,
      cep:               pessoa.cep ?? '',
      logradouro:        pessoa.logradouro ?? '',
      numero:            pessoa.numero ?? '',
      complemento:       pessoa.complemento ?? '',
      bairro:            pessoa.bairro ?? '',
      cidade:            pessoa.cidade ?? '',
      uf:                pessoa.uf ?? '',
      telefone:          pessoa.telefone ?? '',
      celular:           pessoa.celular ?? '',
      whatsapp:          pessoa.whatsapp ?? '',
      email:             pessoa.email ?? '',
      email_nfe:         pessoa.email_nfe ?? '',
      limite_credito:    Number(pessoa.limite_credito),
      cod_tipo_cobranca: pessoa.cod_tipo_cobranca ?? null,
      banco_nome:        pessoa.banco_nome ?? '',
      banco_agencia:     pessoa.banco_agencia ?? '',
      banco_conta:       pessoa.banco_conta ?? '',
      banco_tipo:        pessoa.banco_tipo ?? undefined,
      chave_pix:         pessoa.chave_pix ?? '',
      contribuinte_icms: pessoa.contribuinte_icms,
      optante_simples:   pessoa.optante_simples,
      obs:               pessoa.obs ?? '',
    })
  }, [pessoa, reset])

  const tipoPessoaWatched = watch('tipo_pessoa')
  const bancoTipoWatched = watch('banco_tipo')

  async function buscarCep() {
    const cep = watch('cep')?.replace(/\D/g, '')
    if (cep?.length !== 8) { toast.error('CEP inválido'); return }
    setBuscandoCep(true)
    try {
      const res = await fetch(`/api/util/cep/${cep}`)
      const d   = await res.json()
      if (!res.ok) { toast.error(d.erro ?? 'CEP não encontrado'); return }
      setValue('logradouro', d.logradouro)
      setValue('bairro',     d.bairro)
      setValue('cidade',     d.cidade)
      setValue('uf',         d.uf)
      toast.success('Endereço preenchido')
    } catch { toast.error('Erro ao buscar CEP') }
    finally  { setBuscandoCep(false) }
  }

  async function buscarCnpj() {
    const cnpj = (watch('cpf_cnpj') ?? '').replace(/\D/g, '')
    if (!cnpj || cnpj.length !== 14) { toast.error('Digite o CNPJ completo (14 dígitos) antes de buscar'); return }
    setBuscandoCnpj(true)
    try {
      const res = await fetch(`/api/util/cnpj/${cnpj}`)
      const d   = await res.json()
      if (!res.ok) { toast.error(d.erro ?? 'CNPJ não encontrado'); return }

      // Dados da empresa
      if (d.razao_social)  setValue('nome',          d.razao_social)
      if (d.nome_fantasia) setValue('nome_fantasia',  d.nome_fantasia)

      // Endereço
      if (d.cep)         setValue('cep',         d.cep)
      if (d.logradouro)  setValue('logradouro',  d.logradouro)
      if (d.numero)      setValue('numero',      d.numero)
      if (d.complemento) setValue('complemento', d.complemento)
      if (d.bairro)      setValue('bairro',      d.bairro)
      if (d.cidade)      setValue('cidade',      d.cidade)
      if (d.uf)          setValue('uf',          d.uf)

      // Contato
      if (d.telefone) setValue('telefone', d.telefone)
      if (d.email)    setValue('email',    d.email)

      // Fiscal
      if (d.optante_simples) setValue('optante_simples', true)

      toast.success(`Dados da Receita Federal preenchidos${d.situacao ? ` — ${d.situacao}` : ''}`)
    } catch { toast.error('Erro ao consultar CNPJ') }
    finally  { setBuscandoCnpj(false) }
  }

  async function onSubmit(data: PessoaInput) {
    setSaving(true)
    try {
      const payload = { ...data, cpf_cnpj: (data.cpf_cnpj ?? '').replace(/\D/g, '') || null }
      const url    = pessoa ? `/api/cadastro/pessoas/${pessoa.id}` : '/api/cadastro/pessoas'
      const method = pessoa ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json   = await res.json()
      if (!res.ok) { toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success(pessoa ? 'Pessoa atualizada!' : 'Pessoa cadastrada!')
      if (!pessoa) router.push(`/cadastro/pessoas/${json.id}${papelInicial ? `?papel=${papelInicial}` : ''}`)
      else router.refresh()
    } finally { setSaving(false) }
  }

  async function desativar() {
    if (!pessoa || !confirm(`Desativar "${pessoa.nome}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/cadastro/pessoas/${pessoa.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: false }),
      })
      toast.success('Pessoa desativada')
      router.push(listaHref)
    } finally { setDeleting(false) }
  }

  async function excluir() {
    if (!pessoa || !confirm(`Excluir permanentemente "${pessoa.nome}"?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluding(true)
    try {
      const res = await fetch(`/api/cadastro/pessoas/${pessoa.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao excluir — verifique se não há vínculos'); return }
      toast.success('Pessoa excluída')
      router.push(listaHref)
    } finally { setExcluding(false) }
  }

  const tipoPessoa = tipoPessoaWatched
  const pj = tipoPessoa === 'J'
  const listaHref = papelInicial ? `/cadastro/pessoas?papel=${papelInicial}` : '/cadastro/pessoas'
  const novoHref  = papelInicial ? `/cadastro/pessoas/novo?papel=${papelInicial}` : '/cadastro/pessoas/novo'
  const indProfissional = !!watch('ind_profissional')
  const indPaciente     = !!watch('ind_paciente')

  useEffect(() => {
    if (aba === 'Agenda' && !indProfissional) setAba('Principal')
    if (aba === 'Consultas' && !indPaciente) setAba('Principal')
  }, [aba, indProfissional, indPaciente])

  return (
    <form onSubmit={handleSubmit(onSubmit, (erros) => {
        console.warn('[PessoaForm] Erros de validação:', erros)
        const mensagens = Object.entries(erros)
          .map(([campo, e]) => `${campo}: ${(e as { message?: string }).message ?? 'inválido'}`)
          .join('; ')
        toast.error(`Corrija os campos: ${mensagens}`)
      })} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Barra de ferramentas ─────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px',
        backgroundColor: 'var(--bg-card)',
        borderBottom: '1px solid var(--borda-media)',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <button type="button" onClick={() => router.push(listaHref)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
            fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <ArrowLeft size={13} /> Voltar
        </button>

        <div style={{ width: 1, height: 18, backgroundColor: 'var(--borda-media)', margin: '0 4px' }} />

        <button type="button" onClick={() => router.push(novoHref)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
            fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <Plus size={13} /> Nova Pessoa
        </button>

        <button type="submit" disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px',
            background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3,
            fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
            opacity: saving ? 0.7 : 1 }}>
          <Save size={13} /> {saving ? 'Salvando...' : 'Salvar'}
        </button>

        {pessoa && (
          <button type="button" onClick={desativar} disabled={deleting}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3,
              fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)' }}>
            <Trash2 size={13} /> Desativar
          </button>
        )}

        {pessoa && (
          <button type="button" onClick={excluir} disabled={excluding}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              background: 'var(--cor-erro)', color: '#fff', border: 'none', borderRadius: 3,
              fontSize: 12, cursor: excluding ? 'not-allowed' : 'pointer',
              opacity: excluding ? 0.7 : 1 }}>
            <X size={13} /> {excluding ? 'Excluindo...' : 'Excluir'}
          </button>
        )}

        {pessoa && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--texto-terciario)' }}>
            #{pessoa.id} — {pessoa.ativo ? 'Ativo' : 'Inativo'}
          </span>
        )}
      </div>

      {/* ── Abas ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 0,
        backgroundColor: 'var(--bg-page)',
        borderBottom: '1px solid var(--borda-media)',
        paddingLeft: 12,
        overflowX: 'auto',
      }}>
        {ABAS_PESSOA.filter(t => {
          if (t === 'Agenda')    return indProfissional
          if (t === 'Consultas') return indPaciente
          return true
        }).map(t => {
          const ativa = aba === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setAba(t)}
              style={{
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: ativa ? 600 : 400,
                color: ativa ? 'var(--cor-primaria)' : 'var(--texto-secundario)',
                background: ativa ? 'var(--bg-card)' : 'none',
                border: 'none',
                borderBottom: ativa ? '2px solid var(--cor-primaria)' : '2px solid transparent',
                borderRight: '1px solid var(--borda-suave)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t}
            </button>
          )
        })}
      </div>

      {/* ── Corpo do formulário ──────────────────────────────── */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1 }}>

        {aba === 'Principal' && (<>
        {/* ══ SEÇÃO PRINCIPAL ════════════════════════════════════ */}
        <Secao titulo="Principal">

          {/* Layout 3 colunas: Foto | Identificação | Dados pessoais */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: '0 16px', alignItems: 'start' }}>

            {/* Col 1 — Foto */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
              {!pj ? (
                <FotoCaptura foto={watch('foto') as string | null} onChange={v => setValue('foto', v)} />
              ) : (
                <div style={{
                  width: 110, height: 110, borderRadius: 8,
                  backgroundColor: 'var(--bg-input)', border: '2px dashed var(--borda-media)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 10, color: 'var(--texto-terciario)', textAlign: 'center', padding: 8 }}>Pessoa<br/>Jurídica</span>
                </div>
              )}
            </div>

            {/* Col 2 — Nome + Natureza + CPF/CNPJ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <FormRow label="Nome:">
                <Input {...register('nome')}
                  style={{ border: errors.nome ? '1px solid var(--cor-erro)' : undefined }} />
              </FormRow>
              {errors.nome && <span style={{ fontSize: 11, color: 'var(--cor-erro)', paddingLeft: 116 }}>{errors.nome.message}</span>}
              <FormRow label="Nome Fantasia:">
                <Input {...register('nome_fantasia')} />
              </FormRow>

              {/* Natureza */}
              <div style={{ display: 'flex', gap: 16, paddingLeft: 116, marginTop: 2 }}>
                <fieldset style={{ border: '1px solid var(--borda-suave)', borderRadius: 3, padding: '4px 8px' }}>
                  <legend style={{ fontSize: 10, color: 'var(--texto-terciario)', padding: '0 4px' }}>Natureza</legend>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[{ v: 'F', l: 'Física' }, { v: 'J', l: 'Jurídica' }].map(({ v, l }) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                        <input type="radio" value={v} {...register('tipo_pessoa', { onChange: () => setValue('cpf_cnpj', '') })} /> {l}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>

              <FormRow label={pj ? 'CNPJ:' : 'CPF:'}>
                <Input
                  {...register('cpf_cnpj')}
                  placeholder={pj ? '00.000.000/0001-00' : '000.000.000-00'}
                  style={{ fontFamily: 'var(--fonte-mono)' }}
                  onChange={e => {
                    const masked = mascaraCpfCnpj(e.target.value, pj)
                    setValue('cpf_cnpj', masked, { shouldValidate: false })
                  }}
                />
                {pj && (
                  <button type="button" onClick={buscarCnpj} disabled={buscandoCnpj}
                    title="Buscar dados na Receita Federal"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '3px 8px', whiteSpace: 'nowrap',
                      background: 'none', border: '1px solid var(--borda-media)',
                      borderRadius: 3, fontSize: 11, cursor: buscandoCnpj ? 'not-allowed' : 'pointer',
                      color: buscandoCnpj ? 'var(--texto-terciario)' : 'var(--cor-primaria)',
                      opacity: buscandoCnpj ? 0.6 : 1,
                    }}>
                    <Search size={11} />
                    {buscandoCnpj ? 'Buscando...' : 'Receita Federal'}
                  </button>
                )}
              </FormRow>

              <FormRow label={pj ? 'IE-ST:' : 'RG:'}>
                <Input {...register('rg_ie')} />
              </FormRow>
              {pj && (
                <FormRow label="I.M.:">
                  <Input {...register('im')} />
                </FormRow>
              )}
              {indProfissional && (
                <FormRow label="CRM:">
                  <Input {...register('crm')} style={{ width: 100, fontFamily: 'var(--fonte-mono)' }} />
                  <Select {...register('crm_uf')} style={{ width: 90 }}>
                    <option value="">UF</option>
                    {UFS.map(u => <option key={u.sigla} value={u.sigla}>{u.sigla}</option>)}
                  </Select>
                </FormRow>
              )}
            </div>

            {/* Col 3 — Dados pessoais (apenas PF) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {!pj && (<>
                <FormRow label="Dt. Nasc.:">
                  <Input type="date" {...register('data_nascimento')}
                    style={{ width: 140, fontFamily: 'var(--fonte-mono)' }} />
                  {(() => {
                    const dn = watch('data_nascimento')
                    if (!dn) return null
                    const hoje = new Date()
                    const nasc = new Date(dn + 'T00:00:00')
                    let idade = hoje.getFullYear() - nasc.getFullYear()
                    const m = hoje.getMonth() - nasc.getMonth()
                    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--
                    if (idade < 0 || idade > 150) return null
                    return (
                      <span style={{
                        marginLeft: 6, fontSize: 12, fontWeight: 600,
                        color: 'var(--cor-primaria)', whiteSpace: 'nowrap', alignSelf: 'center',
                      }}>
                        {idade} {idade === 1 ? 'ano' : 'anos'}
                      </span>
                    )
                  })()}
                </FormRow>
                <FormRow label="Sexo:">
                  <Select {...register('sexo')} style={{ width: 130 }}>
                    <option value="">—</option>
                    <option value="F">Feminino</option>
                    <option value="M">Masculino</option>
                  </Select>
                </FormRow>
                <FormRow label="Cor/Raça:">
                  <Select {...register('cor_raca')} style={{ width: 160 }}>
                    <option value="">—</option>
                    <option value="BRANCA">Branca</option>
                    <option value="PRETA">Preta</option>
                    <option value="PARDA">Parda</option>
                    <option value="AMARELA">Amarela</option>
                    <option value="INDIGENA">Indígena</option>
                  </Select>
                </FormRow>
                <FormRow label="Estado Civil:">
                  <Select {...register('estado_civil')} style={{ width: 160 }}>
                    <option value="">—</option>
                    <option value="SOLTEIRO">Solteiro(a)</option>
                    <option value="CASADO">Casado(a)</option>
                    <option value="DIVORCIADO">Divorciado(a)</option>
                    <option value="VIUVO">Viúvo(a)</option>
                    <option value="UNIAO_ESTAVEL">União Estável</option>
                  </Select>
                </FormRow>
                <FormRow label="Naturalidade:">
                  <Input {...register('naturalidade')} placeholder="Cidade de nascimento" />
                </FormRow>
                <FormRow label="Profissão:">
                  <Input {...register('profissao')} placeholder="Ex: MÉDICO, ENFERMEIRO..." />
                </FormRow>
                <div style={{ display: 'flex', gap: 8, paddingLeft: 116, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Altura (m):</span>
                    <Input
                      type="number" step="0.01" min="0" max="3"
                      {...register('altura', { setValueAs: v => v === '' ? null : Number(v) })}
                      placeholder="1.75"
                      style={{ width: 70, fontFamily: 'var(--fonte-mono)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Peso (kg):</span>
                    <Input
                      type="number" step="0.1" min="0" max="999"
                      {...register('peso', { setValueAs: v => v === '' ? null : Number(v) })}
                      placeholder="70.0"
                      style={{ width: 75, fontFamily: 'var(--fonte-mono)' }}
                    />
                  </div>
                  {(() => {
                    const a = Number(watch('altura')), p = Number(watch('peso'))
                    if (!a || !p || a <= 0 || p <= 0) return null
                    const imc = p / (a * a)
                    let label = '', cor = ''
                    if      (imc < 18.5) { label = 'Abaixo do peso'; cor = '#3B82F6' }
                    else if (imc < 25)   { label = 'Normal';          cor = '#10B981' }
                    else if (imc < 30)   { label = 'Sobrepeso';       cor = '#F59E0B' }
                    else if (imc < 35)   { label = 'Ob. Grau I';      cor = '#F97316' }
                    else if (imc < 40)   { label = 'Ob. Grau II';     cor = '#EF4444' }
                    else                  { label = 'Ob. Grau III';    cor = '#7C3AED' }
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', background: `${cor}18`, borderRadius: 4, border: `1px solid ${cor}50` }}>
                        <span style={{ fontSize: 10, color: 'var(--texto-terciario)', whiteSpace: 'nowrap' }}>IMC</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: cor, fontFamily: 'var(--fonte-mono)' }}>{imc.toFixed(1)}</span>
                        <span style={{ fontSize: 10, color: cor, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
                      </div>
                    )
                  })()}
                </div>
              </>)}
            </div>
          </div>

          {/* Separador */}
          <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

          {/* Endereço + Contato — 2 colunas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>

            {/* Endereço */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <FormRow label="CEP:">
                <Input {...register('cep')} style={{ width: 90, fontFamily: 'var(--fonte-mono)' }} placeholder="00000-000" />
                <button
                  type="button"
                  onClick={buscarCep}
                  disabled={buscandoCep}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
                    background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3,
                    fontSize: 11, cursor: buscandoCep ? 'not-allowed' : 'pointer',
                    color: buscandoCep ? 'var(--texto-terciario)' : 'var(--texto-secundario)',
                    whiteSpace: 'nowrap', opacity: buscandoCep ? 0.6 : 1,
                  }}
                >
                  <Search size={11} /> {buscandoCep ? 'Buscando...' : 'Buscar'}
                </button>
              </FormRow>
              <FormRow label="Logradouro:">
                <Input {...register('logradouro')} />
              </FormRow>
              <FormRow label="Número:">
                <Input {...register('numero')} style={{ width: 70 }} />
                <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Compl.:</label>
                <Input {...register('complemento')} />
              </FormRow>
              <FormRow label="Bairro:">
                <Input {...register('bairro')} />
              </FormRow>
              <FormRow label="Cidade:">
                <Input {...register('cidade')} style={{ flex: 1 }} />
              </FormRow>
              <FormRow label="UF:">
                <Select {...register('uf')} style={{ width: 200 }}>
                  <option value="">—</option>
                  {UFS.map(u => <option key={u.sigla} value={u.sigla}>{u.nome}</option>)}
                </Select>
              </FormRow>
            </div>

            {/* Contato */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <FormRow label="Telefone:">
                <Input {...register('telefone')} placeholder="(  )      -    "
                  style={{ fontFamily: 'var(--fonte-mono)', width: 150 }} />
              </FormRow>
              <FormRow label="Celular:">
                <Input {...register('celular')} placeholder="(  )      -    "
                  style={{ fontFamily: 'var(--fonte-mono)', width: 150 }} />
              </FormRow>
              <FormRow label="WhatsApp:">
                <Input {...register('whatsapp')} placeholder="(  )      -    "
                  style={{ fontFamily: 'var(--fonte-mono)', width: 150 }} />
              </FormRow>
              <FormRow label="E-mail:">
                <Input type="email" {...register('email')} />
              </FormRow>
              <FormRow label="E-mail NF-e:">
                <Input type="email" {...register('email_nfe')} />
              </FormRow>
            </div>
          </div>
        </Secao>

        {/* ══ FILIAÇÃO ════════════════════════════════════════════ */}
        {!pj && (
        <Secao titulo="Filiação">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>

            {/* PAI */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)', paddingLeft: 2, letterSpacing: '0.03em' }}>PAI</div>
              <FormRow label="Nome:">
                <BuscarPessoa
                  pessoaId={watch('pai_pessoa_id') as number | null}
                  nome={watch('pai_nome') as string}
                  onSelect={(id, nome) => { setValue('pai_pessoa_id', id); setValue('pai_nome', nome) }}
                  onNomeChange={v => { setValue('pai_nome', v); setValue('pai_pessoa_id', null) }}
                  onLimpar={() => { setValue('pai_pessoa_id', null); setValue('pai_nome', '') }}
                  placeholder="Nome do pai..."
                />
              </FormRow>
              <FormRow label="">
                <Check label="É paciente" checked={!!watch('pai_paciente')} onChange={e => setValue('pai_paciente', e.target.checked)} />
              </FormRow>
            </div>

            {/* MÃE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)', paddingLeft: 2, letterSpacing: '0.03em' }}>MÃE</div>
              <FormRow label="Nome:">
                <BuscarPessoa
                  pessoaId={watch('mae_pessoa_id') as number | null}
                  nome={watch('mae_nome') as string}
                  onSelect={(id, nome) => { setValue('mae_pessoa_id', id); setValue('mae_nome', nome) }}
                  onNomeChange={v => { setValue('mae_nome', v); setValue('mae_pessoa_id', null) }}
                  onLimpar={() => { setValue('mae_pessoa_id', null); setValue('mae_nome', '') }}
                  placeholder="Nome da mãe..."
                />
              </FormRow>
              <FormRow label="">
                <Check label="É paciente" checked={!!watch('mae_paciente')} onChange={e => setValue('mae_paciente', e.target.checked)} />
              </FormRow>
            </div>

            {/* CÔNJUGE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)', paddingLeft: 2, letterSpacing: '0.03em' }}>CÔNJUGE</div>
              <FormRow label="Nome:">
                <BuscarPessoa
                  pessoaId={watch('conjuge_pessoa_id') as number | null}
                  nome={watch('conjuge_nome') as string}
                  onSelect={(id, nome) => { setValue('conjuge_pessoa_id', id); setValue('conjuge_nome', nome) }}
                  onNomeChange={v => { setValue('conjuge_nome', v); setValue('conjuge_pessoa_id', null) }}
                  onLimpar={() => { setValue('conjuge_pessoa_id', null); setValue('conjuge_nome', '') }}
                  placeholder="Nome do cônjuge..."
                />
              </FormRow>
              <FormRow label="">
                <Check label="É paciente" checked={!!watch('conjuge_paciente')} onChange={e => setValue('conjuge_paciente', e.target.checked)} />
              </FormRow>
            </div>

            {/* INDICAÇÃO */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)', paddingLeft: 2, letterSpacing: '0.03em' }}>INDICAÇÃO</div>
              <FormRow label="Nome:">
                <BuscarPessoa
                  pessoaId={watch('indicacao_pessoa_id') as number | null}
                  nome={watch('indicacao_nome') as string}
                  onSelect={(id, nome) => { setValue('indicacao_pessoa_id', id); setValue('indicacao_nome', nome) }}
                  onNomeChange={v => { setValue('indicacao_nome', v); setValue('indicacao_pessoa_id', null) }}
                  onLimpar={() => { setValue('indicacao_pessoa_id', null); setValue('indicacao_nome', '') }}
                  placeholder="Quem indicou..."
                />
              </FormRow>
              <FormRow label="Fone:">
                <Input {...register('indicacao_fone')} type="search" placeholder="(  )      -    "
                  style={{ width: 150, fontFamily: 'var(--fonte-mono)' }} />
              </FormRow>
              <FormRow label="Tipo ligação:">
                <Input {...register('indicacao_ligacao')} placeholder="Ex: amigo, vizinho..." />
              </FormRow>
            </div>

          </div>
        </Secao>
        )}

        {/* ══ CLASSIFICAÇÃO ══════════════════════════════════════ */}
        <Secao titulo="Classificação">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', padding: '4px 0' }}>
            <Check label="Cliente"       checked={!!watch('ind_cliente')}       onChange={e => setValue('ind_cliente',       e.target.checked)} />
            <Check label="Fornecedor"    checked={!!watch('ind_fornecedor')}    onChange={e => setValue('ind_fornecedor',    e.target.checked)} />
            <Check label="Banco / Fin."  checked={!!watch('ind_banco')}         onChange={e => setValue('ind_banco',         e.target.checked)} />
            <Check label="Transportador" checked={!!watch('ind_transportador')} onChange={e => setValue('ind_transportador', e.target.checked)} />
            <Check label="Paciente"      checked={!!watch('ind_paciente')}      onChange={e => setValue('ind_paciente',      e.target.checked)} />
            <Check label="Profissional"  checked={!!watch('ind_profissional')}  onChange={e => setValue('ind_profissional',  e.target.checked)} />
          </div>
        </Secao>
        </>)}

        {aba === 'Financeiro' && (
          <Secao titulo="Financeiro">
            <FormRow label="Lim. Crédito:">
              <MoneyInput value={watch('limite_credito')} onValue={n => setValue('limite_credito', n)} style={{ width: 130 }} />
            </FormRow>
            <FormRow label="Tipo Cobrança:">
              <Select
                value={watch('cod_tipo_cobranca') ?? ''}
                onChange={e => setValue('cod_tipo_cobranca', e.target.value ? Number(e.target.value) : null)}
                style={{ width: 280 }}
              >
                <option value="">— Nenhum —</option>
                {tiposCobranca.map(tc => (
                  <option key={tc.cod_tipo_cobranca} value={tc.cod_tipo_cobranca}>
                    {tc.des_tipo_cobranca.toUpperCase()}
                  </option>
                ))}
              </Select>
            </FormRow>
            <FormRow label="Banco:">
              <Input {...register('banco_nome')} />
            </FormRow>
            <FormRow label="Agência:">
              <Input {...register('banco_agencia')} style={{ width: 80, fontFamily: 'var(--fonte-mono)' }} />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Conta:</label>
              <Input {...register('banco_conta')} style={{ fontFamily: 'var(--fonte-mono)' }} />
              <label style={{ fontSize: 12, color: 'var(--texto-secundario)', whiteSpace: 'nowrap' }}>Tipo:</label>
              {[{ v: 'C', l: 'Corrente' }, { v: 'P', l: 'Poupança' }].map(({ v, l }) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="radio" value={v} {...register('banco_tipo')} checked={bancoTipoWatched === v} onChange={() => setValue('banco_tipo', v as 'C' | 'P')} /> {l}
                </label>
              ))}
            </FormRow>
            <FormRow label="Chave PIX:">
              <Input {...register('chave_pix')} type="search" />
            </FormRow>
          </Secao>
        )}

        {aba === 'Fiscal / Obs' && (
          <Secao titulo="Fiscal / Observações">
            <div style={{ display: 'flex', gap: 20, paddingLeft: 4 }}>
              <Check label="Contribuinte de ICMS"         checked={!!watch('contribuinte_icms')} onChange={e => setValue('contribuinte_icms', e.target.checked)} />
              <Check label="Optante pelo Simples Nacional" checked={!!watch('optante_simples')}   onChange={e => setValue('optante_simples',   e.target.checked)} />
            </div>
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginBottom: 3 }}>Observações:</div>
              <textarea
                {...register('obs')}
                rows={5}
                style={{
                  width: '100%', padding: '4px 6px',
                  backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                  border: '1px solid var(--borda-media)', borderRadius: 3,
                  fontSize: 12, fontFamily: 'var(--fonte-sans)', resize: 'vertical',
                }}
              />
            </div>
          </Secao>
        )}

        {aba === 'Agenda' && (
          <>
            <Secao titulo="Horários por Dia da Semana">
              {!pessoa?.id ? (
                <div style={{ padding: '12px 4px', fontSize: 12, color: 'var(--texto-secundario)' }}>
                  Salve o cadastro primeiro para configurar a agenda do profissional.
                </div>
              ) : !watch('ind_profissional') ? (
                <div style={{ padding: '12px 4px', fontSize: 12, color: 'var(--texto-secundario)' }}>
                  Marque "Profissional" na aba Principal para liberar a agenda.
                </div>
              ) : (
                <>
                  {loadingAgenda && (
                    <div style={{ fontSize: 12, color: 'var(--texto-terciario)', padding: 4 }}>Carregando...</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {DIAS_SEMANA.map((nomeDia, dia) => {
                      const slot = grade[dia]
                      const temSlot = !!slot
                      const pausasDoDia = pausas.filter(p => p.dia_semana === dia)
                      return (
                        <div key={dia} style={{
                          border: '1px solid var(--borda-media)',
                          borderRadius: 4,
                          padding: '8px 10px',
                          backgroundColor: temSlot ? 'transparent' : 'var(--bg-input)',
                        }}>
                          {/* Header dia */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: temSlot ? 8 : 0 }}>
                            {temSlot ? (
                              <input
                                type="checkbox"
                                checked={slot.ativo}
                                onChange={e => setGrade(g => ({ ...g, [dia]: { ...g[dia], ativo: e.target.checked } }))}
                                title="Atende neste dia"
                                style={{ cursor: 'pointer', width: 16, height: 16 }}
                              />
                            ) : (
                              <input
                                type="checkbox"
                                checked={false}
                                onChange={() => adicionarDia(dia)}
                                title="Clique para habilitar este dia"
                                style={{ cursor: 'pointer', width: 16, height: 16 }}
                              />
                            )}
                            <span style={{
                              fontSize: 13, fontWeight: 600,
                              color: temSlot ? 'var(--texto-principal)' : 'var(--texto-secundario)',
                              flex: 1,
                            }}>
                              {nomeDia}
                            </span>
                            {temSlot && (
                              <button
                                type="button"
                                onClick={() => removerDia(dia)}
                                title="Remover dia da agenda"
                                style={{
                                  padding: '2px 6px', background: 'none',
                                  border: '1px solid var(--borda-media)', borderRadius: 3,
                                  cursor: 'pointer', color: 'var(--cor-erro)', fontSize: 11, lineHeight: 1,
                                }}
                              >
                                <Trash size={11} />
                              </button>
                            )}
                          </div>

                          {/* Campos de horário */}
                          {temSlot && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <label style={{ fontSize: 11, color: 'var(--texto-secundario)', width: 50 }}>Início:</label>
                                <input
                                  type="time"
                                  value={slot.hora_inicio}
                                  onChange={e => setGrade(g => ({ ...g, [dia]: { ...g[dia], hora_inicio: e.target.value } }))}
                                  style={{
                                    padding: '2px 4px', fontSize: 12, fontFamily: 'var(--fonte-mono)', width: 80,
                                    backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                                    border: '1px solid var(--borda-media)', borderRadius: 3,
                                  }}
                                />
                                <label style={{ fontSize: 11, color: 'var(--texto-secundario)', marginLeft: 8, width: 30 }}>Fim:</label>
                                <input
                                  type="time"
                                  value={slot.hora_fim}
                                  onChange={e => setGrade(g => ({ ...g, [dia]: { ...g[dia], hora_fim: e.target.value } }))}
                                  style={{
                                    padding: '2px 4px', fontSize: 12, fontFamily: 'var(--fonte-mono)', width: 80,
                                    backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                                    border: '1px solid var(--borda-media)', borderRadius: 3,
                                  }}
                                />
                                <label style={{ fontSize: 11, color: 'var(--texto-secundario)', marginLeft: 8 }}>Int.:</label>
                                <select
                                  value={slot.intervalo_min}
                                  onChange={e => setGrade(g => ({ ...g, [dia]: { ...g[dia], intervalo_min: Number(e.target.value) } }))}
                                  style={{
                                    padding: '2px 4px', fontSize: 11, width: 70,
                                    backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                                    border: '1px solid var(--borda-media)', borderRadius: 3,
                                  }}
                                >
                                  <option value={15}>15 min</option>
                                  <option value={20}>20 min</option>
                                  <option value={30}>30 min</option>
                                  <option value={45}>45 min</option>
                                  <option value={60}>60 min</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => salvarDia(dia)}
                                  disabled={salvandoDia === dia}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto',
                                    padding: '2px 8px', fontSize: 11,
                                    backgroundColor: 'var(--cor-primaria)', color: '#fff',
                                    border: 'none', borderRadius: 3, cursor: 'pointer',
                                    opacity: salvandoDia === dia ? 0.6 : 1,
                                  }}
                                >
                                  <Save size={11} /> {salvandoDia === dia ? '...' : 'Salvar'}
                                </button>
                              </div>

                              {/* Pausas do dia */}
                              {pausasDoDia.length > 0 && (
                                <div style={{ paddingLeft: 8, borderLeft: '2px solid var(--borda-suave)' }}>
                                  <div style={{ fontSize: 11, color: 'var(--texto-secundario)', marginBottom: 4 }}>Períodos de pausa:</div>
                                  {pausasDoDia.map(pausa => (
                                    <div key={pausa.id} style={{
                                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 3,
                                    }}>
                                      <span style={{ color: 'var(--texto-principal)' }}>
                                        {pausa.hora_inicio} - {pausa.hora_fim}
                                        {pausa.descricao && <span style={{ color: 'var(--texto-secundario)', marginLeft: 4 }}>({pausa.descricao})</span>}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => removerPausa(pausa.id!)}
                                        style={{
                                          marginLeft: 'auto', padding: '1px 4px', background: 'none',
                                          border: '1px solid var(--borda-media)', borderRadius: 2,
                                          cursor: 'pointer', color: 'var(--cor-erro)', lineHeight: 1, fontSize: 10,
                                        }}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Adicionar pausa */}
                              {salvarPausaAbrirEm === dia ? (
                                <div style={{ paddingLeft: 8, borderLeft: '2px solid var(--cor-primaria)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <input type="time" id={`pausa_ini_${dia}`} placeholder="Início" style={{
                                    padding: '2px 4px', fontSize: 11, fontFamily: 'var(--fonte-mono)', width: 70,
                                    backgroundColor: 'var(--bg-input)', border: '1px solid var(--cor-primaria)', borderRadius: 3,
                                  }} />
                                  <input type="time" id={`pausa_fim_${dia}`} placeholder="Fim" style={{
                                    padding: '2px 4px', fontSize: 11, fontFamily: 'var(--fonte-mono)', width: 70,
                                    backgroundColor: 'var(--bg-input)', border: '1px solid var(--cor-primaria)', borderRadius: 3,
                                  }} />
                                  <input type="text" id={`pausa_desc_${dia}`} placeholder="Ex: Almoço" maxLength={30} style={{
                                    padding: '2px 4px', fontSize: 11, flex: 1,
                                    backgroundColor: 'var(--bg-input)', border: '1px solid var(--cor-primaria)', borderRadius: 3,
                                  }} />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const ini = (document.getElementById(`pausa_ini_${dia}`) as HTMLInputElement).value
                                      const fim = (document.getElementById(`pausa_fim_${dia}`) as HTMLInputElement).value
                                      const desc = (document.getElementById(`pausa_desc_${dia}`) as HTMLInputElement).value
                                      if (!ini || !fim) { toast.error('Informe horários'); return }
                                      salvarPausa(dia, { dia_semana: dia, hora_inicio: ini, hora_fim: fim, descricao: desc || undefined })
                                    }}
                                    style={{
                                      padding: '2px 6px', fontSize: 10,
                                      backgroundColor: 'var(--cor-primaria)', color: '#fff',
                                      border: 'none', borderRadius: 3, cursor: 'pointer', whiteSpace: 'nowrap',
                                    }}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSalvarPausaAbrirEm(null)}
                                    style={{
                                      padding: '2px 6px', fontSize: 10, background: 'none',
                                      border: '1px solid var(--borda-media)', borderRadius: 3,
                                      cursor: 'pointer', color: 'var(--texto-terciario)',
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setSalvarPausaAbrirEm(dia)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', fontSize: 11,
                                    background: 'none', border: '1px dashed var(--borda-media)', borderRadius: 3,
                                    cursor: 'pointer', color: 'var(--texto-terciario)', width: 'fit-content',
                                  }}
                                >
                                  <Plus size={11} /> Adicionar pausa
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </Secao>

            {/* Seção de exceções */}
            {pessoa?.id && watch('ind_profissional') && (
              <Secao titulo="Exceções (Datas Específicas)" style={{ marginTop: 12 }}>
                {excecoes.length > 0 && (
                  <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {excecoes.map(exc => {
                      const dataObj = new Date(exc.data + 'T00:00:00')
                      const dataFormatada = dataObj.toLocaleDateString('pt-BR')
                      return (
                        <div key={exc.id} style={{
                          border: '1px solid var(--borda-media)',
                          borderRadius: 4,
                          padding: '6px 8px',
                          backgroundColor: exc.nao_atende ? '#fee' : '#efe',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-principal)' }}>
                                {dataFormatada}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>
                                {exc.nao_atende ? (
                                  <>Não atende</>
                                ) : (
                                  <>{exc.hora_inicio} - {exc.hora_fim} (intervalo: {exc.intervalo_min} min)</>
                                )}
                              </div>
                              {exc.descricao && (
                                <div style={{ fontSize: 10, color: 'var(--texto-terciario)', marginTop: 2 }}>
                                  {exc.descricao}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removerExcecao(exc.id!)}
                              style={{
                                padding: '2px 6px', background: 'none',
                                border: '1px solid var(--borda-media)', borderRadius: 3,
                                cursor: 'pointer', color: 'var(--cor-erro)', lineHeight: 1,
                              }}
                            >
                              <Trash size={11} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Form nova exceção */}
                {mostrarNovaExcecao ? (
                  <div style={{
                    border: '1px solid var(--cor-primaria)',
                    borderRadius: 4,
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-input)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 11, color: 'var(--texto-secundario)', width: 50 }}>Data:</label>
                        <input
                          type="date"
                          id="exc_data"
                          style={{
                            padding: '2px 4px', fontSize: 11, fontFamily: 'var(--fonte-mono)',
                            backgroundColor: '#fff', color: 'var(--texto-principal)',
                            border: '1px solid var(--borda-media)', borderRadius: 3, flex: 1, maxWidth: 140,
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 11, color: 'var(--texto-secundario)', width: 50 }}>Descrição:</label>
                        <input
                          type="text"
                          id="exc_desc"
                          placeholder="Ex: Férias, Feriado, etc"
                          maxLength={100}
                          style={{
                            padding: '2px 4px', fontSize: 11,
                            backgroundColor: '#fff', color: 'var(--texto-principal)',
                            border: '1px solid var(--borda-media)', borderRadius: 3, flex: 1,
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label style={{ fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="checkbox"
                            id="exc_nao_atende"
                            defaultChecked={true}
                            style={{ cursor: 'pointer' }}
                            onChange={e => {
                              const inputs = document.querySelectorAll('#exc_hora_ini, #exc_hora_fim, #exc_intervalo') as NodeListOf<HTMLInputElement>
                              inputs.forEach(i => i.disabled = e.target.checked)
                            }}
                          />
                          <span style={{ color: 'var(--texto-principal)' }}>Não atende o dia todo</span>
                        </label>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 20 }}>
                        <label style={{ fontSize: 11, color: 'var(--texto-secundario)', width: 50 }}>Ou início:</label>
                        <input
                          type="time"
                          id="exc_hora_ini"
                          disabled
                          style={{
                            padding: '2px 4px', fontSize: 11, fontFamily: 'var(--fonte-mono)',
                            backgroundColor: '#f0f0f0', color: 'var(--texto-principal)',
                            border: '1px solid var(--borda-media)', borderRadius: 3, width: 80,
                          }}
                        />
                        <label style={{ fontSize: 11, color: 'var(--texto-secundario)' }}>Fim:</label>
                        <input
                          type="time"
                          id="exc_hora_fim"
                          disabled
                          style={{
                            padding: '2px 4px', fontSize: 11, fontFamily: 'var(--fonte-mono)',
                            backgroundColor: '#f0f0f0', color: 'var(--texto-principal)',
                            border: '1px solid var(--borda-media)', borderRadius: 3, width: 80,
                          }}
                        />
                        <label style={{ fontSize: 11, color: 'var(--texto-secundario)', marginLeft: 8 }}>Int.:</label>
                        <select
                          id="exc_intervalo"
                          disabled
                          defaultValue={30}
                          style={{
                            padding: '2px 4px', fontSize: 11,
                            backgroundColor: '#f0f0f0', color: 'var(--texto-principal)',
                            border: '1px solid var(--borda-media)', borderRadius: 3, width: 70,
                          }}
                        >
                          <option value={15}>15 min</option>
                          <option value={20}>20 min</option>
                          <option value={30}>30 min</option>
                          <option value={45}>45 min</option>
                          <option value={60}>60 min</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => {
                            const data = (document.getElementById('exc_data') as HTMLInputElement).value
                            const desc = (document.getElementById('exc_desc') as HTMLInputElement).value
                            const nao_atende = (document.getElementById('exc_nao_atende') as HTMLInputElement).checked
                            const hora_ini = (document.getElementById('exc_hora_ini') as HTMLInputElement).value
                            const hora_fim = (document.getElementById('exc_hora_fim') as HTMLInputElement).value
                            const intervalo = (document.getElementById('exc_intervalo') as HTMLSelectElement).value
                            salvarExcecao({
                              data,
                              descricao: desc || undefined,
                              nao_atende,
                              hora_inicio: nao_atende ? undefined : hora_ini,
                              hora_fim: nao_atende ? undefined : hora_fim,
                              intervalo_min: nao_atende ? undefined : Number(intervalo),
                            })
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            padding: '2px 8px', fontSize: 11,
                            backgroundColor: 'var(--cor-primaria)', color: '#fff',
                            border: 'none', borderRadius: 3, cursor: 'pointer',
                          }}
                        >
                          <Save size={11} /> Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setMostrarNovaExcecao(false)}
                          style={{
                            padding: '2px 8px', fontSize: 11, background: 'none',
                            border: '1px solid var(--borda-media)', borderRadius: 3,
                            cursor: 'pointer', color: 'var(--texto-terciario)',
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMostrarNovaExcecao(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3, width: 'fit-content',
                      padding: '2px 8px', fontSize: 11,
                      background: 'none', border: '1px dashed var(--borda-media)',
                      borderRadius: 3, cursor: 'pointer', color: 'var(--texto-terciario)',
                    }}
                  >
                    <Plus size={11} /> Adicionar exceção
                  </button>
                )}
              </Secao>
            )}
          </>
        )}

        {aba === 'Consultas' && (
          <Secao titulo="Histórico Clínico">
            {!pessoa?.id ? (
              <div style={{ padding: '12px 4px', fontSize: 12, color: 'var(--texto-secundario)' }}>
                Salve o cadastro primeiro para ver o histórico de consultas.
              </div>
            ) : (
              <HistoricoClinico pacienteId={pessoa.id} />
            )}
          </Secao>
        )}

      </div>
    </form>
  )
}
