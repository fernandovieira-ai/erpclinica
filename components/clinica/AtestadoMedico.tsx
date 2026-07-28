'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X, Printer, Save, Loader2, User, ClipboardCheck, CalendarDays } from 'lucide-react'
import { montarEnderecoEmpresa, type DadosPrescritor } from './receitaSistemaPrint'
import { gerarHtmlAtestado, dataPorExtenso } from './atestadoPrint'

export type TipoAtestado = 'AFASTAMENTO' | 'COMPARECIMENTO' | 'PERSONALIZADO'

export interface Props {
  agendamentoId:    number
  pacienteNome:     string
  profissionalNome: string
  onFechar:         () => void
  onEmitido?:       () => void
}

const COR = '#0F766E'

const TIPO_LABEL: Record<TipoAtestado, string> = {
  AFASTAMENTO:    'Afastamento',
  COMPARECIMENTO: 'Comparecimento',
  PERSONALIZADO:  'Personalizado',
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatarDataBR(iso: string): string {
  if (!iso) return ''
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function textoDias(dias: string): string {
  if (!dias) return '____ dia(s)'
  return Number(dias) === 1 ? '1 (um) dia' : `${dias} dias`
}

// Texto sugerido a partir dos campos estruturados — o profissional pode editar livremente
// depois; assim que editar manualmente, para de regenerar automaticamente (ver textoManual).
function gerarTextoPadrao(tipo: TipoAtestado, dias: string, dataInicio: string, pacienteNome: string): string {
  const dataFmt = formatarDataBR(dataInicio)
  if (tipo === 'AFASTAMENTO') {
    return `Atesto, para os devidos fins, que o(a) paciente ${pacienteNome} esteve sob meus cuidados médicos nesta data, necessitando de afastamento de suas atividades laborais/escolares por ${textoDias(dias)}, a partir de ${dataFmt}.`
  }
  if (tipo === 'COMPARECIMENTO') {
    return `Atesto, para os devidos fins, que o(a) paciente ${pacienteNome} compareceu a esta clínica para atendimento médico em ${dataFmt}.`
  }
  return ''
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '6px 9px', fontSize: 12.5,
  border: '1px solid var(--borda-media)', borderRadius: 5,
  backgroundColor: 'var(--bg-card)', color: 'var(--texto-principal)',
  outline: 'none', width: '100%',
}

function Linha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: 'var(--texto-terciario)',
      }}>
        {label}
      </span>
      {children}
    </label>
  )
}

export default function AtestadoMedico({
  agendamentoId, pacienteNome, profissionalNome, onFechar, onEmitido,
}: Props) {
  const [tipo,        setTipo]        = useState<TipoAtestado>('AFASTAMENTO')
  const [dias,        setDias]        = useState('')
  const [dataInicio,  setDataInicio]  = useState(hojeISO())
  const [cid,         setCid]         = useState('')
  const [texto,       setTexto]       = useState(() => gerarTextoPadrao('AFASTAMENTO', '', hojeISO(), pacienteNome))
  const [textoManual, setTextoManual] = useState(false)
  const [salvando,    setSalvando]    = useState(false)
  const [dados,       setDados]       = useState<DadosPrescritor | null>(null)
  const [carregando,  setCarregando]  = useState(true)

  // Reaproveita o mesmo endpoint da receita sistema — os dados de prescritor/clínica
  // pro cabeçalho são idênticos, não faz sentido duplicar a query.
  useEffect(() => {
    setCarregando(true)
    fetch(`/api/clinica/receitas-sistema?dados=true&agendamento_id=${agendamentoId}`)
      .then(r => r.json())
      .then(d => { if (d.dados) setDados(d.dados) })
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [agendamentoId])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onFechar])

  // Regenera o texto sugerido enquanto o profissional não tiver editado manualmente.
  useEffect(() => {
    if (textoManual) return
    setTexto(gerarTextoPadrao(tipo, dias, dataInicio, pacienteNome))
  }, [tipo, dias, dataInicio, pacienteNome, textoManual])

  function mudarTipo(novoTipo: TipoAtestado) {
    setTipo(novoTipo)
    setTextoManual(false)
  }

  function restaurarTextoPadrao() {
    setTextoManual(false)
    setTexto(gerarTextoPadrao(tipo, dias, dataInicio, pacienteNome))
  }

  async function salvar() {
    if (!texto.trim()) { toast.error('O texto do atestado não pode ficar vazio'); return }
    if (!dataInicio) { toast.error('Informe a data'); return }

    setSalvando(true)
    try {
      const res = await fetch('/api/clinica/atestados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agendamento_id:   agendamentoId,
          tipo,
          dias_afastamento: tipo === 'AFASTAMENTO' ? (dias ? Number(dias) : null) : null,
          data_inicio:      dataInicio,
          cid:              cid || null,
          texto,
        }),
      })
      if (!res.ok) throw new Error('Falha')
      toast.success('Atestado salvo no histórico')
      onEmitido?.()
    } catch {
      toast.error('Erro ao salvar atestado')
    } finally {
      setSalvando(false)
    }
  }

  function imprimir() {
    if (!texto.trim()) { toast.error('O texto do atestado não pode ficar vazio'); return }
    const html = gerarHtmlAtestado(texto, cid || null, dataInicio, dados, pacienteNome, profissionalNome)
    const win = window.open('', '_blank', 'width=820,height=1050')
    if (win) { win.document.write(html); win.document.close() }
  }

  if (typeof window === 'undefined') return null

  const profNome    = dados?.profissional_nome ?? profissionalNome
  const crm         = dados?.crm ? `CRM ${dados.crm_uf ?? ''} ${dados.crm}`.trim() : ''
  const pacNome     = dados?.paciente_nome ?? pacienteNome
  const clinicaNome = dados?.empresa_nome_fantasia || dados?.empresa_razao_social || ''
  const logo        = dados?.empresa_logo_base64 || ''
  const endereco    = montarEnderecoEmpresa(dados)
  const telefone    = dados?.empresa_telefone
  const cidade      = dados?.empresa_cidade
  const dataLocal   = [cidade, dataPorExtenso(dataInicio)].filter(Boolean).join(', ')

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
    >
      <div style={{
        width: '100%', maxWidth: 980, height: 'min(92vh, 780px)',
        backgroundColor: 'var(--bg-card)', borderRadius: 14,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
        overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 20px',
          background: `linear-gradient(135deg, ${COR} 0%, #115E59 100%)`,
          color: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClipboardCheck size={18} />
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.01em' }}>
              Atestado Médico
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {carregando
              ? <Loader2 size={14} style={{ opacity: 0.7 }} />
              : dados && (
                <div style={{ fontSize: 11.5, opacity: 0.9, display: 'flex', gap: 5, alignItems: 'center' }}>
                  <User size={13} />
                  {profNome}{crm ? ` · ${crm}` : ''}
                </div>
              )
            }
            <button
              onClick={onFechar}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', opacity: 0.8, padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* ── Coluna esquerda: formulário ── */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '18px 22px', borderRight: '1px solid var(--borda-suave)' }}>

            {/* Paciente */}
            <div style={{
              marginBottom: 16, padding: '8px 12px',
              backgroundColor: 'var(--bg-input)', borderRadius: 6,
              border: '1px solid var(--borda-suave)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <User size={14} style={{ color: COR, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--texto-terciario)', letterSpacing: '0.05em' }}>Paciente</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--texto-principal)' }}>{pacNome}</div>
              </div>
            </div>

            {/* Tipo de atestado */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--texto-terciario)', marginBottom: 6 }}>
                Tipo de atestado
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(Object.keys(TIPO_LABEL) as TipoAtestado[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => mudarTipo(t)}
                    style={{
                      flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 700,
                      border: `1.5px solid ${tipo === t ? COR : 'var(--borda-media)'}`,
                      borderRadius: 6, cursor: 'pointer',
                      backgroundColor: tipo === t ? `${COR}15` : 'transparent',
                      color: tipo === t ? COR : 'var(--texto-secundario)',
                    }}
                  >
                    {TIPO_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Campos estruturados */}
            <div style={{ display: 'grid', gridTemplateColumns: tipo === 'AFASTAMENTO' ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 14 }}>
              {tipo === 'AFASTAMENTO' && (
                <Linha label="Dias de afastamento">
                  <input
                    type="number" min={1} value={dias}
                    onChange={e => setDias(e.target.value)}
                    placeholder="Ex: 3"
                    style={INPUT_STYLE}
                  />
                </Linha>
              )}
              <Linha label={tipo === 'AFASTAMENTO' ? 'A partir de' : 'Data'}>
                <div style={{ position: 'relative' }}>
                  <CalendarDays size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)', pointerEvents: 'none' }} />
                  <input
                    type="date" value={dataInicio}
                    onChange={e => setDataInicio(e.target.value)}
                    style={{ ...INPUT_STYLE, paddingLeft: 28 }}
                  />
                </div>
              </Linha>
            </div>

            <div style={{ marginBottom: 14 }}>
              <Linha label="CID (opcional)">
                <input
                  type="text" value={cid}
                  onChange={e => setCid(e.target.value.toUpperCase())}
                  placeholder="Ex: J06.9"
                  maxLength={10}
                  style={{ ...INPUT_STYLE, maxWidth: 160 }}
                />
              </Linha>
              <div style={{ fontSize: 10.5, color: 'var(--texto-terciario)', marginTop: 4 }}>
                Só deve constar com o consentimento do paciente (Resolução CFM).
              </div>
            </div>

            {/* Texto do atestado */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--texto-terciario)' }}>
                  Texto do atestado
                </span>
                {textoManual && (
                  <button
                    type="button"
                    onClick={restaurarTextoPadrao}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: COR, fontSize: 11, fontWeight: 600, padding: 0 }}
                  >
                    Restaurar texto padrão
                  </button>
                )}
              </div>
              <textarea
                value={texto}
                onChange={e => { setTexto(e.target.value); setTextoManual(true) }}
                placeholder="Texto do atestado..."
                rows={7}
                style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>
          </div>

          {/* ── Coluna direita: prévia ── */}
          <div style={{
            width: 300, flexShrink: 0, overflowY: 'auto',
            padding: '18px 16px', backgroundColor: 'var(--bg-page)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--texto-terciario)', marginBottom: 12 }}>
              Prévia de impressão
            </div>

            <div style={{
              backgroundColor: '#fff', border: '1px solid #DDD',
              borderRadius: 8, padding: '14px 14px 18px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.07)', fontSize: 11,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                {logo
                  ? <img src={logo} alt={clinicaNome} style={{ maxHeight: 32, maxWidth: 160, objectFit: 'contain' }} />
                  : clinicaNome && <div style={{ fontWeight: 800, fontSize: 11, color: '#0B3A35' }}>{clinicaNome}</div>
                }
              </div>

              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', borderBottom: '2px solid #12857A', color: '#0B3A35', padding: '3px 8px 8px', marginBottom: 11 }}>
                Atestado Médico
              </div>

              <div style={{ border: '1px solid #EEE', borderRadius: 4, padding: '5px 8px', marginBottom: 11, fontSize: 9.5 }}>
                <div><strong>Paciente:</strong> {pacNome}</div>
              </div>

              <div style={{ fontSize: 10, lineHeight: 1.7, textAlign: 'justify', color: '#1A1A18', minHeight: 60 }}>
                {texto || <span style={{ color: '#bbb' }}>O texto do atestado aparecerá aqui</span>}
              </div>

              {cid && (
                <div style={{ marginTop: 10, fontSize: 9, color: '#666' }}>
                  <strong>CID:</strong> {cid}
                </div>
              )}

              {dataLocal && (
                <div style={{ marginTop: 16, textAlign: 'center', fontSize: 9.5, color: '#333' }}>
                  {dataLocal}
                </div>
              )}

              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 150, borderTop: '1px solid #666', paddingTop: 4, textAlign: 'center', fontSize: 8.5, color: '#666', lineHeight: 1.5 }}>
                  <strong style={{ display: 'block', fontSize: 9, color: '#1A1A18' }}>{profNome}</strong>
                  {crm}
                </div>
              </div>

              {(clinicaNome || endereco || telefone) && (
                <div style={{ marginTop: 10, paddingTop: 7, borderTop: '1px solid #EEE', textAlign: 'center', fontSize: 8, color: '#999', lineHeight: 1.6 }}>
                  {clinicaNome && <strong style={{ color: '#888' }}>{clinicaNome}</strong>}
                  {endereco && <div>{endereco}</div>}
                  {telefone && <div>Tel.: {telefone}</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
          padding: '12px 20px', borderTop: '1px solid var(--borda-suave)',
          backgroundColor: 'var(--bg-card)', flexShrink: 0,
        }}>
          <button
            onClick={onFechar}
            style={{
              padding: '7px 16px', fontSize: 12.5, background: 'none',
              border: '1px solid var(--borda-media)', borderRadius: 6,
              cursor: 'pointer', color: 'var(--texto-secundario)',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={imprimir}
            disabled={!texto.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', fontSize: 12.5, fontWeight: 600,
              backgroundColor: 'transparent', color: COR,
              border: `1.5px solid ${COR}`, borderRadius: 6, cursor: 'pointer',
              opacity: texto.trim() ? 1 : 0.4,
            }}
          >
            <Printer size={14} /> Imprimir
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !texto.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 20px', fontSize: 12.5, fontWeight: 700,
              backgroundColor: COR, color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              opacity: (salvando || !texto.trim()) ? 0.55 : 1,
            }}
          >
            {salvando ? <Loader2 size={14} /> : <Save size={14} />}
            {salvando ? 'Salvando...' : 'Salvar Atestado'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
