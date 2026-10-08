'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { X, Search, User, UserPlus, AlertTriangle, Stethoscope } from 'lucide-react'
import { format } from 'date-fns'
import type { AgendamentoListItem, AgendamentoTipo, CategoriaListItem, ProfissionalListItem } from '@/types/clinica.types'

interface Paciente {
  id:       number
  nome:     string
  cpf_cnpj: string | null
  celular:  string | null
}

interface PacienteDuplicado {
  id:              number
  nome:            string
  cpf_cnpj:        string | null
  celular:         string | null
  data_nascimento: string | null
  score:           number
  nivel:           'ALTA' | 'MEDIA'
  motivos:         string[]
}

interface Props {
  open:       boolean
  onClose:    () => void
  // Devolve o agendamento (oculto da agenda) já criado, pronto pro RecebimentoModal normal
  onCriado:   (agendamento: AgendamentoListItem) => void
  // Data selecionada na tela de Recebimento — o lançamento avulso herda essa data
  dataPadrao: string // yyyy-MM-dd
}

function validarCPF(valor: string): boolean {
  const c = valor.replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(c[i]) * (10 - i)
  let r = (soma * 10) % 11
  if (r === 10 || r === 11) r = 0
  if (r !== parseInt(c[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(c[i]) * (11 - i)
  r = (soma * 10) % 11
  if (r === 10 || r === 11) r = 0
  return r === parseInt(c[10])
}

function validarCNPJ(valor: string): boolean {
  const c = valor.replace(/\D/g, '')
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false
  const calc = (s: string, n: number) => {
    let soma = 0; let pos = n - 7
    for (let i = n; i >= 1; i--) { soma += parseInt(s[n - i]) * pos--; if (pos < 2) pos = 9 }
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(c, 12) === parseInt(c[12]) && calc(c, 13) === parseInt(c[13])
}

function validarCpfCnpj(valor: string): boolean {
  const digits = valor.replace(/\D/g, '')
  if (digits.length === 11) return validarCPF(digits)
  if (digits.length === 14) return validarCNPJ(digits)
  return false
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
      {children}{required && <span style={{ color: 'var(--cor-erro)', marginLeft: 2 }}>*</span>}
    </div>
  )
}

function Field({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', ...style }}>{children}</div>
}

export default function LancamentoAvulsoModal({ open, onClose, onCriado, dataPadrao }: Props) {
  const [profissionais, setProfissionais] = useState<ProfissionalListItem[]>([])
  const [tipos,         setTipos]         = useState<AgendamentoTipo[]>([])
  const [categorias,    setCategorias]    = useState<CategoriaListItem[]>([])
  const [carregado,     setCarregado]     = useState(false)
  const [exigeDataNascimento, setExigeDataNascimento] = useState(true)
  const [exigeCpfCnpj,        setExigeCpfCnpj]        = useState(false)
  const [exigeCelular,        setExigeCelular]        = useState(true)
  const [saving, setSaving] = useState(false)

  const [pacientes,     setPacientes]     = useState<Paciente[]>([])
  const [pacienteSel,   setPacienteSel]   = useState<Paciente | null>(null)
  const [buscaPaciente, setBuscaPaciente] = useState('')
  const [loadingPac,    setLoadingPac]    = useState(false)

  const [showCadRapido, setShowCadRapido] = useState(false)
  const [salvandoCad,   setSalvandoCad]   = useState(false)
  const [formCad, setFormCad] = useState({ nome: '', data_nascimento: '', cpf_cnpj: '', celular: '' })
  const [cpfJaCadastrado, setCpfJaCadastrado] = useState<Paciente | null>(null)
  const [verificandoCpf,  setVerificandoCpf]  = useState(false)
  const [duplicados,      setDuplicados]      = useState<PacienteDuplicado[]>([])
  const [verificandoDuplicidade, setVerificandoDuplicidade] = useState(false)
  const [confirmarNaoDuplicado,  setConfirmarNaoDuplicado]  = useState(false)

  const [form, setForm] = useState({
    profissional_id: 0,
    tipo_id:         null as number | null,
    categoria_id:    null as number | null,
    data:            dataPadrao,
    hora:            '', // opcional — vazio = agora
  })

  useEffect(() => {
    if (!open) return
    setCarregado(false)
    setExigeDataNascimento(true)
    setExigeCpfCnpj(false)
    setExigeCelular(true)
    Promise.all([
      fetch('/api/clinica/profissionais').then(r => r.json()),
      fetch('/api/clinica/tipos-agendamento?limit=100').then(r => r.json()),
      fetch('/api/clinica/categorias?limit=200').then(r => r.json()),
      fetch('/api/clinica/agendamentos/parametros').then(r => r.json()),
    ]).then(([p, t, c, parametros]) => {
      setProfissionais(p.dados ?? [])
      setTipos(t.dados ?? [])
      setCategorias(c.dados ?? [])
      setExigeDataNascimento(!!parametros.paciente_exige_data_nascimento)
      setExigeCpfCnpj(!!parametros.paciente_exige_cpf_cnpj)
      setExigeCelular(parametros.paciente_exige_celular ?? true)
      setCarregado(true)
    }).catch(() => {
      toast.error('Erro ao carregar dados do lançamento')
      setCarregado(true)
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    setForm({ profissional_id: 0, tipo_id: null, categoria_id: null, data: dataPadrao, hora: '' })
    setBuscaPaciente('')
    setPacienteSel(null)
    setPacientes([])
    setShowCadRapido(false)
    setFormCad({ nome: '', data_nascimento: '', cpf_cnpj: '', celular: '' })
    setDuplicados([])
    setConfirmarNaoDuplicado(false)
    setCpfJaCadastrado(null)
  }, [open, dataPadrao])

  const buscarPacientes = useCallback(async (q: string) => {
    if (q.length < 2) { setPacientes([]); return }
    setLoadingPac(true)
    try {
      const res = await fetch(`/api/clinica/pacientes?busca=${encodeURIComponent(q)}`)
      if (!res.ok) { setPacientes([]); return }
      const data = await res.json()
      setPacientes(data.dados ?? [])
    } catch { setPacientes([]) }
    finally { setLoadingPac(false) }
  }, [])

  useEffect(() => {
    if (pacienteSel) return
    const t = setTimeout(() => buscarPacientes(buscaPaciente), 300)
    return () => clearTimeout(t)
  }, [buscaPaciente, buscarPacientes, pacienteSel])

  function selecionarPaciente(p: Paciente) {
    setPacienteSel(p)
    setBuscaPaciente(p.nome)
    setPacientes([])
    setShowCadRapido(false)
  }

  function limparPaciente() {
    setPacienteSel(null)
    setBuscaPaciente('')
    setPacientes([])
    setShowCadRapido(false)
  }

  function abrirCadRapido() {
    setFormCad({ nome: buscaPaciente.trim(), data_nascimento: '', cpf_cnpj: '', celular: '' })
    setCpfJaCadastrado(null)
    setDuplicados([])
    setConfirmarNaoDuplicado(false)
    setShowCadRapido(true)
    setPacientes([])
  }

  async function verificarCpfExistente(cpf: string) {
    const digits = cpf.replace(/\D/g, '')
    if (digits.length !== 11 && digits.length !== 14) { setCpfJaCadastrado(null); return }
    if (!validarCpfCnpj(digits)) { setCpfJaCadastrado(null); return }
    setVerificandoCpf(true)
    try {
      const res = await fetch(`/api/clinica/pacientes?cpf=${encodeURIComponent(digits)}`)
      if (!res.ok) return
      const data = await res.json()
      const encontrado = (data.dados ?? []).find((p: Paciente) => p.cpf_cnpj?.replace(/\D/g, '') === digits)
      setCpfJaCadastrado(encontrado ?? null)
    } catch { /* silencia erro de rede */ }
    finally { setVerificandoCpf(false) }
  }

  async function verificarDuplicidade() {
    setVerificandoDuplicidade(true)
    try {
      const params = new URLSearchParams({ nome: formCad.nome.trim() })
      if (formCad.data_nascimento) params.set('data_nascimento', formCad.data_nascimento)
      if (formCad.celular.trim())  params.set('celular', formCad.celular.trim())
      const res = await fetch(`/api/clinica/pacientes/checar-duplicidade?${params}`)
      if (!res.ok) { setDuplicados([]); return }
      const data = await res.json()
      setDuplicados(data.dados ?? [])
    } catch { /* silencia erro de rede */ }
    finally { setVerificandoDuplicidade(false) }
  }

  useEffect(() => {
    if (!showCadRapido || formCad.nome.trim().length < 3) { setDuplicados([]); return }
    setConfirmarNaoDuplicado(false)
    const t = setTimeout(() => verificarDuplicidade(), 500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCadRapido, formCad.nome, formCad.data_nascimento, formCad.celular])

  const temDuplicataAlta = duplicados.some(d => d.nivel === 'ALTA')

  async function handleCadastroRapido() {
    if (cpfJaCadastrado) {
      selecionarPaciente(cpfJaCadastrado)
      toast.success(`Paciente ${cpfJaCadastrado.nome} selecionado!`)
      return
    }
    if (!formCad.nome.trim())                            { toast.error('Informe o nome do paciente'); return }
    if (exigeDataNascimento && !formCad.data_nascimento)  { toast.error('Informe a data de nascimento'); return }
    if (exigeCelular && !formCad.celular.trim())          { toast.error('Informe o celular'); return }
    if (exigeCpfCnpj && !formCad.cpf_cnpj.trim())         { toast.error('Informe o CPF / CNPJ'); return }
    if (formCad.cpf_cnpj.trim() && !validarCpfCnpj(formCad.cpf_cnpj)) { toast.error('CPF / CNPJ inválido'); return }
    if (temDuplicataAlta && !confirmarNaoDuplicado) {
      toast.error('Confirme que não é um cadastro duplicado antes de continuar')
      return
    }

    setSalvandoCad(true)
    try {
      const res = await fetch('/api/clinica/pacientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formCad),
      })
      const data = await res.json()

      if (res.status === 409 && data.paciente_existente) {
        const p = data.paciente_existente
        selecionarPaciente({ id: p.id, nome: p.nome, cpf_cnpj: p.cpf_cnpj, celular: p.celular })
        toast.info(`Paciente já cadastrado: ${p.nome}`)
        return
      }
      if (!res.ok) {
        toast.error(data.erro ?? 'Erro ao cadastrar paciente')
        return
      }
      selecionarPaciente({ id: data.id, nome: data.nome, cpf_cnpj: data.cpf_cnpj, celular: data.celular })
      toast.success('Paciente cadastrado!')
    } finally {
      setSalvandoCad(false)
    }
  }

  // Tipos de atendimento que o profissional selecionado realmente realiza.
  const tiposDisponiveis = useMemo(() => {
    if (!form.profissional_id || !carregado) return []
    const prof = profissionais.find(p => p.id === form.profissional_id)
    const permitidos = new Set(prof?.tipo_ids ?? [])
    return tipos.filter(t => permitidos.has(t.id))
  }, [form.profissional_id, tipos, profissionais, carregado])

  async function handleConfirmar() {
    if (!pacienteSel)          { toast.error('Selecione o paciente'); return }
    if (!form.profissional_id) { toast.error('Selecione o profissional'); return }
    if (!form.tipo_id)         { toast.error('Selecione o tipo de atendimento'); return }
    if (!form.categoria_id)    { toast.error('Selecione a categoria'); return }
    if (!form.data)            { toast.error('Informe a data'); return }

    const tipo = tipos.find(t => t.id === form.tipo_id)
    const duracao = tipo?.duracao_min || 30
    const horaIni = form.hora || format(new Date(), 'HH:mm')
    const [h, m] = horaIni.split(':').map(Number)
    const totalFim = h * 60 + m + duracao
    const horaFim = `${String(Math.floor(totalFim / 60) % 24).padStart(2, '0')}:${String(totalFim % 60).padStart(2, '0')}`

    const ini = new Date(`${form.data}T${horaIni}:00`)
    const fim = new Date(`${form.data}T${horaFim}:00`)

    setSaving(true)
    try {
      const res = await fetch('/api/clinica/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paciente_id:      pacienteSel.id,
          profissional_id:  form.profissional_id,
          tipo_id:          form.tipo_id,
          categoria_id:     form.categoria_id,
          data_hora_inicio: ini.toISOString(),
          data_hora_fim:    fim.toISOString(),
          status:           'ATENDIDO',
          avulso:           true,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(typeof err.erro === 'string' ? err.erro : 'Erro ao lançar atendimento')
        return
      }

      const data: { agendamento: AgendamentoListItem } = await res.json()
      onCriado(data.agendamento)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 8,
        width: '100%', maxWidth: 560,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        border: '1px solid var(--borda-media)',
      }}>
        <div style={{ padding: '10px 16px', background: 'var(--cor-primaria)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Lançamento Avulso — Consulta/Exame</div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 4, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>

          <div style={{ fontSize: 11.5, color: 'var(--texto-terciario)', background: 'var(--bg-page)', padding: '8px 10px', borderRadius: 6 }}>
            Gera só o vínculo com o paciente pra receber o pagamento — não aparece na agenda.
          </div>

          {/* Paciente */}
          <fieldset style={{ border: '1px solid var(--borda-suave)', borderRadius: 4, padding: '8px 10px 10px', margin: 0, backgroundColor: 'var(--bg-card)' }}>
            <legend style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <User size={10} /> Paciente<span style={{ color: 'var(--cor-erro)', marginLeft: 2 }}>*</span>
            </legend>

            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)', pointerEvents: 'none' }} />
              <input
                style={{ width: '100%', padding: '5px 28px 5px 26px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, boxSizing: 'border-box' }}
                placeholder="Buscar paciente por nome ou CPF..."
                value={buscaPaciente}
                onChange={e => { setBuscaPaciente(e.target.value); if (!e.target.value) limparPaciente() }}
                autoComplete="off"
              />
              {pacienteSel && (
                <button onClick={limparPaciente} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', padding: 2 }}>
                  <X size={12} />
                </button>
              )}
            </div>

            {pacientes.length > 0 && !pacienteSel && (
              <div style={{ border: '1px solid var(--borda-media)', borderRadius: 4, marginTop: 4, background: 'var(--bg-card)', maxHeight: 150, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {pacientes.map(p => (
                  <button key={p.id} onClick={() => selecionarPaciente(p)} style={{ width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--borda-suave)', background: 'transparent', color: 'var(--texto-principal)' }}>
                    <span style={{ fontWeight: 500 }}>{p.nome}</span>
                    <span style={{ fontSize: 11, color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)' }}>{p.cpf_cnpj ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
            {loadingPac && <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 4 }}>Buscando...</div>}

            {!loadingPac && !pacienteSel && !showCadRapido && buscaPaciente.length >= 2 && pacientes.length === 0 && (
              <button
                onClick={abrirCadRapido}
                style={{ marginTop: 6, width: '100%', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--cor-primaria-light, #E1F5EE)', border: '1px dashed var(--cor-primaria)', borderRadius: 6, cursor: 'pointer', color: 'var(--cor-primaria-text, #085041)', fontSize: 12, fontWeight: 500 }}
              >
                <UserPlus size={14} />
                <span>Cadastrar <strong>&ldquo;{buscaPaciente.trim()}&rdquo;</strong> como novo paciente</span>
              </button>
            )}

            {showCadRapido && !pacienteSel && (
              <div style={{ marginTop: 8, border: '1px solid var(--cor-primaria)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ background: 'var(--cor-primaria)', padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#fff' }}>
                    <UserPlus size={13} /> Cadastro rápido de paciente
                  </div>
                  <button onClick={() => setShowCadRapido(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 3, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
                    <X size={11} />
                  </button>
                </div>
                <div style={{ padding: '12px 12px 10px', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                      Nome <span style={{ color: 'var(--cor-erro)' }}>*</span>
                    </div>
                    <input
                      autoFocus
                      value={formCad.nome}
                      onChange={e => setFormCad(f => ({ ...f, nome: e.target.value }))}
                      placeholder="Nome completo do paciente"
                      autoComplete="off"
                      style={{ width: '100%', padding: '6px 10px', fontSize: 13, background: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 5, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                        Data de Nascimento
                        {exigeDataNascimento ? <span style={{ color: 'var(--cor-erro)', marginLeft: 2 }}>*</span> : <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> (opcional)</span>}
                      </div>
                      <input
                        type="date"
                        value={formCad.data_nascimento}
                        onChange={e => setFormCad(f => ({ ...f, data_nascimento: e.target.value }))}
                        style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 5, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                        CPF / CNPJ
                        {exigeCpfCnpj ? <span style={{ color: 'var(--cor-erro)', marginLeft: 2 }}>*</span> : <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> (opcional)</span>}
                      </div>
                      <input
                        value={formCad.cpf_cnpj}
                        onChange={e => { const val = e.target.value; setFormCad(f => ({ ...f, cpf_cnpj: val })); verificarCpfExistente(val) }}
                        placeholder="000.000.000-00"
                        style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg-input)', color: 'var(--texto-principal)', border: `1px solid ${cpfJaCadastrado ? 'var(--cor-aviso, #F59E0B)' : 'var(--borda-media)'}`, borderRadius: 5, boxSizing: 'border-box', fontFamily: 'var(--fonte-mono)' }}
                      />
                      {verificandoCpf && <div style={{ fontSize: 10, color: 'var(--texto-terciario)', marginTop: 2 }}>Verificando CPF...</div>}
                    </div>
                  </div>

                  {cpfJaCadastrado && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--cor-aviso-light, #FEF3C7)', border: '1px solid var(--cor-aviso, #F59E0B)', borderRadius: 6 }}>
                      <User size={14} style={{ color: 'var(--cor-aviso, #F59E0B)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E' }}>CPF já cadastrado</div>
                        <div style={{ fontSize: 12, color: '#78350F', fontWeight: 500 }}>{cpfJaCadastrado.nome}</div>
                      </div>
                    </div>
                  )}

                  {!cpfJaCadastrado && verificandoDuplicidade && (
                    <div style={{ fontSize: 10, color: 'var(--texto-terciario)' }}>Verificando cadastros parecidos...</div>
                  )}
                  {!cpfJaCadastrado && duplicados.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', background: temDuplicataAlta ? 'var(--cor-erro-light, #FEE2E2)' : 'var(--cor-aviso-light, #FEF3C7)', border: `1px solid ${temDuplicataAlta ? 'var(--cor-erro, #EF4444)' : 'var(--cor-aviso, #F59E0B)'}`, borderRadius: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <AlertTriangle size={14} style={{ color: temDuplicataAlta ? 'var(--cor-erro, #EF4444)' : 'var(--cor-aviso, #F59E0B)', flexShrink: 0, marginTop: 1 }} />
                        <div style={{ fontSize: 11, fontWeight: 700, color: temDuplicataAlta ? '#7F1D1D' : '#92400E' }}>
                          {temDuplicataAlta ? 'Provável cadastro duplicado' : 'Cadastro parecido encontrado — confira antes de continuar'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {duplicados.map(d => (
                          <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 8px', background: 'var(--bg-card)', borderRadius: 4 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-principal)' }}>{d.nome}</div>
                              <div style={{ fontSize: 10, color: 'var(--texto-terciario)' }}>{d.motivos.join(' · ')}{d.celular ? ` · ${d.celular}` : ''}</div>
                            </div>
                            <button
                              onClick={() => selecionarPaciente({ id: d.id, nome: d.nome, cpf_cnpj: d.cpf_cnpj, celular: d.celular })}
                              style={{ flexShrink: 0, padding: '4px 8px', fontSize: 11, fontWeight: 600, background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                            >
                              Usar este
                            </button>
                          </div>
                        ))}
                      </div>
                      {temDuplicataAlta && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7F1D1D', cursor: 'pointer' }}>
                          <input type="checkbox" checked={confirmarNaoDuplicado} onChange={e => setConfirmarNaoDuplicado(e.target.checked)} />
                          Confirmo que é uma pessoa diferente, não é cadastro duplicado
                        </label>
                      )}
                    </div>
                  )}

                  {!cpfJaCadastrado && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                        Celular
                        {exigeCelular ? <span style={{ color: 'var(--cor-erro)', marginLeft: 2 }}>*</span> : <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> (opcional)</span>}
                      </div>
                      <input
                        value={formCad.celular}
                        onChange={e => setFormCad(f => ({ ...f, celular: e.target.value }))}
                        placeholder="(00) 00000-0000"
                        autoComplete="off"
                        style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 5, boxSizing: 'border-box' }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, paddingTop: 2 }}>
                    <button onClick={() => setShowCadRapido(false)} style={{ padding: '6px 14px', fontSize: 12, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 5, color: 'var(--texto-secundario)', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                    <button
                      onClick={handleCadastroRapido}
                      disabled={
                        salvandoCad || verificandoCpf || verificandoDuplicidade ||
                        (!cpfJaCadastrado && (
                          !formCad.nome.trim() ||
                          (exigeDataNascimento && !formCad.data_nascimento) ||
                          (exigeCelular && !formCad.celular.trim()) ||
                          (exigeCpfCnpj && !formCad.cpf_cnpj.trim())
                        )) ||
                        (temDuplicataAlta && !confirmarNaoDuplicado)
                      }
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 18px', fontSize: 12, fontWeight: 600, background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', opacity: salvandoCad || verificandoCpf || verificandoDuplicidade ? 0.7 : 1 }}
                    >
                      <UserPlus size={13} />
                      {salvandoCad ? 'Cadastrando...' : cpfJaCadastrado ? 'Usar este cadastro' : 'Cadastrar e usar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </fieldset>

          {/* Atendimento */}
          <fieldset style={{ border: '1px solid var(--borda-suave)', borderRadius: 4, padding: '8px 10px 10px', margin: 0, backgroundColor: 'var(--bg-card)' }}>
            <legend style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Stethoscope size={10} /> Atendimento
            </legend>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Field>
                <Label required>Profissional</Label>
                <select
                  value={form.profissional_id}
                  onChange={e => {
                    const id = Number(e.target.value)
                    const prof = profissionais.find(p => p.id === id)
                    const permitidos = prof?.tipo_ids ?? []
                    setForm(f => ({ ...f, profissional_id: id, tipo_id: f.tipo_id && permitidos.includes(f.tipo_id) ? f.tipo_id : null }))
                  }}
                  style={{ padding: '5px 6px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3 }}
                >
                  <option value={0}>Selecione...</option>
                  {profissionais.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}{p.eh_clinica ? ' (Clínica)' : ''}</option>
                  ))}
                </select>
              </Field>

              <Field>
                <Label required>Tipo de Atendimento</Label>
                <select
                  value={form.tipo_id ?? 0}
                  onChange={e => setForm(f => ({ ...f, tipo_id: Number(e.target.value) || null }))}
                  disabled={!form.profissional_id}
                  style={{ padding: '5px 6px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, opacity: form.profissional_id ? 1 : 0.6 }}
                >
                  <option value={0}>Selecione...</option>
                  {tiposDisponiveis.map(t => (
                    <option key={t.id} value={t.id}>{t.descricao}</option>
                  ))}
                </select>
              </Field>

              <Field>
                <Label required>Categoria</Label>
                <select
                  value={form.categoria_id ?? 0}
                  onChange={e => setForm(f => ({ ...f, categoria_id: Number(e.target.value) || null }))}
                  style={{ padding: '5px 6px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3 }}
                >
                  <option value={0}>Selecione...</option>
                  {categorias.map(c => (
                    <option key={c.id} value={c.id}>{c.descricao}</option>
                  ))}
                </select>
              </Field>

              <Field>
                <Label required>Data</Label>
                <input
                  type="date"
                  value={form.data}
                  onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                  style={{ padding: '5px 6px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3 }}
                />
              </Field>

              <Field>
                <Label>Horário (opcional)</Label>
                <input
                  type="time"
                  value={form.hora}
                  onChange={e => setForm(f => ({ ...f, hora: e.target.value }))}
                  placeholder="agora"
                  style={{ padding: '5px 6px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3 }}
                />
              </Field>
            </div>
          </fieldset>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '14px 16px', borderTop: '0.5px solid var(--borda-suave)' }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{ flex: 1, padding: '10px 16px', border: '0.5px solid var(--borda-media)', background: 'var(--bg-page)', color: 'var(--texto-principal)', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.5 : 1 }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={saving}
            style={{ flex: 1, padding: '10px 16px', border: 'none', background: 'var(--cor-primaria)', color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Processando...' : 'Continuar para Recebimento'}
          </button>
        </div>
      </div>
    </div>
  )
}
