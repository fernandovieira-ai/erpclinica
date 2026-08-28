'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X, Printer, Save, Loader2, User, FileWarning } from 'lucide-react'
import { montarEnderecoEmpresa, type DadosPrescritor } from './receitaSistemaPrint'
import { gerarHtmlReceituarioEspecial, montarEnderecoPaciente } from './receituarioEspecialPrint'

export interface Props {
  agendamentoId:    number
  pacienteNome:     string
  profissionalNome: string
  onFechar:         () => void
  onEmitido?:       () => void
}

const COR = '#B02A37'

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

export default function ReceituarioEspecial({
  agendamentoId, pacienteNome, profissionalNome, onFechar, onEmitido,
}: Props) {
  const [prescricao, setPrescricao] = useState('')
  const [endereco,   setEndereco]   = useState('')
  const [enderecoTocado, setEnderecoTocado] = useState(false)
  const [salvando,   setSalvando]   = useState(false)
  const [dados,      setDados]      = useState<DadosPrescritor | null>(null)
  const [carregando, setCarregando] = useState(true)

  // Reaproveita o endpoint da receita sistema (dados de prescritor/clinica/paciente).
  useEffect(() => {
    setCarregando(true)
    fetch(`/api/clinica/receitas-sistema?dados=true&agendamento_id=${agendamentoId}`)
      .then(r => r.json())
      .then(d => { if (d.dados) setDados(d.dados) })
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [agendamentoId])

  // Preenche o endereco do paciente a partir do cadastro enquanto o usuario nao editar.
  useEffect(() => {
    if (enderecoTocado || !dados) return
    setEndereco(montarEnderecoPaciente(dados))
  }, [dados, enderecoTocado])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onFechar])

  async function salvar() {
    if (!prescricao.trim()) { toast.error('A prescrição não pode ficar vazia'); return }

    setSalvando(true)
    try {
      const res = await fetch('/api/clinica/receituarios-especiais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agendamento_id:    agendamentoId,
          prescricao,
          paciente_endereco: endereco || null,
        }),
      })
      if (!res.ok) throw new Error('Falha')
      toast.success('Receituário salvo no histórico')
      onEmitido?.()
    } catch {
      toast.error('Erro ao salvar receituário')
    } finally {
      setSalvando(false)
    }
  }

  function imprimir() {
    if (!prescricao.trim()) { toast.error('A prescrição não pode ficar vazia'); return }
    const html = gerarHtmlReceituarioEspecial(prescricao, endereco || null, dados, pacienteNome, profissionalNome)
    const win = window.open('', '_blank', 'width=820,height=1050')
    if (win) { win.document.write(html); win.document.close() }
  }

  if (typeof window === 'undefined') return null

  const profNome    = dados?.profissional_nome ?? profissionalNome
  const crm         = dados?.crm ? `CRM ${dados.crm_uf ?? ''} ${dados.crm}`.trim() : ''
  const pacNome     = dados?.paciente_nome ?? pacienteNome
  const clinicaNome = dados?.empresa_nome_fantasia || dados?.empresa_razao_social || ''
  const logo        = dados?.empresa_logo_base64 || ''
  const enderecoEmp = montarEnderecoEmpresa(dados)
  const telefoneEmp = dados?.empresa_telefone

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
          background: `linear-gradient(135deg, ${COR} 0%, #8B1E29 100%)`,
          color: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileWarning size={18} />
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.01em' }}>
              Receituário de Controle Especial
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

            <div style={{ marginBottom: 14 }}>
              <Linha label="Endereço do paciente">
                <input
                  type="text"
                  value={endereco}
                  onChange={e => { setEndereco(e.target.value); setEnderecoTocado(true) }}
                  placeholder="Rua, número, bairro, cidade/UF"
                  style={INPUT_STYLE}
                />
              </Linha>
              <div style={{ fontSize: 10.5, color: 'var(--texto-terciario)', marginTop: 4 }}>
                Vem do cadastro do paciente — edite se necessário.
              </div>
            </div>

            <div style={{ marginBottom: 4 }}>
              <Linha label="Prescrição">
                <textarea
                  value={prescricao}
                  onChange={e => setPrescricao(e.target.value)}
                  placeholder={'Medicamento, concentração e forma farmacêutica\nQuantidade (em algarismos e por extenso)\nPosologia'}
                  rows={12}
                  style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
                />
              </Linha>
              <div style={{ fontSize: 10.5, color: 'var(--texto-terciario)', marginTop: 4 }}>
                Documento em 2 vias (1ª Farmácia / 2ª Paciente). Os campos de Comprador e Fornecedor
                saem em branco para preenchimento na farmácia.
              </div>
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
              borderRadius: 8, padding: '12px 12px 16px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.07)', fontSize: 10, color: '#111',
            }}>
              {logo
                ? <img src={logo} alt={clinicaNome} style={{ display: 'block', margin: '0 auto 6px', maxHeight: 26, maxWidth: 150, objectFit: 'contain' }} />
                : clinicaNome && <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 9, color: '#111', marginBottom: 5 }}>{clinicaNome}</div>
              }

              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 10.5, border: '1.5px solid #111', borderRadius: 6, padding: '5px 6px', marginBottom: 8 }}>
                RECEITUÁRIO CONTROLE ESPECIAL
              </div>

              <div style={{ border: '1px solid #111', borderRadius: 5, padding: '5px 7px', marginBottom: 8, fontSize: 8.5, lineHeight: 1.5 }}>
                <div style={{ textAlign: 'center', fontStyle: 'italic', borderBottom: '1px solid #bbb', paddingBottom: 2, marginBottom: 4 }}>
                  Identificação do Emitente
                </div>
                <div><strong>{profNome}</strong></div>
                {crm && <div>{crm}</div>}
                {(enderecoEmp || telefoneEmp) && <div>{[enderecoEmp, telefoneEmp && `Tel.: ${telefoneEmp}`].filter(Boolean).join(' - ')}</div>}
                {clinicaNome && <div>{clinicaNome}</div>}
              </div>

              <div style={{ fontSize: 8.5, marginBottom: 2 }}><strong>Paciente:</strong> {pacNome}</div>
              <div style={{ fontSize: 8.5, marginBottom: 6 }}><strong>Endereço:</strong> {endereco || <span style={{ color: '#bbb' }}>—</span>}</div>

              <div style={{ fontSize: 8.5, fontWeight: 700, marginBottom: 2 }}>Prescrição:</div>
              <div style={{
                minHeight: 90, border: '1px solid #ddd', borderRadius: 4, padding: '4px 5px',
                fontSize: 9, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {prescricao || <span style={{ color: '#bbb' }}>A prescrição aparecerá aqui</span>}
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {['Identificação do Comprador', 'Identificação do Fornecedor'].map(t => (
                  <div key={t} style={{ flex: 1, border: '1px solid #111', borderRadius: 4, padding: '4px 5px', fontSize: 7.5, minHeight: 54 }}>
                    <div style={{ textAlign: 'center', fontStyle: 'italic', color: '#666' }}>{t}</div>
                    <div style={{ color: '#bbb', marginTop: 6 }}>(preenchido na farmácia)</div>
                  </div>
                ))}
              </div>
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
            disabled={!prescricao.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', fontSize: 12.5, fontWeight: 600,
              backgroundColor: 'transparent', color: COR,
              border: `1.5px solid ${COR}`, borderRadius: 6, cursor: 'pointer',
              opacity: prescricao.trim() ? 1 : 0.4,
            }}
          >
            <Printer size={14} /> Imprimir
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !prescricao.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 20px', fontSize: 12.5, fontWeight: 700,
              backgroundColor: COR, color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              opacity: (salvando || !prescricao.trim()) ? 0.55 : 1,
            }}
          >
            {salvando ? <Loader2 size={14} /> : <Save size={14} />}
            {salvando ? 'Salvando...' : 'Salvar Receituário'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
