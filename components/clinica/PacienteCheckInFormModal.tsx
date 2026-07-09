'use client'

import { forwardRef, useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X, Save, Camera, Search, RefreshCw, User, DollarSign, CheckCircle2 } from 'lucide-react'
import RecebimentoModal from '@/components/clinica/RecebimentoModal'
import HistoricoClinico from '@/components/clinica/HistoricoClinico'
import { toast } from 'sonner'
import type { AgendamentoListItem } from '@/types/clinica.types'

interface Pessoa {
  id: number
  nome: string
  nome_fantasia?: string
  tipo_pessoa: string
  cpf_cnpj?: string
  data_nascimento?: string
  sexo?: string
  cor_raca?: string
  estado_civil?: string
  naturalidade?: string
  profissao?: string | null
  altura?: string | null
  peso?: string | null
  rg_ie?: string
  im?: string
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
  telefone?: string
  celular?: string
  whatsapp?: string
  email?: string
  email_nfe?: string
  foto?: string | null
  pai_pessoa_id?: number | null
  pai_nome?: string
  pai_paciente?: boolean
  mae_pessoa_id?: number | null
  mae_nome?: string
  mae_paciente?: boolean
  conjuge_pessoa_id?: number | null
  conjuge_nome?: string
  conjuge_paciente?: boolean
  indicacao_pessoa_id?: number | null
  indicacao_nome?: string
  indicacao_fone?: string
  indicacao_ligacao?: string
}

interface Props {
  open: boolean
  paciente?: Pessoa | null
  agendamento?: AgendamentoListItem | null
  agendamentos?: AgendamentoListItem[]
  onClose: () => void
  onSaved?: () => void
  ocultarRecebimento?: boolean
}

const STATUS_COLOR: Record<string, string> = {
  AGENDADO:   '#378ADD',
  CONFIRMADO: '#7E57C2',
  AGUARDANDO: '#EF9F27',
  ATENDIDO:   '#1D9E75',
  FALTOU:     '#E24B4A',
  CANCELADO:  '#888780',
}

const STATUS_LABEL: Record<string, string> = {
  AGENDADO:   'Agendado',
  CONFIRMADO: 'Confirmado',
  AGUARDANDO: 'Aguardando',
  ATENDIDO:   'Atendido',
  FALTOU:     'Faltou',
  CANCELADO:  'Cancelado',
}

const UFS = [
  { sigla: 'AC', nome: 'ACRE' }, { sigla: 'AL', nome: 'ALAGOAS' }, { sigla: 'AP', nome: 'AMAPA' },
  { sigla: 'AM', nome: 'AMAZONAS' }, { sigla: 'BA', nome: 'BAHIA' }, { sigla: 'CE', nome: 'CEARA' },
  { sigla: 'DF', nome: 'DISTRITO FEDERAL' }, { sigla: 'ES', nome: 'ESPIRITO SANTO' },
  { sigla: 'GO', nome: 'GOIAS' }, { sigla: 'MA', nome: 'MARANHAO' }, { sigla: 'MT', nome: 'MATO GROSSO' },
  { sigla: 'MS', nome: 'MATO GROSSO DO SUL' }, { sigla: 'MG', nome: 'MINAS GERAIS' },
  { sigla: 'PA', nome: 'PARA' }, { sigla: 'PB', nome: 'PARAIBA' }, { sigla: 'PR', nome: 'PARANA' },
  { sigla: 'PE', nome: 'PERNAMBUCO' }, { sigla: 'PI', nome: 'PIAUI' }, { sigla: 'RJ', nome: 'RIO DE JANEIRO' },
  { sigla: 'RN', nome: 'RIO GRANDE DO NORTE' }, { sigla: 'RS', nome: 'RIO GRANDE DO SUL' },
  { sigla: 'RO', nome: 'RONDONIA' }, { sigla: 'RR', nome: 'RORAIMA' }, { sigla: 'SC', nome: 'SANTA CATARINA' },
  { sigla: 'SP', nome: 'SAO PAULO' }, { sigla: 'SE', nome: 'SERGIPE' }, { sigla: 'TO', nome: 'TOCANTINS' },
]

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

function validarCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false
  let s = 0
  for (let i = 0; i < 9; i++) s += +d[i] * (10 - i)
  let r = (s * 10) % 11; if (r >= 10) r = 0
  if (r !== +d[9]) return false
  s = 0
  for (let i = 0; i < 10; i++) s += +d[i] * (11 - i)
  r = (s * 10) % 11; if (r >= 10) r = 0
  return r === +d[10]
}

function validarCnpj(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (n: string, len: number) => {
    let s = 0, p = len - 7
    for (let i = len; i >= 1; i--) { s += +n[len - i] * p--; if (p < 2) p = 9 }
    const r = s % 11; return r < 2 ? 0 : 11 - r
  }
  return calc(d, 12) === +d[12] && calc(d, 13) === +d[13]
}

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

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, onBlur, onFocus, onChange, type, ...props }, ref) {
    const isText = type !== 'email' && type !== 'number' && type !== 'search' && type !== 'date'
    return (
      <input
        ref={ref}
        type={type === 'search' ? 'text' : type}
        {...props}
        autoComplete="new-password"
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

function Secao({ titulo, children, style }: { titulo: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <fieldset style={{
      border: '1px solid var(--borda-media)', borderRadius: 4,
      padding: '6px 10px 10px', margin: 0, ...style,
    }}>
      <legend style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-secundario)',
        padding: '0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {titulo}
      </legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {children}
      </div>
    </fieldset>
  )
}

function FotoCaptura({ foto, onChange }: { foto?: string | null; onChange: (v: string | null) => void }) {
  const [modo,      setModo]      = useState<'idle' | 'camera' | 'preview'>('idle')
  const [capturada, setCapturada] = useState<string | null>(null)
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  function pararStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => pararStream(), [])

  async function abrirCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 400, facingMode: 'user' } })
      streamRef.current = stream
      setModo('camera')
    } catch {
      toast.error('Câmera não disponível ou sem permissão')
    }
  }

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
      {modo !== 'idle' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
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
            {modo === 'camera' && (
              <video ref={videoRef} autoPlay playsInline muted style={{
                width: 280, height: 280, objectFit: 'cover', borderRadius: '50%',
                border: '4px solid var(--cor-primaria)', backgroundColor: '#000',
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
        autoComplete="new-password"
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
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1050,
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

export default function PacienteCheckInFormModal({ open, paciente, agendamento, agendamentos, onClose, onSaved, ocultarRecebimento }: Props) {
  const { register, watch, setValue, handleSubmit, reset } = useForm({
    defaultValues: {
      tipo_pessoa: 'F',
      nome: '', nome_fantasia: '', cpf_cnpj: '', rg_ie: '', im: '',
      data_nascimento: '', sexo: '', cor_raca: '', estado_civil: '', naturalidade: '', profissao: '', altura: null as number | null, peso: null as number | null,
      cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
      telefone: '', celular: '', whatsapp: '', email: '', email_nfe: '',
      foto: null as string | null,
      pai_pessoa_id: null as number | null, pai_nome: '', pai_paciente: false,
      mae_pessoa_id: null as number | null, mae_nome: '', mae_paciente: false,
      conjuge_pessoa_id: null as number | null, conjuge_nome: '', conjuge_paciente: false,
      indicacao_pessoa_id: null as number | null, indicacao_nome: '', indicacao_fone: '', indicacao_ligacao: '',
    },
  })

  const [saving,       setSaving]       = useState(false)
  const [buscandoCep,  setBuscandoCep]  = useState(false)
  const [cpfStatus,    setCpfStatus]    = useState<'valido' | 'invalido' | null>(null)
  const [recModalOpen, setRecModalOpen] = useState(false)
  const [pagosIds,     setPagosIds]     = useState<Set<number>>(new Set())
  const [finalizando,  setFinalizando]  = useState(false)

  const [aba, setAba] = useState<'Cadastro' | 'Histórico Clínico'>('Cadastro')

  useEffect(() => {
    if (open && paciente) {
      setCpfStatus(null)
      setPagosIds(new Set())
      const rawDoc = (paciente.cpf_cnpj ?? '').replace(/\D/g, '')
      reset({
        tipo_pessoa:        paciente.tipo_pessoa ?? 'F',
        nome:               paciente.nome ?? '',
        nome_fantasia:      paciente.nome_fantasia ?? '',
        cpf_cnpj:           mascaraCpfCnpj(rawDoc, paciente.tipo_pessoa === 'J'),
        rg_ie:              paciente.rg_ie ?? '',
        im:                 paciente.im ?? '',
        data_nascimento:    paciente.data_nascimento?.slice(0, 10) ?? '',
        sexo:               paciente.sexo ?? '',
        cor_raca:           paciente.cor_raca ?? '',
        estado_civil:       paciente.estado_civil ?? '',
        naturalidade:       paciente.naturalidade ?? '',
        profissao:          paciente.profissao ?? '',
        altura:             paciente.altura != null ? Number(paciente.altura) : null,
        peso:               paciente.peso   != null ? Number(paciente.peso)   : null,
        cep:                paciente.cep ?? '',
        logradouro:         paciente.logradouro ?? '',
        numero:             paciente.numero ?? '',
        complemento:        paciente.complemento ?? '',
        bairro:             paciente.bairro ?? '',
        cidade:             paciente.cidade ?? '',
        uf:                 paciente.uf ?? '',
        telefone:           paciente.telefone ?? '',
        celular:            paciente.celular ?? '',
        whatsapp:           paciente.whatsapp ?? '',
        email:              paciente.email ?? '',
        email_nfe:          paciente.email_nfe ?? '',
        foto:               paciente.foto ?? null,
        pai_pessoa_id:      paciente.pai_pessoa_id ?? null,
        pai_nome:           paciente.pai_nome ?? '',
        pai_paciente:       paciente.pai_paciente ?? false,
        mae_pessoa_id:      paciente.mae_pessoa_id ?? null,
        mae_nome:           paciente.mae_nome ?? '',
        mae_paciente:       paciente.mae_paciente ?? false,
        conjuge_pessoa_id:  paciente.conjuge_pessoa_id ?? null,
        conjuge_nome:       paciente.conjuge_nome ?? '',
        conjuge_paciente:   paciente.conjuge_paciente ?? false,
        indicacao_pessoa_id: paciente.indicacao_pessoa_id ?? null,
        indicacao_nome:     paciente.indicacao_nome ?? '',
        indicacao_fone:     paciente.indicacao_fone ?? '',
        indicacao_ligacao:  paciente.indicacao_ligacao ?? '',
      })
    }
  }, [open, paciente, reset])

  // O modal não desmonta quando fecha (só retorna null), então o estado de aba
  // persiste entre aberturas — resetar no fechamento evita mostrar por um frame
  // a aba anterior (e o HistoricoClinico chegar a montar/buscar dados à toa) antes
  // de um useEffect corrigir depois da abertura já ter renderizado.
  function fecharModal() {
    setAba('Cadastro')
    onClose()
  }

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

  async function handleRecebimentoSalvo() {
    const listaAgsAll = (agendamentos && agendamentos.length > 0) ? agendamentos : agendamento ? [agendamento] : []
    const pending = listaAgsAll.filter(ag => !pagosIds.has(ag.id) && !['CANCELADO', 'FALTOU'].includes(ag.status))
    await Promise.all(
      pending.map(ag =>
        fetch(`/api/clinica/agendamentos/${ag.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'AGUARDANDO' }),
        }).catch(() => {})
      )
    )
    setPagosIds(prev => new Set([...prev, ...pending.map(ag => ag.id)]))
    setRecModalOpen(false)
    onSaved?.()
  }

  async function finalizarAtendimento() {
    if (!agendamento) return
    setFinalizando(true)
    try {
      const res = await fetch(`/api/clinica/agendamentos/${agendamento.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ATENDIDO' }),
      })
      if (res.ok) {
        toast.success('Atendimento finalizado!')
        onSaved?.()
        fecharModal()
      } else {
        toast.error('Erro ao finalizar atendimento')
      }
    } catch {
      toast.error('Erro ao finalizar atendimento')
    } finally {
      setFinalizando(false)
    }
  }

  async function onSubmit(data: any) {
    if (!paciente) return
    const rawDoc = (data.cpf_cnpj ?? '').replace(/\D/g, '')
    if (rawDoc) {
      const valido = data.tipo_pessoa === 'J' ? validarCnpj(rawDoc) : validarCpf(rawDoc)
      setCpfStatus(valido ? 'valido' : 'invalido')
      if (!valido) {
        toast.error(data.tipo_pessoa === 'J' ? 'CNPJ inválido' : 'CPF inválido')
        return
      }
    }
    setSaving(true)
    try {
      const payload = { ...data, cpf_cnpj: rawDoc || null }
      const res = await fetch(`/api/cadastro/pessoas/${paciente.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success('Dados atualizados!')
        onSaved?.()
        fecharModal()
      } else {
        toast.error('Erro ao salvar')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!open || !paciente) return null

  const pj = watch('tipo_pessoa') === 'J'

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
      padding: 16,
    }}>
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 6,
        maxWidth: 1100,
        width: '100%',
        maxHeight: '95vh',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
      }}>
        {/* Header */}
        <div style={{
          background: 'var(--cor-primaria)',
          color: 'white',
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          flexShrink: 0,
        }}>
          {/* Avatar */}
          <div style={{
            width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid rgba(255,255,255,0.35)',
          }}>
            {watch('foto')
              ? <img src={watch('foto')!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <User size={22} color="white" strokeWidth={1.4} />
            }
          </div>

          {/* Info paciente + agendamento */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
              {watch('nome') || 'Paciente'}
            </div>
            {agendamento && (
              <div style={{ fontSize: 11, opacity: 0.82, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600 }}>
                  {format(parseISO(agendamento.data_hora_inicio), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                </span>
                {agendamento.profissional_nome && (
                  <><span style={{ opacity: 0.5 }}>·</span><span>{agendamento.profissional_nome}</span></>
                )}
                {agendamento.tipo_descricao && (
                  <><span style={{ opacity: 0.5 }}>·</span><span>{agendamento.tipo_descricao}</span></>
                )}
                {agendamento.status && (
                  <span style={{
                    display: 'inline-block',
                    background: 'rgba(255,255,255,0.22)',
                    borderRadius: 20,
                    padding: '1px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.03em',
                    marginLeft: 2,
                  }}>
                    {STATUS_LABEL[agendamento.status] ?? agendamento.status}
                  </span>
                )}
              </div>
            )}
            {!agendamento && (
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>Cadastro de Paciente</div>
            )}
          </div>

          {/* Close */}
          <button
            type="button"
            onClick={fecharModal}
            style={{
              background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
              padding: '6px 8px', borderRadius: 4, color: 'white',
              display: 'flex', alignItems: 'center', flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Abas */}
        <div style={{
          display: 'flex', gap: 4, padding: '0 16px',
          borderBottom: '1px solid var(--borda-suave)', backgroundColor: 'var(--bg-page)',
          flexShrink: 0,
        }}>
          {(['Cadastro', 'Histórico Clínico'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setAba(t)}
              style={{
                padding: '9px 14px', fontSize: 12.5, fontWeight: 600,
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: aba === t ? '2px solid var(--cor-primaria)' : '2px solid transparent',
                color: aba === t ? 'var(--cor-primaria)' : 'var(--texto-secundario)',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Formulário */}
        {aba === 'Cadastro' && (
        <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" style={{
          flex: 1, overflowY: 'auto', padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>

          {/* ══ SEÇÃO PRINCIPAL ════════════════════════════════════ */}
          <Secao titulo="Principal">

            {/* Layout 3 colunas: Foto | Identificação | Dados pessoais */}
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: '0 16px', alignItems: 'start' }}>

              {/* Col 1 — Foto */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
                <FotoCaptura foto={watch('foto') as string | null} onChange={v => setValue('foto', v)} />
              </div>

              {/* Col 2 — Nome + Natureza + CPF/RG */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <FormRow label="Nome:">
                  <Input {...register('nome')} />
                </FormRow>
                <FormRow label="Nome Fantasia:">
                  <Input {...register('nome_fantasia')} />
                </FormRow>

                <FormRow label={pj ? 'CNPJ:' : 'CPF:'}>
                  {(() => {
                    const cpfField = register('cpf_cnpj')
                    const borderColor = cpfStatus === 'valido'
                      ? 'var(--cor-sucesso, #1D9E75)'
                      : cpfStatus === 'invalido'
                      ? 'var(--cor-erro, #E24B4A)'
                      : undefined
                    return (
                      <>
                        <Input
                          {...cpfField}
                          onChange={e => {
                            setCpfStatus(null)
                            e.target.value = mascaraCpfCnpj(e.target.value, pj)
                            cpfField.onChange(e)
                          }}
                          onBlur={e => {
                            const raw = e.target.value.replace(/\D/g, '')
                            if (raw) setCpfStatus((pj ? validarCnpj : validarCpf)(raw) ? 'valido' : 'invalido')
                            else setCpfStatus(null)
                            cpfField.onBlur(e)
                          }}
                          style={{ fontFamily: 'var(--fonte-mono)', borderColor }}
                        />
                        {cpfStatus === 'valido' && (
                          <span style={{ color: '#1D9E75', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>✓</span>
                        )}
                        {cpfStatus === 'invalido' && (
                          <span style={{ color: '#E24B4A', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {pj ? 'CNPJ inválido' : 'CPF inválido'}
                          </span>
                        )}
                      </>
                    )
                  })()}
                </FormRow>
                <FormRow label={pj ? 'IE-ST:' : 'RG:'}>
                  <Input {...register('rg_ie')} />
                </FormRow>
                {pj && (
                  <FormRow label="Insc. Municipal:">
                    <Input {...register('im')} />
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

          {/* ══ AGENDAMENTO(S) ══════════════════════════════════════ */}
          {(() => {
            const listaAgs = (agendamentos && agendamentos.length > 0)
              ? agendamentos
              : agendamento ? [agendamento] : []
            if (listaAgs.length === 0) return null
            return (
              <Secao titulo={listaAgs.length > 1 ? `Agendamentos do dia (${listaAgs.length})` : 'Agendamento'}>
                {listaAgs.length === 1 && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-principal)', marginBottom: 4 }}>
                    {format(parseISO(listaAgs[0].data_hora_inicio), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                  </div>
                )}
                {(() => {
                  if (ocultarRecebimento) return null
                  const algumPodeReceber = listaAgs.some(
                    ag => !pagosIds.has(ag.id) && !['CANCELADO', 'FALTOU'].includes(ag.status)
                  )
                  if (!algumPodeReceber) return null
                  const somaTotal = listaAgs
                    .filter(ag => !pagosIds.has(ag.id) && !['CANCELADO', 'FALTOU'].includes(ag.status))
                    .reduce((acc, ag) => acc + (Number(ag.tipo_valor) || 0), 0)
                  return (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      {somaTotal > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>
                          Total: <strong style={{ color: 'var(--cor-primaria)' }}>
                            {somaTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </strong>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setRecModalOpen(true)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          fontSize: 12, fontWeight: 700, color: '#fff',
                          background: '#1D9E75',
                          padding: '6px 16px', borderRadius: 6,
                          border: 'none', cursor: 'pointer',
                          transition: 'opacity 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                      >
                        <DollarSign size={14} /> RECEBER
                      </button>
                    </div>
                  )
                })()}
                {listaAgs.map(ag => {
                  const jaFoiPago = pagosIds.has(ag.id) || (!!ag.recebimento_id && ag.status_recebimento === 'PAGO')
                  const statusAtual = pagosIds.has(ag.id) ? 'AGUARDANDO' : ag.status
                  const statusColor = STATUS_COLOR[statusAtual] ?? '#378ADD'
                  const podeReceber = !jaFoiPago && !['CANCELADO', 'FALTOU'].includes(statusAtual)
                  const durMin = Math.round(
                    (new Date(ag.data_hora_fim).getTime() - new Date(ag.data_hora_inicio).getTime()) / 60000
                  )
                  return (
                    <div key={ag.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px',
                      background: statusColor + '12',
                      borderLeft: `3px solid ${statusColor}`,
                      borderRadius: 4,
                      marginBottom: 6,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: statusColor, flexShrink: 0, width: 42 }}>
                        {format(parseISO(ag.data_hora_inicio), 'HH:mm')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--texto-terciario)', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {ag.profissional_nome && <span>{ag.profissional_nome}</span>}
                          {ag.tipo_descricao && <><span>·</span><span>{ag.tipo_descricao}</span></>}
                          {ag.categoria_descricao && <><span>·</span><span>{ag.categoria_descricao}</span></>}
                          {durMin > 0 && <><span>·</span><span>{durMin}min</span></>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {ag.tipo_valor ? (
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--cor-primaria)' }}>
                            {Number(ag.tipo_valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </div>
                        ) : null}
                        {jaFoiPago && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: 11, fontWeight: 700, color: '#1D9E75',
                            background: '#1D9E7520',
                            padding: '3px 10px', borderRadius: 20,
                          }}>
                            <CheckCircle2 size={12} />
                            Pago
                          </div>
                        )}
                        <div style={{
                          fontSize: 11, fontWeight: 700, color: statusColor,
                          background: statusColor + '20',
                          padding: '3px 10px', borderRadius: 20,
                        }}>
                          {STATUS_LABEL[statusAtual] ?? statusAtual}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </Secao>
            )
          })()}

          {/* Botões */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button
              type="button"
              onClick={fecharModal}
              style={{
                padding: '4px 14px', borderRadius: 3, border: '1px solid var(--borda-media)',
                background: 'none', color: 'var(--texto-principal)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px',
                background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3,
                fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              <Save size={12} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
            {agendamento && agendamento.status !== 'ATENDIDO' && (
              <button
                type="button"
                disabled={finalizando}
                onClick={finalizarAtendimento}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 18px', borderRadius: 6,
                  background: finalizando ? '#15a073' : 'linear-gradient(135deg,#1D9E75,#15a073)',
                  color: '#fff', border: 'none',
                  fontSize: 12, fontWeight: 700, cursor: finalizando ? 'not-allowed' : 'pointer',
                  opacity: finalizando ? 0.75 : 1,
                  boxShadow: '0 2px 8px rgba(29,158,117,0.35)',
                  transition: 'opacity 0.15s, transform 0.1s',
                  letterSpacing: '0.02em',
                }}
                onMouseEnter={e => { if (!finalizando) e.currentTarget.style.opacity = '0.88' }}
                onMouseLeave={e => { if (!finalizando) e.currentTarget.style.opacity = '1' }}
              >
                <CheckCircle2 size={14} />
                {finalizando ? 'Finalizando...' : 'Finalizar Atendimento'}
              </button>
            )}
          </div>

        </form>
        )}

        {/* Histórico Clínico — prontuário + emissão de receita, sempre disponível
            (inclusive pro atendimento atual, mesmo antes dele virar ATENDIDO) */}
        {aba === 'Histórico Clínico' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <HistoricoClinico pacienteId={paciente.id} agendamentoAtual={agendamento ?? null} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={fecharModal}
                style={{
                  padding: '4px 14px', borderRadius: 3, border: '1px solid var(--borda-media)',
                  background: 'none', color: 'var(--texto-principal)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Fechar
              </button>
              {agendamento && agendamento.status !== 'ATENDIDO' && (
                <button
                  type="button"
                  disabled={finalizando}
                  onClick={finalizarAtendimento}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 18px', borderRadius: 6,
                    background: finalizando ? '#15a073' : 'linear-gradient(135deg,#1D9E75,#15a073)',
                    color: '#fff', border: 'none',
                    fontSize: 12, fontWeight: 700, cursor: finalizando ? 'not-allowed' : 'pointer',
                    opacity: finalizando ? 0.75 : 1,
                    boxShadow: '0 2px 8px rgba(29,158,117,0.35)',
                    transition: 'opacity 0.15s',
                    letterSpacing: '0.02em',
                  }}
                  onMouseEnter={e => { if (!finalizando) e.currentTarget.style.opacity = '0.88' }}
                  onMouseLeave={e => { if (!finalizando) e.currentTarget.style.opacity = '1' }}
                >
                  <CheckCircle2 size={14} />
                  {finalizando ? 'Finalizando...' : 'Finalizar Atendimento'}
                </button>
              )}
            </div>
          </div>
        )}

        {(() => {
          if (ocultarRecebimento) return null
          const listaAgsAll = (agendamentos && agendamentos.length > 0) ? agendamentos : agendamento ? [agendamento] : []
          const pendingAgs = listaAgsAll.filter(ag => !pagosIds.has(ag.id) && !['CANCELADO', 'FALTOU'].includes(ag.status))
          if (pendingAgs.length === 0) return null
          return (
            <RecebimentoModal
              open={recModalOpen}
              onClose={() => setRecModalOpen(false)}
              agendamento={pendingAgs[0]}
              agendamentos={pendingAgs}
              onRecebimentoSalvo={handleRecebimentoSalvo}
            />
          )
        })()}
      </div>
    </div>
  )
}
