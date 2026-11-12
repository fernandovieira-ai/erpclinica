'use client'

import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X, DollarSign, CheckCircle2, MessageCircle, User } from 'lucide-react'
import RecebimentoModal from '@/components/clinica/RecebimentoModal'
import HistoricoClinico, { type HistoricoClinicoHandle } from '@/components/clinica/HistoricoClinico'
import PessoaFormPage from '@/components/cadastro/PessoaFormPage'
import { toast } from 'sonner'
import type { AgendamentoListItem } from '@/types/clinica.types'
import type { Pessoa } from '@/types/cadastros.types'
import { useMensagensContext } from '@/components/mensagens/MensagensContext'

interface Props {
  open: boolean
  // Objeto completo (mesma fonte da tela de Consultar Paciente — GET /api/cadastro/pessoas/:id),
  // exceto no fluxo ocultarCadastro (Sala de Espera), que só precisa de id/nome/tipo_pessoa.
  paciente?: Partial<Pessoa> & { id: number; nome: string } | null
  agendamento?: AgendamentoListItem | null
  agendamentos?: AgendamentoListItem[]
  onClose: () => void
  onSaved?: () => void
  ocultarRecebimento?: boolean
  ocultarFinalizar?: boolean
  ocultarCadastro?: boolean
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

function ConfirmarFinalizarModal({
  open, pacienteNome, finalizando, onCancelar, onFecharSemFinalizar, onFinalizar,
}: {
  open: boolean
  pacienteNome?: string
  finalizando: boolean
  onCancelar: () => void
  onFecharSemFinalizar: () => void
  onFinalizar: () => void
}) {
  if (!open) return null
  return (
    <div
      onClick={onCancelar}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-card)', borderRadius: 12,
          width: '100%', maxWidth: 380,
          padding: '30px 26px 22px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          textAlign: 'center',
        }}
      >
        <div style={{
          width: 54, height: 54, borderRadius: '50%', margin: '0 auto 16px',
          background: 'var(--cor-primaria-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CheckCircle2 size={26} style={{ color: 'var(--cor-primaria)' }} />
        </div>

        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--texto-principal)', marginBottom: 8 }}>
          Finalizar atendimento?
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--texto-secundario)', lineHeight: 1.55, marginBottom: 24 }}>
          {pacienteNome ? <>O atendimento de <strong style={{ color: 'var(--texto-principal)' }}>{pacienteNome}</strong></> : 'O atendimento'}
          {' '}será marcado como concluído e o prontuário preenchido nesta tela será salvo.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            disabled={finalizando}
            onClick={onFinalizar}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 8,
              background: finalizando ? '#15a073' : 'linear-gradient(135deg,#1D9E75,#15a073)',
              color: '#fff', border: 'none',
              fontSize: 13.5, fontWeight: 700, cursor: finalizando ? 'not-allowed' : 'pointer',
              opacity: finalizando ? 0.75 : 1,
              boxShadow: '0 2px 8px rgba(29,158,117,0.35)',
              letterSpacing: '0.02em',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { if (!finalizando) e.currentTarget.style.opacity = '0.88' }}
            onMouseLeave={e => { if (!finalizando) e.currentTarget.style.opacity = '1' }}
          >
            <CheckCircle2 size={15} />
            {finalizando ? 'Finalizando...' : 'Sim, finalizar atendimento'}
          </button>
          <button
            type="button"
            disabled={finalizando}
            onClick={onFecharSemFinalizar}
            style={{
              padding: '9px 16px', borderRadius: 8,
              background: 'none', border: '1px solid var(--borda-media)',
              color: 'var(--texto-secundario)',
              fontSize: 12.5, fontWeight: 600,
              cursor: finalizando ? 'not-allowed' : 'pointer',
              opacity: finalizando ? 0.6 : 1,
            }}
          >
            Não, só fechar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PacienteCheckInFormModal({ open, paciente, agendamento, agendamentos, onClose, onSaved, ocultarRecebimento, ocultarFinalizar, ocultarCadastro }: Props) {
  const [recModalOpen, setRecModalOpen] = useState(false)
  const [pagosIds,     setPagosIds]     = useState<Set<number>>(new Set())
  const [finalizando,  setFinalizando]  = useState(false)
  // Atalho de mensagens no cabeçalho: este modal fica aberto por bastante tempo
  // durante o atendimento e não deve ser fechado só pra responder uma mensagem da
  // secretaria — abre o mesmo MensagensPanel da Sidebar por cima do prontuário.
  const { totalNaoLidas: msgNaoLidas, pulsando: msgPulsando, abrirPainel: abrirPainelMsg } = useMensagensContext()

  // Critério único de "já foi pago": `pagosIds` só cobre o que foi pago NESTA sessão do
  // modal (reseta a cada abertura, ver efeito abaixo) — sozinho, não cobre um agendamento
  // pago numa sessão/dia anterior. Tem que combinar com o dado persistido
  // (recebimento_id + status_recebimento) pra não reabrir recebimento de algo já pago.
  function jaFoiPago(ag: AgendamentoListItem) {
    return pagosIds.has(ag.id) || (!!ag.recebimento_id && ag.status_recebimento === 'PAGO')
  }

  const [aba, setAba] = useState<'Cadastro' | 'Histórico Clínico'>('Cadastro')
  const historicoRef = useRef<HistoricoClinicoHandle>(null)
  const [confirmFinalizarAberto, setConfirmFinalizarAberto] = useState(false)

  // Resolução de cadastro duplicado (CPF/CNPJ digitado na ficha já pertence a outra pessoa):
  // troca quem é exibido/editado aqui pro cadastro correto, sem navegar — ver
  // usarCadastroExistente. Começa nulo (mostra o `paciente` recebido por prop); só é
  // preenchido quando o usuário resolve uma duplicidade durante esta sessão do modal.
  const [pacienteOverride, setPacienteOverride] = useState<Props['paciente']>(null)
  const pacienteExibido = pacienteOverride ?? paciente

  useEffect(() => {
    if (open && paciente) {
      setPagosIds(new Set())
      setAba(ocultarCadastro ? 'Histórico Clínico' : 'Cadastro')
      setPacienteOverride(null)
    }
  }, [open, paciente, ocultarCadastro])

  // O modal não desmonta quando fecha (só retorna null), então o estado de aba
  // persiste entre aberturas — resetar no fechamento evita mostrar por um frame
  // a aba anterior (e o HistoricoClinico chegar a montar/buscar dados à toa) antes
  // de um useEffect corrigir depois da abertura já ter renderizado.
  function fecharModal() {
    setAba(ocultarCadastro ? 'Histórico Clínico' : 'Cadastro')
    onClose()
  }

  // Resolução de cadastro duplicado (aviso "Pessoa já cadastrada" dentro da ficha, botão
  // "Usar este cadastro"): mesmo fluxo da tela de Consultar Paciente (ver usarCadastroExistente
  // em FichaPacienteModal) — troca a ficha exibida pro cadastro correto (sem navegar, ver
  // onConsultarCadastroExistente em PessoaFormPage) e realinha o(s) agendamento(s) deste
  // check-in pra esse paciente certo via PUT (o PATCH de status não aceita paciente_id).
  // excluir_paciente_anterior_id pede pra rota tentar remover o cadastro antigo, mas só some
  // se ele não tiver CPF nem nenhum outro vínculo/papel (ver PUT /api/clinica/agendamentos).
  async function usarCadastroExistente(p: { id: number; nome: string }) {
    if (!pacienteExibido) return
    // Usa quem está exibido agora (não o `paciente` original da prop): se o usuário já
    // resolveu uma duplicidade antes nesta mesma sessão do modal, os agendamentos já foram
    // realinhados pro cadastro anterior — comparar contra o `paciente` original faria essa
    // segunda resolução não encontrar nada pra realinhar (ver revisão de código).
    const antigoId = pacienteExibido.id
    let pessoaCerta: Pessoa | null = null
    try {
      const res = await fetch(`/api/cadastro/pessoas/${p.id}`)
      if (res.ok) pessoaCerta = await res.json()
    } catch { /* tratado abaixo como falha */ }

    // Sem o cadastro completo não dá pra trocar a ficha com segurança: PessoaFormPage reseta
    // o formulário a partir do que vier aqui, e papéis/endereço/contato ausentes seriam
    // zerados num próximo "Salvar Cadastro" (full-replace). Nesse caso é melhor abortar e
    // deixar o usuário tentar de novo do que arriscar perder dados do cadastro correto.
    if (!pessoaCerta) {
      toast.error(`Não foi possível carregar o cadastro de "${p.nome}" — tente novamente.`)
      return
    }
    setPacienteOverride(pessoaCerta)

    const listaAgsAll = (agendamentos && agendamentos.length > 0) ? agendamentos : agendamento ? [agendamento] : []
    const paraRealinhar = listaAgsAll.filter(ag => ag.paciente_id === antigoId && ag.paciente_id !== p.id)
    if (paraRealinhar.length > 0) {
      const oks = await Promise.all(
        paraRealinhar.map(ag =>
          fetch(`/api/clinica/agendamentos/${ag.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paciente_id: p.id,
              profissional_id: ag.profissional_id,
              tipo_id: ag.tipo_id,
              especialidade_id: ag.especialidade_id,
              data_hora_inicio: ag.data_hora_inicio,
              data_hora_fim: ag.data_hora_fim,
              status: ag.status,
              motivo: ag.motivo,
              observacao: ag.observacao,
              categoria_id: ag.categoria_id,
              eh_encaixe: ag.eh_encaixe,
              encaixe_motivo: ag.encaixe_motivo,
              periodo: ag.periodo,
              avulso: ag.avulso,
              excluir_paciente_anterior_id: antigoId,
            }),
          }).then(r => r.ok).catch(() => false)
        )
      )
      if (oks.every(Boolean)) {
        toast.success(`Agendamento${paraRealinhar.length > 1 ? 's' : ''} vinculado${paraRealinhar.length > 1 ? 's' : ''} ao cadastro correto de "${p.nome}".`)
      } else {
        toast.error('Cadastro corrigido, mas não foi possível atualizar todos os agendamentos — recarregue a tela e confira.')
      }
    }
    onSaved?.()
  }

  async function handleRecebimentoSalvo() {
    const listaAgsAll = (agendamentos && agendamentos.length > 0) ? agendamentos : agendamento ? [agendamento] : []
    // A rota de recebimento ja faz o check-in (CONFIRMADO -> AGUARDANDO). Este PATCH e
    // rede de seguranca; nao pode reabrir uma consulta ja ATENDIDA (pagamento na saida).
    const pending = listaAgsAll.filter(ag => !jaFoiPago(ag) && !['CANCELADO', 'FALTOU', 'ATENDIDO'].includes(ag.status))
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

  // Salva o que estiver em edição no prontuário (se houver) antes de finalizar — pra não
  // perder o que foi digitado na tela sem um clique explícito em "Salvar".
  async function salvarEFinalizar() {
    await historicoRef.current?.salvarPendente()
    await finalizarAtendimento()
  }

  // "Fechar" na aba Histórico Clínico: se ainda dá pra finalizar esse atendimento, confirma
  // antes de sair (modal próprio, ver ConfirmarFinalizarModal) — evita que o profissional
  // feche a tela sem querer e perca a oportunidade de finalizar (o paciente ficaria preso
  // na sala de espera).
  function fecharHistorico() {
    const podeFinalizarAqui = !ocultarFinalizar && !!agendamento && agendamento.status !== 'ATENDIDO'
    if (!podeFinalizarAqui) { fecharModal(); return }
    setConfirmFinalizarAberto(true)
  }

  async function confirmarFinalizarEFechar() {
    setConfirmFinalizarAberto(false)
    await salvarEFinalizar()
  }

  function fecharSemFinalizar() {
    setConfirmFinalizarAberto(false)
    fecharModal()
  }

  if (!open || !paciente) return null

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,23,22,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
      padding: 16,
    }}>
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: 12,
        maxWidth: 1240,
        width: '100%',
        maxHeight: '95vh',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        border: '1px solid var(--borda-media)',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, var(--cor-primaria) 0%, var(--cor-primaria-hover) 100%)',
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
            {pacienteExibido?.foto
              ? <img src={pacienteExibido.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <User size={22} color="white" strokeWidth={1.4} />
            }
          </div>

          {/* Info paciente + agendamento */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
              {pacienteExibido?.nome || 'Paciente'}
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

          {/* Mensagens — abre o painel de chat por cima do prontuário, sem fechá-lo */}
          <button
            type="button"
            onClick={() => abrirPainelMsg()}
            title="Mensagens"
            style={{
              position: 'relative',
              background: 'rgba(255,255,255,0.18)', border: 'none', cursor: 'pointer',
              padding: '6px 8px', borderRadius: 4, color: 'white',
              display: 'flex', alignItems: 'center', flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
          >
            <MessageCircle size={16} />
            {msgNaoLidas > 0 && (
              <span
                className={msgPulsando ? 'badge-pulse' : ''}
                style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 8, height: 8, borderRadius: '50%',
                  backgroundColor: 'var(--cor-erro)', border: '1px solid var(--cor-primaria)',
                }}
              />
            )}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={aba === 'Histórico Clínico' ? fecharHistorico : fecharModal}
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
        {!ocultarCadastro && (
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
        )}

        {/* Cadastro — mesmo componente da tela de Consultar Paciente (PessoaFormPage,
            modo embutido), pra garantir os mesmos campos/layout e sobretudo o mesmo
            PATCH completo: o formulário próprio que havia aqui antes só conhecia um
            subconjunto dos campos de tab_pessoa, e a rota de PATCH substitui o registro
            inteiro — salvar por aqui zerava convênio, CRM, limite de crédito, dados
            bancários/PIX e campos fiscais que não apareciam neste modal. */}
        {aba === 'Cadastro' && !ocultarCadastro && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <PessoaFormPage
              pessoa={pacienteExibido as Pessoa}
              embutido
              onConsultarCadastroExistente={usarCadastroExistente}
              onSaved={onSaved}
            />

          </div>

          {/* Agendamento(s) do dia + Receber — específico deste modal (não existe na
              tela de Consultar Paciente), fica fora/abaixo da ficha, sem rolar com ela. */}
          <div style={{ padding: '10px 16px 0', flexShrink: 0, borderTop: '1px solid var(--borda-suave)' }}>
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
                    ag => !jaFoiPago(ag) && !['CANCELADO', 'FALTOU'].includes(ag.status)
                  )
                  if (!algumPodeReceber) return null
                  const somaTotal = listaAgs
                    .filter(ag => !jaFoiPago(ag) && !['CANCELADO', 'FALTOU'].includes(ag.status))
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
                  const pago = jaFoiPago(ag)
                  const statusAtual = pagosIds.has(ag.id) ? 'AGUARDANDO' : ag.status
                  const statusColor = STATUS_COLOR[statusAtual] ?? '#378ADD'
                  const podeReceber = !pago && !['CANCELADO', 'FALTOU'].includes(statusAtual)
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
                        {pago && (
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
          </div>

          {/* Botões — Salvar fica dentro da ficha (botão próprio do PessoaFormPage, no
              topo), aqui só o que é deste modal (fechar / finalizar atendimento). */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', flexShrink: 0 }}>
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
            {!ocultarFinalizar && agendamento && agendamento.status !== 'ATENDIDO' && (
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

        </div>
        )}

        {/* Histórico Clínico — prontuário + emissão de receita, sempre disponível
            (inclusive pro atendimento atual, mesmo antes dele virar ATENDIDO) */}
        {aba === 'Histórico Clínico' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <HistoricoClinico ref={historicoRef} pacienteId={pacienteExibido!.id} agendamentoAtual={agendamento ?? null} autoEditarAtual={ocultarCadastro} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={fecharHistorico}
                style={{
                  padding: '4px 14px', borderRadius: 3, border: '1px solid var(--borda-media)',
                  background: 'none', color: 'var(--texto-principal)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Fechar
              </button>
              {!ocultarFinalizar && agendamento && agendamento.status !== 'ATENDIDO' && (
                <button
                  type="button"
                  disabled={finalizando}
                  onClick={salvarEFinalizar}
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
          const pendingAgs = listaAgsAll.filter(ag => !jaFoiPago(ag) && !['CANCELADO', 'FALTOU'].includes(ag.status))
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

        <ConfirmarFinalizarModal
          open={confirmFinalizarAberto}
          pacienteNome={pacienteExibido?.nome}
          finalizando={finalizando}
          onCancelar={() => setConfirmFinalizarAberto(false)}
          onFecharSemFinalizar={fecharSemFinalizar}
          onFinalizar={confirmarFinalizarEFechar}
        />
      </div>
    </div>
  )
}
