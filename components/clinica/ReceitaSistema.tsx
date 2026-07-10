'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import {
  X, Plus, Trash2, Search, Printer, Save, Loader2,
  ChevronDown, Pill, FileText, User,
} from 'lucide-react'
import { gerarHtmlReceita, montarEnderecoEmpresa, type DadosPrescritor } from './receitaSistemaPrint'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MedBusca {
  codigo_produto:     string
  nome:               string
  principio_ativo:    string | null
  classe_terapeutica: string | null
}

interface ApresBusca {
  codigo_apresentacao: string
  descricao:           string
  forma_farmaceutica:  string | null
  quantidade:          string | null
}

interface ItemReceita {
  tempId:          string
  nome:            string
  codigoProduto?:  string
  principioAtivo?: string
  apresentacao:    string
  posologia:       string
  duracao:         string
  quantidade:      string
}

export interface Props {
  agendamentoId:    number
  pacienteNome:     string
  profissionalNome: string
  onFechar:         () => void
  onEmitida?:       () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COR = '#1E7FC3'

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
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

const INPUT_STYLE: React.CSSProperties = {
  padding: '6px 9px', fontSize: 12.5,
  border: '1px solid var(--borda-media)', borderRadius: 5,
  backgroundColor: 'var(--bg-card)', color: 'var(--texto-principal)',
  outline: 'none', width: '100%',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ReceitaSistema({
  agendamentoId, pacienteNome, profissionalNome, onFechar, onEmitida,
}: Props) {
  const [buscaTermo,    setBuscaTermo]    = useState('')
  const [resultados,    setResultados]    = useState<MedBusca[]>([])
  const [buscando,      setBuscando]      = useState(false)
  const [dropdown,      setDropdown]      = useState(false)
  const [itens,         setItens]         = useState<ItemReceita[]>([])
  const [expandido,     setExpandido]     = useState<string | null>(null)
  const [medPendente,   setMedPendente]   = useState<MedBusca | null>(null)
  const [apresList,     setApresList]     = useState<ApresBusca[]>([])
  const [apresCarregando, setApresCarregando] = useState(false)
  const [observacoes,   setObservacoes]   = useState('')
  const [salvando,      setSalvando]      = useState(false)
  const [dados,         setDados]         = useState<DadosPrescritor | null>(null)
  const [carregando,    setCarregando]    = useState(true)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Buscar dados do prescritor ao montar
  useEffect(() => {
    setCarregando(true)
    fetch(`/api/clinica/receitas-sistema?dados=true&agendamento_id=${agendamentoId}`)
      .then(r => r.json())
      .then(d => { if (d.dados) setDados(d.dados) })
      .catch(() => {})
      .finally(() => setCarregando(false))
  }, [agendamentoId])

  // Fechar com Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onFechar])

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdown(false)
        setMedPendente(null)
        setApresList([])
      }
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // Busca debounced
  const buscar = useCallback((termo: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (termo.length < 2) { setResultados([]); setDropdown(false); return }
    timerRef.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const r = await fetch(`/api/clinica/medicamentos?q=${encodeURIComponent(termo)}`)
        const d = await r.json()
        setResultados(d.dados ?? [])
        setDropdown(true)
      } finally {
        setBuscando(false)
      }
    }, 280)
  }, [])

  useEffect(() => { buscar(buscaTermo) }, [buscaTermo, buscar])

  // ── Ações ──────────────────────────────────────────────────────────────────

  function inserirItem(med: MedBusca, apresentacao: string) {
    const item: ItemReceita = {
      tempId: uid(), nome: med.nome,
      codigoProduto: med.codigo_produto,
      principioAtivo: med.principio_ativo ?? undefined,
      apresentacao, posologia: '', duracao: '', quantidade: '',
    }
    setItens(p => [...p, item])
    setExpandido(item.tempId)
    setMedPendente(null); setApresList([])
  }

  async function adicionarDaBase(med: MedBusca) {
    setBuscaTermo(''); setResultados([]); setDropdown(false)
    setApresCarregando(true)
    setMedPendente(med)
    try {
      const r = await fetch(`/api/clinica/medicamentos/apresentacoes?codigo_produto=${encodeURIComponent(med.codigo_produto)}`)
      const d = await r.json()
      const apres: ApresBusca[] = d.dados ?? []
      if (apres.length <= 1) {
        inserirItem(med, apres[0]?.descricao ?? '')
      } else {
        setApresList(apres)
      }
    } catch {
      inserirItem(med, '')
    } finally {
      setApresCarregando(false)
    }
  }

  function adicionarManual() {
    const nome = buscaTermo.trim()
    if (!nome) return
    const item: ItemReceita = { tempId: uid(), nome, apresentacao: '', posologia: '', duracao: '', quantidade: '' }
    setItens(p => [...p, item])
    setExpandido(item.tempId)
    setBuscaTermo(''); setResultados([]); setDropdown(false)
  }

  function remover(tempId: string) {
    setItens(p => p.filter(i => i.tempId !== tempId))
    if (expandido === tempId) setExpandido(null)
  }

  function atualizar(tempId: string, campo: keyof ItemReceita, valor: string) {
    setItens(p => p.map(i => i.tempId === tempId ? { ...i, [campo]: valor } : i))
  }

  async function salvar() {
    if (!itens.length) { toast.error('Adicione ao menos um medicamento'); return }
    const semPosologia = itens.find(i => !i.posologia.trim())
    if (semPosologia) { toast.error(`Informe a posologia: ${semPosologia.nome}`); return }

    setSalvando(true)
    try {
      const res = await fetch('/api/clinica/receitas-sistema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agendamento_id: agendamentoId,
          observacoes: observacoes || null,
          itens: itens.map((it, idx) => ({
            medicamento_nome:   it.nome,
            codigo_produto:     it.codigoProduto   ?? null,
            apresentacao:       it.apresentacao    || null,
            posologia:          it.posologia,
            duracao:            it.duracao         || null,
            quantidade:         it.quantidade      || null,
            ordem: idx,
          })),
        }),
      })
      if (!res.ok) throw new Error('Falha')
      toast.success('Receita salva no histórico')
      onEmitida?.()
    } catch {
      toast.error('Erro ao salvar receita')
    } finally {
      setSalvando(false)
    }
  }

  function imprimir() {
    if (!itens.length) { toast.error('Adicione ao menos um medicamento'); return }
    const html = gerarHtmlReceita(itens, observacoes, dados, pacienteNome, profissionalNome)
    const win = window.open('', '_blank', 'width=820,height=1050')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (typeof window === 'undefined') return null

  const profNome    = dados?.profissional_nome ?? profissionalNome
  const crm         = dados?.crm ? `CRM ${dados.crm_uf ?? ''} ${dados.crm}`.trim() : ''
  const pacNome     = dados?.paciente_nome ?? pacienteNome
  const data        = dados?.data_consulta ?? new Date().toLocaleDateString('pt-BR')
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
          background: `linear-gradient(135deg, ${COR} 0%, #1565A8 100%)`,
          color: '#fff', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={18} />
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '0.01em' }}>
              Receita Médica — Sistema
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

            {/* Busca */}
            <div style={{ marginBottom: 16, position: 'relative' }} ref={dropdownRef}>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Search size={14} style={{
                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--texto-terciario)', pointerEvents: 'none',
                  }} />
                  <input
                    type="text"
                    value={buscaTermo}
                    onChange={e => setBuscaTermo(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') adicionarManual() }}
                    placeholder="Buscar na base ANVISA ou digitar nome livre..."
                    style={{ ...INPUT_STYLE, paddingLeft: 34 }}
                    autoFocus
                  />
                  {buscando && (
                    <Loader2 size={13} style={{
                      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                      color: 'var(--texto-terciario)',
                    }} />
                  )}
                </div>
                <button
                  onClick={adicionarManual}
                  disabled={!buscaTermo.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '0 14px', fontSize: 12.5, fontWeight: 700,
                    backgroundColor: COR, color: '#fff',
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                    opacity: buscaTermo.trim() ? 1 : 0.4, whiteSpace: 'nowrap',
                  }}
                >
                  <Plus size={14} /> Adicionar
                </button>
              </div>

              {/* Dropdown resultados */}
              {dropdown && resultados.length > 0 && (
                <div style={{
                  position: 'absolute', left: 0, right: 48, top: 'calc(100% + 3px)',
                  backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda-media)',
                  borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
                  zIndex: 200, maxHeight: 220, overflowY: 'auto',
                }}>
                  {resultados.map(med => (
                    <button
                      key={med.codigo_produto}
                      type="button"
                      onClick={() => adicionarDaBase(med)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '9px 13px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        borderBottom: '1px solid var(--borda-suave)',
                        display: 'flex', flexDirection: 'column', gap: 2,
                      }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = '')}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)' }}>
                        {med.nome}
                      </span>
                      {med.principio_ativo && (
                        <span style={{ fontSize: 10.5, color: 'var(--texto-terciario)' }}>
                          {med.principio_ativo}
                          {med.classe_terapeutica ? ` · ${med.classe_terapeutica}` : ''}
                        </span>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={adicionarManual}
                    style={{
                      width: '100%', textAlign: 'left', padding: '9px 13px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 12, color: COR, fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = '')}
                  >
                    <Plus size={12} /> Adicionar &ldquo;{buscaTermo}&rdquo; como está
                  </button>
                </div>
              )}

              {/* Seleção de apresentação (quando o medicamento tem mais de uma) */}
              {medPendente && (
                <div style={{
                  position: 'absolute', left: 0, right: 48, top: 'calc(100% + 3px)',
                  backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda-media)',
                  borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
                  zIndex: 200, maxHeight: 260, overflowY: 'auto',
                }}>
                  <div style={{
                    padding: '8px 13px', fontSize: 11, fontWeight: 700,
                    color: 'var(--texto-terciario)', textTransform: 'uppercase',
                    letterSpacing: '0.04em', borderBottom: '1px solid var(--borda-suave)',
                  }}>
                    {apresCarregando ? 'Carregando apresentações...' : `Escolha a apresentação — ${medPendente.nome}`}
                  </div>
                  {apresCarregando ? (
                    <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
                      <Loader2 size={16} style={{ color: 'var(--texto-terciario)' }} />
                    </div>
                  ) : (
                    <>
                      {apresList.map(ap => (
                        <button
                          key={ap.codigo_apresentacao}
                          type="button"
                          onClick={() => inserirItem(medPendente, ap.descricao)}
                          style={{
                            width: '100%', textAlign: 'left', padding: '9px 13px',
                            background: 'none', border: 'none', cursor: 'pointer',
                            borderBottom: '1px solid var(--borda-suave)',
                            display: 'flex', flexDirection: 'column', gap: 2,
                          }}
                          onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                          onMouseOut={e => (e.currentTarget.style.backgroundColor = '')}
                        >
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--texto-principal)' }}>
                            {ap.descricao}
                          </span>
                          {ap.forma_farmaceutica && (
                            <span style={{ fontSize: 10.5, color: 'var(--texto-terciario)' }}>
                              {ap.forma_farmaceutica}
                            </span>
                          )}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => inserirItem(medPendente, '')}
                        style={{
                          width: '100%', textAlign: 'left', padding: '9px 13px',
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 12, color: COR, fontWeight: 700,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                        onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                        onMouseOut={e => (e.currentTarget.style.backgroundColor = '')}
                      >
                        <Plus size={12} /> Nenhuma / preencher manualmente
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Lista de itens */}
            {itens.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--texto-terciario)' }}>
                <Pill size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.25 }} />
                <div style={{ fontSize: 13 }}>Busque e adicione medicamentos acima</div>
                <div style={{ fontSize: 11.5, marginTop: 4, opacity: 0.7 }}>A base ANVISA é usada automaticamente se disponível</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {itens.map((it, idx) => {
                  const aberto = expandido === it.tempId
                  return (
                    <div
                      key={it.tempId}
                      style={{
                        border: `1px solid ${aberto ? COR : 'var(--borda-media)'}`,
                        borderRadius: 8, overflow: 'hidden',
                        transition: 'border-color .15s',
                      }}
                    >
                      {/* Item header */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandido(aberto ? null : it.tempId)}
                        onKeyDown={e => { if (e.key === 'Enter') setExpandido(aberto ? null : it.tempId) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '9px 12px',
                          backgroundColor: aberto ? `${COR}0D` : 'var(--bg-input)',
                          cursor: 'pointer', userSelect: 'none',
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 800, color: COR, minWidth: 18 }}>{idx + 1}.</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {it.nome}{it.apresentacao ? ` — ${it.apresentacao}` : ''}
                          </div>
                          {it.posologia && (
                            <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {it.posologia}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ChevronDown size={14} style={{ color: 'var(--texto-terciario)', transition: 'transform .15s', transform: aberto ? 'rotate(180deg)' : 'none' }} />
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); remover(it.tempId) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cor-erro)', display: 'flex', padding: '2px 3px', borderRadius: 3 }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Campos expandidos */}
                      {aberto && (
                        <div style={{ padding: '12px 14px', borderTop: `1px solid ${COR}22`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <Linha label="Posologia *" >
                            <input
                              type="text"
                              value={it.posologia}
                              onChange={e => atualizar(it.tempId, 'posologia', e.target.value)}
                              placeholder="Ex: 1 comprimido de 8 em 8 horas"
                              style={{ ...INPUT_STYLE, gridColumn: '1/-1' }}
                            />
                          </Linha>
                          <div style={{ gridColumn: '1/-1' }} />
                          <Linha label="Apresentação">
                            <input type="text" value={it.apresentacao} onChange={e => atualizar(it.tempId, 'apresentacao', e.target.value)} placeholder="Ex: 500mg comprimido" style={INPUT_STYLE} />
                          </Linha>
                          <Linha label="Quantidade">
                            <input type="text" value={it.quantidade} onChange={e => atualizar(it.tempId, 'quantidade', e.target.value)} placeholder="Ex: 1 caixa com 30 comp." style={INPUT_STYLE} />
                          </Linha>
                          <Linha label="Duração">
                            <input type="text" value={it.duracao} onChange={e => atualizar(it.tempId, 'duracao', e.target.value)} placeholder="Ex: 7 dias / uso contínuo" style={INPUT_STYLE} />
                          </Linha>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Observações */}
            <Linha label="Observações">
              <textarea
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Instruções adicionais, retorno, exames solicitados..."
                rows={3}
                style={{ ...INPUT_STYLE, resize: 'vertical', lineHeight: 1.5 }}
              />
            </Linha>
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
              {/* Cabeçalho — logo/clínica */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                {logo
                  ? <img src={logo} alt={clinicaNome} style={{ maxHeight: 32, maxWidth: 160, objectFit: 'contain' }} />
                  : clinicaNome && <div style={{ fontWeight: 800, fontSize: 11, color: '#0B3A35' }}>{clinicaNome}</div>
                }
              </div>

              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.1em', borderBottom: '2px solid #12857A', color: '#0B3A35', padding: '3px 8px 8px', marginBottom: 9 }}>
                Receita Médica
              </div>

              <div style={{ border: '1px solid #EEE', borderRadius: 4, padding: '5px 8px', marginBottom: 9, fontSize: 9.5 }}>
                <div><strong>Paciente:</strong> {pacNome}</div>
                <div><strong>Data:</strong> {data}</div>
              </div>

              {itens.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#bbb', padding: '10px 0', fontSize: 9.5 }}>
                  Medicamentos aparecerão aqui
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {itens.map((it, i) => (
                    <div key={it.tempId} style={{ borderLeft: '3px solid #12857A', paddingLeft: 6, paddingTop: 3, paddingBottom: 3, backgroundColor: '#F8F8F6' }}>
                      <div style={{ fontWeight: 700, fontSize: 10.5 }}>
                        {i + 1}. {it.nome}{it.apresentacao ? ` — ${it.apresentacao}` : ''}
                      </div>
                      {it.posologia && <div style={{ fontSize: 9.5, marginTop: 1 }}>{it.posologia}</div>}
                      {(it.duracao || it.quantidade) && (
                        <div style={{ fontSize: 8.5, color: '#888', marginTop: 1 }}>
                          {[it.duracao && it.duracao, it.quantidade && `Qtd: ${it.quantidade}`].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {observacoes && (
                <div style={{ marginTop: 8, padding: '5px 7px', backgroundColor: '#FFFDF0', border: '1px solid #E5D88A', borderRadius: 4, fontSize: 9.5 }}>
                  <div style={{ fontWeight: 700, fontSize: 8.5, textTransform: 'uppercase', color: '#888', marginBottom: 2 }}>Obs.</div>
                  {observacoes}
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
            disabled={!itens.length}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', fontSize: 12.5, fontWeight: 600,
              backgroundColor: 'transparent', color: COR,
              border: `1.5px solid ${COR}`, borderRadius: 6, cursor: 'pointer',
              opacity: itens.length ? 1 : 0.4,
            }}
          >
            <Printer size={14} /> Imprimir
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !itens.length}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 20px', fontSize: 12.5, fontWeight: 700,
              backgroundColor: COR, color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              opacity: (salvando || !itens.length) ? 0.55 : 1,
            }}
          >
            {salvando ? <Loader2 size={14} /> : <Save size={14} />}
            {salvando ? 'Salvando...' : 'Salvar Receita'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
