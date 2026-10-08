'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Send, X, Plus, Check, CheckCheck, Trash2 } from 'lucide-react'
import type { Conversa, Mensagem, UsuarioChat } from '@/types/mensagem.types'
import AvatarUsuario from './AvatarUsuario'

interface Props {
  open: boolean
  onClose: () => void
  conversas: Conversa[]
  tick: number
  meuUsuarioId: number
  onRefetchConversas: () => void
  // Pedido de abrir uma conversa específica vindo de fora do painel (lista de
  // nomes na sidebar, clique num toast) — `ts` muda a cada clique, mesmo pro
  // mesmo usuário, pra garantir que o efeito dispare toda vez.
  pedidoAbrir: { id: number; nome: string; ts: number } | null
}

function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Confirmação estilizada em vez de window.confirm() (padrão do projeto — ver skill
// "modal-abertura-rapida-e-confirmacao-estilizada"). Local ao arquivo por só ser
// usado aqui. Serve tanto pra excluir 1 mensagem quanto a conversa inteira — só
// muda o texto, a chamada de exclusão em si é feita pelo chamador.
function ConfirmarExcluir({
  aberto, tipo, outroNome, excluindo, onCancelar, onConfirmar,
}: {
  aberto: boolean
  tipo: 'mensagem' | 'conversa'
  outroNome: string
  excluindo: boolean
  onCancelar: () => void
  onConfirmar: () => void
}) {
  if (!aberto) return null

  const titulo = tipo === 'mensagem' ? 'Excluir mensagem?' : 'Excluir conversa inteira?'
  const corpo = tipo === 'mensagem'
    ? `Ela some só da sua tela — ${outroNome} continua vendo normalmente.`
    : `Todas as mensagens dessa conversa somem só da sua tela — ${outroNome} continua vendo tudo normalmente.`

  return (
    <div
      onClick={onCancelar}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-card)', borderRadius: 12, padding: 20, width: 280,
          textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          width: 40, height: 40, borderRadius: '50%', margin: '0 auto 10px',
          backgroundColor: 'var(--cor-erro-bg)', color: 'var(--cor-erro)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Trash2 size={18} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--texto-principal)', marginBottom: 4 }}>
          {titulo}
        </div>
        <div style={{ fontSize: 12, color: 'var(--texto-secundario)', marginBottom: 16 }}>
          {corpo}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={onCancelar}>Cancelar</button>
          <button className="btn-danger" style={{ flex: 1 }} onClick={onConfirmar} disabled={excluindo}>
            {excluindo ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MensagensPanel({ open, onClose, conversas, tick, meuUsuarioId, onRefetchConversas, pedidoAbrir }: Props) {
  const [selecionado, setSelecionado]       = useState<{ id: number; nome: string } | null>(null)
  const [mensagens, setMensagens]           = useState<Mensagem[]>([])
  const [texto, setTexto]                   = useState('')
  const [enviando, setEnviando]             = useState(false)
  const [novaConversa, setNovaConversa]     = useState(false)
  const [usuariosDisponiveis, setUsuarios]  = useState<UsuarioChat[]>([])
  const [paraExcluir, setParaExcluir]               = useState<string | null>(null)
  const [conversaParaExcluir, setConversaParaExcluir] = useState<{ id: number; nome: string } | null>(null)
  const [excluindo, setExcluindo]                   = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  // Guarda qual conversa está selecionada "de verdade" nesta instância — usado pra
  // descartar respostas de fetch que chegam atrasadas depois do usuário já ter
  // trocado de conversa (ou fechado o painel), evitando sobrescrever o estado errado.
  const selecionadoIdRef = useRef<number | null>(null)
  useEffect(() => { selecionadoIdRef.current = selecionado?.id ?? null }, [selecionado])

  // Fechar o painel não deve continuar marcando mensagens como lidas em segundo
  // plano (o efeito de tick abaixo faria isso silenciosamente se a conversa
  // continuasse selecionada) — volta pra lista de conversas ao fechar. Também
  // zera um pedido de exclusão pendente: sem isso, reabrir o painel noutra
  // conversa reexibe o diálogo de confirmação apontando pro ID da mensagem
  // antiga, de outra conversa.
  useEffect(() => {
    if (!open) { setSelecionado(null); setNovaConversa(false); setParaExcluir(null); setConversaParaExcluir(null) }
  }, [open])

  async function abrirConversa(id: number, nome: string) {
    setSelecionado({ id, nome })
    setNovaConversa(false)
    setMensagens([])
    const res = await fetch(`/api/mensagens/conversas/${id}`)
    if (res.ok) {
      const json = await res.json()
      if (selecionadoIdRef.current === id) setMensagens(json.dados ?? [])
    }
    onRefetchConversas()
  }

  // Reage a um pedido de abertura vindo de fora (lista de nomes na sidebar, clique
  // num toast) — abre direto na conversa daquela pessoa, sem precisar passar pela lista.
  useEffect(() => {
    if (pedidoAbrir) abrirConversa(pedidoAbrir.id, pedidoAbrir.nome)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoAbrir?.ts])

  async function abrirNovaConversa() {
    setNovaConversa(true)
    setSelecionado(null)
    if (usuariosDisponiveis.length === 0) {
      const res = await fetch('/api/mensagens/usuarios')
      if (res.ok) setUsuarios((await res.json()).dados ?? [])
    }
  }

  async function enviar() {
    const t = texto.trim()
    if (!t || !selecionado || enviando) return
    setEnviando(true)
    setTexto('')
    try {
      const res = await fetch('/api/mensagens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinatario_id: selecionado.id, texto: t }),
      })
      if (res.ok) {
        const idEnviado = selecionado.id
        const res2 = await fetch(`/api/mensagens/conversas/${idEnviado}`)
        if (res2.ok && selecionadoIdRef.current === idEnviado) {
          setMensagens((await res2.json()).dados ?? [])
        }
        onRefetchConversas()
      } else {
        setTexto(t) // falha no envio — devolve o texto digitado em vez de descartar
      }
    } catch {
      setTexto(t) // rede caiu antes de completar — mesma recuperação
    } finally {
      setEnviando(false)
    }
  }

  // Reabre a conversa ativa quando o SSE sinaliza mudança (mensagem nova ou "visto").
  // Só roda com o painel aberto e uma conversa selecionada — senão marcaria mensagens
  // como lidas em segundo plano sem o usuário ter visto nada (ver efeito de `open` acima).
  useEffect(() => {
    if (!open || !selecionado) return
    const id = selecionado.id
    fetch(`/api/mensagens/conversas/${id}`)
      .then(res => (res.ok ? res.json() : null))
      .then(json => { if (json && selecionadoIdRef.current === id) setMensagens(json.dados ?? []) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  // Só rola pro final quando o número de mensagens AUMENTA (mensagem nova chegou,
  // ou a conversa acabou de abrir) — uma atualização do tick que só mudou lida_em
  // (sem mensagem nova) ou uma exclusão não devem arrancar o usuário do ponto do
  // histórico que ele estava lendo.
  const ultimaContagemRef = useRef(0)
  useEffect(() => {
    if (mensagens.length > ultimaContagemRef.current) {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
    }
    ultimaContagemRef.current = mensagens.length
  }, [mensagens])

  async function confirmarExclusao() {
    if (!paraExcluir) return
    setExcluindo(true)
    try {
      const res = await fetch(`/api/mensagens/${paraExcluir}`, { method: 'DELETE' })
      if (res.ok) {
        setMensagens(prev => prev.filter(m => m.id !== paraExcluir))
        onRefetchConversas()
      }
    } finally {
      setExcluindo(false)
      setParaExcluir(null)
    }
  }

  async function confirmarExclusaoConversa() {
    if (!conversaParaExcluir) return
    setExcluindo(true)
    try {
      const res = await fetch(`/api/mensagens/conversas/${conversaParaExcluir.id}`, { method: 'DELETE' })
      if (res.ok) {
        if (selecionadoIdRef.current === conversaParaExcluir.id) {
          setSelecionado(null)
          setMensagens([])
        }
        onRefetchConversas()
      }
    } finally {
      setExcluindo(false)
      setConversaParaExcluir(null)
    }
  }

  if (!open) return null

  const ultimaMinhaMsg = [...mensagens].reverse().find(m => m.remetente_id === meuUsuarioId)

  return (
    <div
      style={{
        position: 'fixed', left: 256, bottom: 16, zIndex: 500,
        width: 340, height: 480,
        backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda-media)',
        borderRadius: 'var(--radius-md)', boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        borderBottom: '0.5px solid var(--borda-suave)', flexShrink: 0,
      }}>
        {(selecionado || novaConversa) && (
          <button
            onClick={() => { setSelecionado(null); setNovaConversa(false) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--texto-secundario)' }}
          >
            <ArrowLeft size={16} />
          </button>
        )}
        {selecionado && <AvatarUsuario nome={selecionado.nome} tamanho={26} />}
        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)' }}>
          {selecionado ? selecionado.nome : novaConversa ? 'Nova conversa' : 'Mensagens'}
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--texto-terciario)' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Lista de conversas */}
      {!selecionado && !novaConversa && (
        <>
          {/* Linha de ação primária, no padrão btn-primary do resto do sistema —
              em vez de um ícone "+" pequeno no header, pra ficar mais claro/visível. */}
          <button
            onClick={abrirNovaConversa}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', flexShrink: 0,
              padding: '10px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
              backgroundColor: 'var(--cor-primaria)', color: '#fff',
              borderBottom: '0.5px solid var(--borda-suave)',
            }}
          >
            <Plus size={16} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Nova mensagem</span>
          </button>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversas.length === 0 && (
              <div style={{ padding: 20, fontSize: 12, color: 'var(--texto-terciario)', textAlign: 'center' }}>
                Nenhuma conversa ainda. Clique em "Nova mensagem" pra começar.
              </div>
            )}
            {conversas.map(c => (
              <div key={c.usuario_id} className="conversa-linha" style={{ borderBottom: '0.5px solid var(--borda-suave)' }}>
                <button
                  onClick={() => abrirConversa(c.usuario_id, c.nome)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '10px 32px 10px 12px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left', minWidth: 0,
                  }}
                >
                  <AvatarUsuario nome={c.nome} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)' }}>{c.nome}</div>
                    <div style={{
                      fontSize: 12, color: 'var(--texto-terciario)', whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {c.ultima_mensagem_de_mim && 'Você: '}{c.ultima_mensagem}
                    </div>
                  </div>
                  {c.nao_lidas > 0 && (
                    <span style={{
                      backgroundColor: 'var(--cor-primaria)', color: '#fff', borderRadius: 999,
                      fontSize: 11, fontWeight: 700, minWidth: 18, height: 18, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                    }}>
                      {c.nao_lidas}
                    </span>
                  )}
                </button>
                <button
                  className="conversa-excluir-btn"
                  onClick={() => setConversaParaExcluir({ id: c.usuario_id, nome: c.nome })}
                  title="Excluir conversa"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Nova conversa — escolher usuário */}
      {novaConversa && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {usuariosDisponiveis.length === 0 && (
            <div style={{ padding: 20, fontSize: 12, color: 'var(--texto-terciario)', textAlign: 'center' }}>
              Nenhum outro usuário disponível nesta empresa.
            </div>
          )}
          {usuariosDisponiveis.map(u => (
            <button
              key={u.id}
              onClick={() => abrirConversa(u.id, u.nome)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '10px 12px', background: 'none', border: 'none',
                borderBottom: '0.5px solid var(--borda-suave)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <AvatarUsuario nome={u.nome} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)' }}>{u.nome}</div>
              <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginLeft: 'auto' }}>{u.perfil}</div>
            </button>
          ))}
        </div>
      )}

      {/* Thread da conversa */}
      {selecionado && (
        <>
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {mensagens.map(m => {
              const minha = m.remetente_id === meuUsuarioId
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: minha ? 'flex-end' : 'flex-start' }}>
                  <div className="msg-bolha" style={{
                    position: 'relative', maxWidth: '78%', padding: '7px 26px 7px 10px', borderRadius: 12,
                    backgroundColor: minha ? 'var(--cor-primaria)' : 'var(--bg-hover)',
                    color: minha ? '#fff' : 'var(--texto-principal)',
                    fontSize: 13, lineHeight: 1.4, wordBreak: 'break-word',
                  }}>
                    {m.texto}
                    <div style={{
                      fontSize: 10, marginTop: 3, textAlign: 'right',
                      color: minha ? 'rgba(255,255,255,0.75)' : 'var(--texto-terciario)',
                    }}>
                      {formatarHora(m.created_at)}
                    </div>
                    <button
                      className="msg-excluir-btn"
                      onClick={() => setParaExcluir(m.id)}
                      title="Excluir mensagem"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              )
            })}
            {ultimaMinhaMsg && (
              <div style={{
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3,
                fontSize: 11, color: 'var(--texto-terciario)', marginTop: -2,
              }}>
                {ultimaMinhaMsg.lida_em
                  ? <><CheckCheck size={12} color="var(--cor-primaria)" /> Visto às {formatarHora(ultimaMinhaMsg.lida_em)}</>
                  : <><Check size={12} /> Enviada</>}
              </div>
            )}
          </div>

          <form
            onSubmit={e => { e.preventDefault(); enviar() }}
            style={{ display: 'flex', gap: 6, padding: 8, borderTop: '0.5px solid var(--borda-suave)', flexShrink: 0 }}
          >
            <input
              className="input-field"
              style={{ flex: 1 }}
              placeholder="Escreva uma mensagem..."
              value={texto}
              onChange={e => setTexto(e.target.value)}
              maxLength={2000}
              autoFocus
            />
            <button type="submit" className="btn-primary" disabled={!texto.trim() || enviando} style={{ padding: '0 12px' }}>
              <Send size={16} />
            </button>
          </form>
        </>
      )}

      <ConfirmarExcluir
        aberto={!!paraExcluir || !!conversaParaExcluir}
        tipo={paraExcluir ? 'mensagem' : 'conversa'}
        outroNome={paraExcluir ? (selecionado?.nome ?? '') : (conversaParaExcluir?.nome ?? '')}
        excluindo={excluindo}
        onCancelar={() => { setParaExcluir(null); setConversaParaExcluir(null) }}
        onConfirmar={paraExcluir ? confirmarExclusao : confirmarExclusaoConversa}
      />
    </div>
  )
}
