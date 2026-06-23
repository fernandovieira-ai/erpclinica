'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { X, Search, User, Stethoscope, Phone, Smartphone, MapPin, Mail, UserPlus, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { AgendamentoListItem, AgendamentoTipo, CategoriaListItem, ProfissionalListItem } from '@/types/clinica.types'

interface Paciente {
  id:        number
  nome:      string
  cpf_cnpj:  string | null
  celular:   string | null
  telefone:  string | null
  cidade:    string | null
  uf:        string | null
  email:     string | null
}

interface Props {
  open:             boolean
  onClose:          () => void
  onSaved:          () => void
  agendamento?:     AgendamentoListItem | null
  dataHoraInicio?:  Date | null
  profissionalPre?: ProfissionalListItem | null
}

const STATUS_OPTIONS = [
  { value: 'AGENDADO',   label: 'Agendado',   color: '#3B82F6' },
  { value: 'CONFIRMADO', label: 'Confirmado', color: '#10B981' },
  { value: 'AGUARDANDO', label: 'Aguardando', color: '#F59E0B' },
  { value: 'ATENDIDO',   label: 'Atendido',   color: '#6366F1' },
  { value: 'FALTOU',     label: 'Faltou',     color: '#EF4444' },
  { value: 'CANCELADO',  label: 'Cancelado',  color: '#6B7280' },
]

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
      {children}
    </div>
  )
}

function Field({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', ...style }}>{children}</div>
}

export default function AgendamentoModal({ open, onClose, onSaved, agendamento, dataHoraInicio, profissionalPre }: Props) {
  const isEdit = !!agendamento

  const [profissionais, setProfissionais] = useState<ProfissionalListItem[]>([])
  const [tipos,         setTipos]         = useState<AgendamentoTipo[]>([])
  const [categorias,    setCategorias]    = useState<CategoriaListItem[]>([])
  const [pacientes,     setPacientes]     = useState<Paciente[]>([])
  const [pacienteSel,   setPacienteSel]   = useState<Paciente | null>(null)
  const [buscaPaciente, setBuscaPaciente] = useState('')
  const [loadingPac,    setLoadingPac]    = useState(false)
  const [saving,        setSaving]        = useState(false)

  const [showCadRapido,   setShowCadRapido]   = useState(false)
  const [salvandoCad,     setSalvandoCad]     = useState(false)
  const [formCad, setFormCad] = useState({ nome: '', data_nascimento: '', cpf_cnpj: '', celular: '' })

  const [form, setForm] = useState({
    paciente_id:     0,
    profissional_id: 0,
    tipo_id:         null as number | null,
    data:            '',          // YYYY-MM-DD
    hora_inicio:     '',          // HH:MM
    hora_fim:        '',          // HH:MM
    status:          'AGENDADO',
    motivo:          '',
    observacao:      '',
    categoria_id:    null as number | null,
  })

  // Carregar dados auxiliares
  useEffect(() => {
    if (!open) return
    Promise.all([
      fetch('/api/clinica/profissionais').then(r => r.json()),
      fetch('/api/clinica/tipos-agendamento').then(r => r.json()),
      fetch('/api/clinica/categorias?limit=200').then(r => r.json()),
    ]).then(([p, t, c]) => {
      setProfissionais(p.dados ?? [])
      setTipos(t.dados ?? [])
      setCategorias(c.dados ?? [])
    })
  }, [open])

  // Popular form ao editar ou ao clicar em slot
  useEffect(() => {
    if (!open) return

    if (agendamento) {
      const ini = parseISO(agendamento.data_hora_inicio)
      const fim = parseISO(agendamento.data_hora_fim)
      setForm({
        paciente_id:     agendamento.paciente_id,
        profissional_id: agendamento.profissional_id,
        tipo_id:         agendamento.tipo_id,
        data:            format(ini, 'yyyy-MM-dd'),
        hora_inicio:     format(ini, 'HH:mm'),
        hora_fim:        format(fim, 'HH:mm'),
        status:          agendamento.status,
        motivo:          agendamento.motivo ?? '',
        observacao:      agendamento.observacao ?? '',
        categoria_id:    agendamento.categoria_id ?? null,
      })
      setBuscaPaciente(agendamento.paciente_nome)
      setPacienteSel({ id: agendamento.paciente_id, nome: agendamento.paciente_nome, cpf_cnpj: null, celular: agendamento.paciente_celular ?? null, telefone: null, cidade: null, uf: null, email: null })
    } else {
      const ini = dataHoraInicio ?? new Date()
      const fim = new Date(ini.getTime() + 30 * 60000)
      setForm({
        paciente_id:     0,
        profissional_id: profissionalPre?.id ?? 0,
        tipo_id:         null,
        data:            format(ini, 'yyyy-MM-dd'),
        hora_inicio:     format(ini, 'HH:mm'),
        hora_fim:        format(fim, 'HH:mm'),
        status:          'AGENDADO',
        motivo:          '',
        observacao:      '',
        categoria_id:    null,
      })
      setBuscaPaciente('')
      setPacienteSel(null)
    }
    setShowCadRapido(false)
    setFormCad({ nome: '', data_nascimento: '', cpf_cnpj: '', celular: '' })
  }, [open, agendamento, dataHoraInicio, profissionalPre])

  // Busca de pacientes com debounce
  const buscarPacientes = useCallback(async (q: string) => {
    if (q.length < 2) { setPacientes([]); return }
    setLoadingPac(true)
    try {
      const res  = await fetch(`/api/clinica/pacientes?busca=${encodeURIComponent(q)}`)
      const data = await res.json()
      setPacientes(data.dados ?? [])
    } finally { setLoadingPac(false) }
  }, [])

  useEffect(() => {
    if (form.paciente_id) return   // já selecionado, não rebusca
    const t = setTimeout(() => buscarPacientes(buscaPaciente), 300)
    return () => clearTimeout(t)
  }, [buscaPaciente, buscarPacientes, form.paciente_id])

  function selecionarPaciente(p: Paciente) {
    setForm(f => ({ ...f, paciente_id: p.id }))
    setBuscaPaciente(p.nome)
    setPacienteSel(p)
    setPacientes([])
  }

  function limparPaciente() {
    setForm(f => ({ ...f, paciente_id: 0 }))
    setBuscaPaciente('')
    setPacienteSel(null)
    setPacientes([])
    setShowCadRapido(false)
  }

  function abrirCadRapido() {
    setFormCad({ nome: buscaPaciente.trim(), data_nascimento: '', cpf_cnpj: '', celular: '' })
    setShowCadRapido(true)
    setPacientes([])
  }

  async function handleCadastroRapido() {
    if (!formCad.nome.trim()) { toast.error('Informe o nome do paciente'); return }
    setSalvandoCad(true)
    try {
      const res = await fetch('/api/clinica/pacientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formCad),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.erro ?? 'Erro ao cadastrar paciente')
        return
      }
      const novo = await res.json()
      selecionarPaciente({ id: novo.id, nome: novo.nome, cpf_cnpj: novo.cpf_cnpj, celular: novo.celular, telefone: null, cidade: null, uf: null, email: null })
      setShowCadRapido(false)
      toast.success('Paciente cadastrado!')
    } finally {
      setSalvandoCad(false)
    }
  }

  // Quando muda o tipo, ajusta a duração
  function handleTipo(tipoId: number | null) {
    const tipo = tipos.find(t => t.id === tipoId)
    if (tipo && form.hora_inicio) {
      const [hh, mm] = form.hora_inicio.split(':').map(Number)
      const totalMin = hh * 60 + mm + tipo.duracao_min
      const novoHH   = String(Math.floor(totalMin / 60) % 24).padStart(2, '0')
      const novoMM   = String(totalMin % 60).padStart(2, '0')
      setForm(f => ({ ...f, tipo_id: tipoId, hora_fim: `${novoHH}:${novoMM}` }))
    } else {
      setForm(f => ({ ...f, tipo_id: tipoId }))
    }
  }

  async function handleSalvar() {
    if (!form.paciente_id)     { toast.error('Selecione o paciente'); return }
    if (!form.profissional_id) { toast.error('Selecione o profissional'); return }
    if (!form.data)            { toast.error('Informe a data'); return }
    if (!form.hora_inicio || !form.hora_fim) { toast.error('Informe os horários'); return }

    const ini = `${form.data}T${form.hora_inicio}:00`
    const fim = `${form.data}T${form.hora_fim}:00`

    if (fim <= ini) { toast.error('Hora fim deve ser após a hora início'); return }

    // Validação de data/hora no passado
    const dataHoraIni = new Date(ini)
    const agora       = new Date()

    if (!isEdit) {
      if (dataHoraIni < agora) {
        toast.error('Não é possível agendar em data e horário que já passou')
        return
      }
    } else {
      // Na edição, só bloqueia se o usuário alterou a data/hora início para o passado
      const iniOriginal    = parseISO(agendamento!.data_hora_inicio)
      const iniOriginalStr = format(iniOriginal, "yyyy-MM-dd'T'HH:mm")
      const iniNovoStr     = `${form.data}T${form.hora_inicio}`
      if (iniOriginalStr !== iniNovoStr && dataHoraIni < agora) {
        toast.error('Não é possível reagendar para uma data e horário que já passou')
        return
      }
    }

    // Validação de disponibilidade do profissional
    if (!isEdit) {
      try {
        const resDisp = await fetch(`/api/clinica/profissionais/${form.profissional_id}/disponibilidade?data=${form.data}&hora_inicio=${form.hora_inicio}&hora_fim=${form.hora_fim}`)
        const dataDisp = await resDisp.json()
        if (!dataDisp.disponivel) {
          toast.error(dataDisp.razao || 'Profissional não está disponível neste horário')
          return
        }
      } catch (e) {
        toast.error('Erro ao validar disponibilidade do profissional')
        return
      }
    }

    setSaving(true)
    try {
      const url    = isEdit ? `/api/clinica/agendamentos/${agendamento!.id}` : '/api/clinica/agendamentos'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paciente_id:      form.paciente_id,
          profissional_id:  form.profissional_id,
          tipo_id:          form.tipo_id,
          data_hora_inicio: new Date(ini).toISOString(),
          data_hora_fim:    new Date(fim).toISOString(),
          status:           form.status,
          motivo:           form.motivo || null,
          observacao:       form.observacao || null,
          categoria_id:     form.categoria_id,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.erro ?? 'Erro ao salvar')
        return
      }

      toast.success(isEdit ? 'Agendamento atualizado!' : 'Agendamento criado!')
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleExcluir() {
    if (!agendamento) return
    if (!confirm('Excluir este agendamento?')) return
    const res = await fetch(`/api/clinica/agendamentos/${agendamento.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Excluído!'); onSaved(); onClose() }
    else toast.error('Erro ao excluir')
  }

  if (!open) return null

  const dataLabel = form.data
    ? format(parseISO(form.data), "dd/MM/yyyy", { locale: ptBR })
    : ''

  const statusAtual = STATUS_OPTIONS.find(s => s.value === form.status)

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
        width: '100%', maxWidth: 620,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        border: '1px solid var(--borda-media)',
      }}>

        {/* ── Header ──────────────────────────────────────────── */}
        <div style={{
          padding: '10px 16px',
          background: 'var(--cor-primaria)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
            {isEdit
              ? `Editar agendamento${dataLabel ? ` — ${dataLabel}` : ''}`
              : `Novo agendamento${dataLabel ? ` para ${dataLabel}` : ''}`
            }
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 4, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>

          {/* ── Paciente ────────────────────────────────────────── */}
          <fieldset style={{ border: '1px solid var(--borda-suave)', borderRadius: 4, padding: '8px 10px 10px', margin: 0 }}>
            <legend style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <User size={10} /> Paciente
            </legend>

            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)', pointerEvents: 'none' }} />
              <input
                style={{
                  width: '100%', padding: '5px 28px 5px 26px', fontSize: 12,
                  backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                  border: '1px solid var(--borda-media)', borderRadius: 3,
                  boxSizing: 'border-box',
                }}
                placeholder="Buscar paciente por nome ou CPF..."
                value={buscaPaciente}
                onChange={e => { setBuscaPaciente(e.target.value); if (!e.target.value) limparPaciente() }}
              />
              {pacienteSel && (
                <button
                  onClick={limparPaciente}
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', padding: 2 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Dropdown de busca */}
            {pacientes.length > 0 && !form.paciente_id && (
              <div style={{ border: '1px solid var(--borda-media)', borderRadius: 4, marginTop: 4, background: 'var(--bg-card)', maxHeight: 150, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {pacientes.map(p => (
                  <button
                    key={p.id}
                    onClick={() => selecionarPaciente(p)}
                    style={{ width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '0.5px solid var(--borda-suave)', background: 'transparent', color: 'var(--texto-principal)' }}
                  >
                    <span style={{ fontWeight: 500 }}>{p.nome}</span>
                    <span style={{ fontSize: 11, color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)' }}>{p.cpf_cnpj ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
            {loadingPac && <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 4 }}>Buscando...</div>}

            {/* Botão cadastro rápido — aparece quando buscou e não achou */}
            {!loadingPac && !form.paciente_id && !showCadRapido && buscaPaciente.length >= 2 && pacientes.length === 0 && (
              <button
                onClick={abrirCadRapido}
                style={{
                  marginTop: 6, width: '100%', padding: '8px 12px',
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--cor-primaria-light, #E1F5EE)',
                  border: '1px dashed var(--cor-primaria)',
                  borderRadius: 6, cursor: 'pointer',
                  color: 'var(--cor-primaria-text, #085041)',
                  fontSize: 12, fontWeight: 500,
                  transition: 'background 0.15s',
                }}
              >
                <UserPlus size={14} />
                <span>Cadastrar <strong>&ldquo;{buscaPaciente.trim()}&rdquo;</strong> como novo paciente</span>
                <ChevronRight size={13} style={{ marginLeft: 'auto' }} />
              </button>
            )}

            {/* Formulário de cadastro rápido */}
            {showCadRapido && !form.paciente_id && (
              <div style={{
                marginTop: 8,
                border: '1px solid var(--cor-primaria)',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 2px 12px rgba(15,110,86,0.10)',
              }}>
                {/* Header mini */}
                <div style={{
                  background: 'var(--cor-primaria)',
                  padding: '7px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#fff' }}>
                    <UserPlus size={13} />
                    Cadastro rápido de paciente
                  </div>
                  <button
                    onClick={() => setShowCadRapido(false)}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 3, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
                  >
                    <X size={11} />
                  </button>
                </div>

                {/* Campos */}
                <div style={{ padding: '12px 12px 10px', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Nome */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                      Nome <span style={{ color: 'var(--cor-erro)' }}>*</span>
                    </div>
                    <input
                      autoFocus
                      value={formCad.nome}
                      onChange={e => setFormCad(f => ({ ...f, nome: e.target.value }))}
                      placeholder="Nome completo do paciente"
                      style={{
                        width: '100%', padding: '6px 10px', fontSize: 13,
                        background: 'var(--bg-input)', color: 'var(--texto-principal)',
                        border: '1px solid var(--borda-media)', borderRadius: 5,
                        boxSizing: 'border-box', fontFamily: 'var(--fonte-sans)',
                      }}
                    />
                  </div>

                  {/* Data nasc + CPF */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                        Data de Nascimento
                      </div>
                      <input
                        type="date"
                        value={formCad.data_nascimento}
                        onChange={e => setFormCad(f => ({ ...f, data_nascimento: e.target.value }))}
                        style={{
                          width: '100%', padding: '6px 10px', fontSize: 12,
                          background: 'var(--bg-input)', color: 'var(--texto-principal)',
                          border: '1px solid var(--borda-media)', borderRadius: 5,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                        CPF / CNPJ
                      </div>
                      <input
                        value={formCad.cpf_cnpj}
                        onChange={e => setFormCad(f => ({ ...f, cpf_cnpj: e.target.value }))}
                        placeholder="000.000.000-00"
                        style={{
                          width: '100%', padding: '6px 10px', fontSize: 12,
                          background: 'var(--bg-input)', color: 'var(--texto-principal)',
                          border: '1px solid var(--borda-media)', borderRadius: 5,
                          boxSizing: 'border-box', fontFamily: 'var(--fonte-mono)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Celular */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>
                      Celular
                    </div>
                    <input
                      value={formCad.celular}
                      onChange={e => setFormCad(f => ({ ...f, celular: e.target.value }))}
                      placeholder="(00) 00000-0000"
                      style={{
                        width: '100%', padding: '6px 10px', fontSize: 12,
                        background: 'var(--bg-input)', color: 'var(--texto-principal)',
                        border: '1px solid var(--borda-media)', borderRadius: 5,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Ação */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, paddingTop: 2 }}>
                    <button
                      onClick={() => setShowCadRapido(false)}
                      style={{ padding: '6px 14px', fontSize: 12, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 5, color: 'var(--texto-secundario)', cursor: 'pointer' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCadastroRapido}
                      disabled={salvandoCad || !formCad.nome.trim()}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 18px', fontSize: 12, fontWeight: 600,
                        background: salvandoCad || !formCad.nome.trim() ? 'var(--cor-primaria-hover)' : 'var(--cor-primaria)',
                        color: '#fff', border: 'none', borderRadius: 5,
                        cursor: salvandoCad || !formCad.nome.trim() ? 'not-allowed' : 'pointer',
                        opacity: salvandoCad || !formCad.nome.trim() ? 0.7 : 1,
                      }}
                    >
                      <UserPlus size={13} />
                      {salvandoCad ? 'Cadastrando...' : 'Cadastrar e usar'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Dados do paciente selecionado */}
            {pacienteSel && (pacienteSel.celular || pacienteSel.telefone || pacienteSel.cidade) && (
              <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap', padding: '6px 8px', background: 'var(--bg-hover)', borderRadius: 4 }}>
                {pacienteSel.celular && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--texto-secundario)' }}>
                    <Smartphone size={11} /> {pacienteSel.celular}
                  </span>
                )}
                {pacienteSel.telefone && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--texto-secundario)' }}>
                    <Phone size={11} /> {pacienteSel.telefone}
                  </span>
                )}
                {pacienteSel.cidade && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--texto-secundario)' }}>
                    <MapPin size={11} /> {pacienteSel.cidade}{pacienteSel.uf ? ` / ${pacienteSel.uf}` : ''}
                  </span>
                )}
                {pacienteSel.email && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--texto-secundario)' }}>
                    <Mail size={11} /> {pacienteSel.email}
                  </span>
                )}
              </div>
            )}
          </fieldset>

          {/* ── Profissional + Data + Horários ───────────────────── */}
          <fieldset style={{ border: '1px solid var(--borda-suave)', borderRadius: 4, padding: '8px 10px 10px', margin: 0 }}>
            <legend style={{ fontSize: 10, fontWeight: 700, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Stethoscope size={10} /> Agendamento
            </legend>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'end' }}>
              <Field>
                <Label>Profissional</Label>
                <select
                  value={form.profissional_id}
                  onChange={e => setForm(f => ({ ...f, profissional_id: Number(e.target.value) }))}
                  style={{ padding: '5px 6px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3 }}
                >
                  <option value={0}>Selecione...</option>
                  {profissionais.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </Field>

              <Field>
                <Label>Data</Label>
                <input
                  type="date"
                  value={form.data}
                  min={!isEdit ? format(new Date(), 'yyyy-MM-dd') : undefined}
                  onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
                  style={{ padding: '5px 6px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, width: 130 }}
                />
              </Field>

              <Field>
                <Label>Hora início</Label>
                <input
                  type="time"
                  value={form.hora_inicio}
                  onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))}
                  style={{
                    padding: '5px 6px', fontSize: 12,
                    backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                    border: `1px solid ${
                      !isEdit && form.data && form.hora_inicio &&
                      new Date(`${form.data}T${form.hora_inicio}:00`) < new Date()
                        ? 'var(--cor-erro)'
                        : 'var(--borda-media)'
                    }`,
                    borderRadius: 3, width: 90,
                  }}
                />
              </Field>

              <Field>
                <Label>Hora fim</Label>
                <input
                  type="time"
                  value={form.hora_fim}
                  onChange={e => setForm(f => ({ ...f, hora_fim: e.target.value }))}
                  style={{ padding: '5px 6px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, width: 90 }}
                />
              </Field>
            </div>
          </fieldset>

          {/* ── Tipo de Atendimento + Status ────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Field>
              <Label>Tipo de Atendimento</Label>
              <select
                value={form.tipo_id ?? ''}
                onChange={e => handleTipo(e.target.value ? Number(e.target.value) : null)}
                style={{ padding: '5px 6px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3 }}
              >
                <option value="">Sem tipo de atendimento</option>
                {tipos.map(t => (
                  <option key={t.id} value={t.id}>{t.descricao} ({t.duracao_min}min)</option>
                ))}
              </select>
            </Field>

            <Field>
              <Label>Status</Label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{
                  padding: '5px 6px', fontSize: 12,
                  backgroundColor: 'var(--bg-input)',
                  color: statusAtual?.color ?? 'var(--texto-principal)',
                  border: `1px solid ${statusAtual?.color ?? 'var(--borda-media)'}`,
                  borderRadius: 3, fontWeight: 600,
                }}
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* ── Categoria ────────────────────────────────────────── */}
          <Field>
            <Label>Categoria</Label>
            <select
              value={form.categoria_id ?? ''}
              onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value ? Number(e.target.value) : null }))}
              style={{ padding: '5px 6px', fontSize: 12, backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3 }}
            >
              <option value="">Sem categoria</option>
              {categorias.map(c => (
                <option key={c.id} value={c.id}>{c.descricao}</option>
              ))}
            </select>
          </Field>

          {/* ── Observações ─────────────────────────────────────── */}
          <Field>
            <Label>Observações</Label>
            <textarea
              rows={3}
              placeholder="Observações sobre o agendamento..."
              value={form.observacao}
              onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
              style={{
                padding: '5px 6px', fontSize: 12, resize: 'vertical',
                backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
                border: '1px solid var(--borda-media)', borderRadius: 3,
                fontFamily: 'var(--fonte-sans)',
              }}
            />
          </Field>
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--borda-suave)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--bg-page)',
        }}>
          <div>
            {isEdit && (
              <button
                onClick={handleExcluir}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', fontSize: 12, background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3, color: 'var(--cor-erro)', cursor: 'pointer' }}
              >
                Excluir
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ padding: '5px 14px', fontSize: 12, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, color: 'var(--texto-secundario)', cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 18px', fontSize: 12, fontWeight: 600,
                background: saving ? 'var(--cor-primaria-hover, #1a7a3a)' : 'var(--cor-primaria)',
                color: '#fff', border: 'none', borderRadius: 3,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.8 : 1,
              }}
            >
              {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Cadastrar horário'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
