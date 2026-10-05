'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { X, Printer, Save, Loader2, User, FlaskConical, Settings, Search, Check } from 'lucide-react'
import type { ExamePadrao } from '@/types/clinica.types'
import { montarEnderecoEmpresa, type DadosPrescritor } from './receitaSistemaPrint'
import { gerarHtmlSolicitacaoExame } from './solicitacaoExamePrint'
import GerenciarExamesPadrao from './GerenciarExamesPadrao'

export type CaraterExame = 'ROTINA' | 'URGENCIA'

export interface Props {
  agendamentoId:    number
  pacienteNome:     string
  profissionalNome: string
  onFechar:         () => void
  onEmitido?:       () => void
}

const COR = '#B45309'

const CARATER_LABEL: Record<CaraterExame, string> = {
  ROTINA:    'Rotina',
  URGENCIA:  'Urgência',
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '6px 9px', fontSize: 12.5,
  border: '1px solid var(--borda-media)', borderRadius: 5,
  backgroundColor: 'var(--bg-card)', color: 'var(--texto-principal)',
  outline: 'none', width: '100%',
}

// Destaca o trecho buscado dentro do nome do exame, pra ficar claro por que
// aquele chip bateu com o filtro (combina em qualquer posição, não só no início).
function destacarTrecho(texto: string, query: string): React.ReactNode {
  if (!query) return texto
  const idx = texto.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return texto
  return (
    <>
      {texto.slice(0, idx)}
      <strong style={{ color: COR }}>{texto.slice(idx, idx + query.length)}</strong>
      {texto.slice(idx + query.length)}
    </>
  )
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

export default function SolicitacaoExame({
  agendamentoId, pacienteNome, profissionalNome, onFechar, onEmitido,
}: Props) {
  const [caracter,          setCaracter]          = useState<CaraterExame>('ROTINA')
  const [indicacaoClinica,  setIndicacaoClinica]  = useState('')
  const [exames,            setExames]            = useState('')
  const [salvando,          setSalvando]          = useState(false)
  const [dados,             setDados]             = useState<DadosPrescritor | null>(null)
  const [carregando,        setCarregando]        = useState(true)
  const [catalogo,          setCatalogo]          = useState<ExamePadrao[]>([])
  const [gerenciando,       setGerenciando]       = useState(false)
  const [filtroChip,        setFiltroChip]        = useState('')

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

  function carregarCatalogo() {
    fetch('/api/clinica/exames-padrao')
      .then(r => r.json())
      .then(d => setCatalogo(d.dados ?? []))
      .catch(() => toast.error('Erro ao carregar o catálogo de exames padrão'))
  }

  useEffect(() => { carregarCatalogo() }, [])

  // Linhas já digitadas no campo de exames, pra marcar quais chips do catálogo
  // já estão incluídas no pedido (comparação sem diferenciar maiúsc./minúsc.).
  const linhasExames = useMemo(
    () => exames.split('\n').map(l => l.trim()).filter(Boolean),
    [exames],
  )

  // Filtro só pra achar o chip mais rápido numa lista grande — não insere nada
  // sozinho, é o clique no chip (ou a digitação direta na caixa) que adiciona.
  const catalogoFiltrado = useMemo(() => {
    const q = filtroChip.trim().toLowerCase()
    if (!q) return catalogo
    return catalogo.filter(item => item.nome.toLowerCase().includes(q))
  }, [catalogo, filtroChip])

  function toggleChip(nome: string) {
    const idx = linhasExames.findIndex(l => l.toLowerCase() === nome.toLowerCase())
    const novasLinhas = idx >= 0
      ? linhasExames.filter((_, i) => i !== idx)
      : [...linhasExames, nome]
    setExames(novasLinhas.join('\n'))
  }

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && !gerenciando) onFechar() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onFechar, gerenciando])

  async function salvar() {
    if (!exames.trim()) { toast.error('Informe pelo menos um exame'); return }

    setSalvando(true)
    try {
      const res = await fetch('/api/clinica/solicitacoes-exame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agendamento_id:    agendamentoId,
          caracter,
          indicacao_clinica: indicacaoClinica || null,
          exames,
        }),
      })
      if (!res.ok) throw new Error('Falha')
      toast.success('Solicitação de exame salva no histórico')
      onEmitido?.()
    } catch {
      toast.error('Erro ao salvar solicitação de exame')
    } finally {
      setSalvando(false)
    }
  }

  function imprimir() {
    if (!exames.trim()) { toast.error('Informe pelo menos um exame'); return }
    const html = gerarHtmlSolicitacaoExame(caracter, indicacaoClinica || null, exames, dados, pacienteNome, profissionalNome)
    const win = window.open('', '_blank', 'width=820,height=1050')
    if (!win) { toast.error('O navegador bloqueou a janela de impressão — permita pop-ups e tente de novo'); return }
    win.document.write(html)
    win.document.close()
  }

  if (typeof window === 'undefined') return null

  const profNome    = dados?.profissional_nome ?? profissionalNome
  const crm         = dados?.crm ? `CRM ${dados.crm_uf ?? ''} ${dados.crm}`.trim() : ''
  const pacNome     = dados?.paciente_nome ?? pacienteNome
  const clinicaNome = dados?.empresa_nome_fantasia || dados?.empresa_razao_social || ''
  const logo        = dados?.empresa_logo_base64 || ''
  const endereco    = montarEnderecoEmpresa(dados)
  const telefone    = dados?.empresa_telefone

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
          background: `linear-gradient(135deg, ${COR} 0%, #7C3A0A 100%)`,
          color: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FlaskConical size={18} />
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.01em' }}>
              Solicitação de Exame
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

            {/* Caráter */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--texto-terciario)', marginBottom: 6 }}>
                Caráter
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(Object.keys(CARATER_LABEL) as CaraterExame[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCaracter(c)}
                    style={{
                      flex: 1, padding: '8px 10px', fontSize: 12, fontWeight: 700,
                      border: `1.5px solid ${caracter === c ? COR : 'var(--borda-media)'}`,
                      borderRadius: 6, cursor: 'pointer',
                      backgroundColor: caracter === c ? `${COR}15` : 'transparent',
                      color: caracter === c ? COR : 'var(--texto-secundario)',
                    }}
                  >
                    {CARATER_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <Linha label="Indicação clínica (opcional)">
                <input
                  type="text" value={indicacaoClinica}
                  onChange={e => setIndicacaoClinica(e.target.value)}
                  placeholder="Ex: Investigação de dor torácica"
                  style={INPUT_STYLE}
                />
              </Linha>
            </div>

            {/* Exames padrão (catálogo/favoritos) */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--texto-terciario)' }}>
                  Exames padrão
                </span>
                <button
                  type="button"
                  onClick={() => setGerenciando(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: COR, fontSize: 11, fontWeight: 600, padding: 0 }}
                >
                  <Settings size={12} /> Gerenciar
                </button>
              </div>

              {catalogo.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
                  Nenhum exame cadastrado — use "Gerenciar" pra criar a lista.
                </div>
              ) : (
                <>
                  {catalogo.length > 8 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: 9, color: 'var(--texto-terciario)', pointerEvents: 'none' }} />
                      <input
                        type="text"
                        value={filtroChip}
                        onChange={e => setFiltroChip(e.target.value)}
                        placeholder="Pesquisar no catálogo..."
                        style={{ ...INPUT_STYLE, paddingLeft: 28, fontSize: 12 }}
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {catalogoFiltrado.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
                        Nenhum exame bate com "{filtroChip}".
                      </div>
                    ) : catalogoFiltrado.map(item => {
                      const selecionado = linhasExames.some(l => l.toLowerCase() === item.nome.toLowerCase())
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleChip(item.nome)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 9px', fontSize: 11, fontWeight: 600,
                            border: `1px solid ${selecionado ? COR : 'var(--borda-media)'}`,
                            borderRadius: 999, cursor: 'pointer',
                            backgroundColor: selecionado ? `${COR}18` : 'transparent',
                            color: selecionado ? COR : 'var(--texto-secundario)',
                          }}
                        >
                          {selecionado && <Check size={11} />}
                          {destacarTrecho(item.nome, filtroChip.trim())}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Exames solicitados — texto livre, editável, sincronizado com os chips acima */}
            <div style={{ marginBottom: 4 }}>
              <Linha label="Exames solicitados">
                <textarea
                  value={exames}
                  onChange={e => setExames(e.target.value)}
                  placeholder={'Ex: Hemograma completo\nEletrocardiograma\nEcocardiograma transtorácico'}
                  rows={12}
                  style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
                />
              </Linha>
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

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #B45309', paddingBottom: 8, marginBottom: 11 }}>
                <div style={{ fontWeight: 800, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#0B3A35' }}>
                  Solicitação de Exame
                </div>
                <div style={{
                  fontSize: 8.5, fontWeight: 800, letterSpacing: '.05em',
                  border: `1.5px solid ${caracter === 'URGENCIA' ? '#B02A37' : '#5F5E58'}`,
                  borderRadius: 4, padding: '2px 6px',
                  color: caracter === 'URGENCIA' ? '#B02A37' : '#5F5E58',
                }}>
                  {CARATER_LABEL[caracter].toUpperCase()}
                </div>
              </div>

              <div style={{ border: '1px solid #EEE', borderRadius: 4, padding: '5px 8px', marginBottom: 11, fontSize: 9.5 }}>
                <div><strong>Paciente:</strong> {pacNome}</div>
              </div>

              {indicacaoClinica && (
                <div style={{ marginBottom: 10, fontSize: 9.5, color: '#444' }}>
                  <strong>Indicação clínica:</strong> {indicacaoClinica}
                </div>
              )}

              <div style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#8A8A85', marginBottom: 4 }}>
                Exames solicitados
              </div>
              <div style={{ fontSize: 10, lineHeight: 1.7, color: '#1A1A18', minHeight: 60, whiteSpace: 'pre-wrap' }}>
                {exames || <span style={{ color: '#bbb' }}>Os exames solicitados aparecerão aqui</span>}
              </div>

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
            disabled={!exames.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', fontSize: 12.5, fontWeight: 600,
              backgroundColor: 'transparent', color: COR,
              border: `1.5px solid ${COR}`, borderRadius: 6, cursor: 'pointer',
              opacity: exames.trim() ? 1 : 0.4,
            }}
          >
            <Printer size={14} /> Imprimir
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !exames.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 20px', fontSize: 12.5, fontWeight: 700,
              backgroundColor: COR, color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              opacity: (salvando || !exames.trim()) ? 0.55 : 1,
            }}
          >
            {salvando ? <Loader2 size={14} /> : <Save size={14} />}
            {salvando ? 'Salvando...' : 'Salvar Solicitação'}
          </button>
        </div>
      </div>

      {gerenciando && (
        <GerenciarExamesPadrao
          onFechar={() => setGerenciando(false)}
          onAlterado={carregarCatalogo}
        />
      )}
    </div>
  )

  return createPortal(modal, document.body)
}
