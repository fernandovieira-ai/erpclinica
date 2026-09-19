'use client'

import { useEffect, useState } from 'react'
import { Printer, Loader2 } from 'lucide-react'
import { gerarHtmlRelatorioAtendimentos, type ItemRelatorioAtendimento } from './relatorioAtendimentosPrint'

interface Props {
  open:        boolean
  onClose:     () => void
  dataInicial: string   // YYYY-MM-DD — dia exibido no Fechamento Diário
}

interface OpcaoLista { id: number; nome: string }

const labelStyle = { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 } as const

export default function RelatorioAtendimentosModal({ open, onClose, dataInicial }: Props) {
  const [inicio, setInicio]                 = useState(dataInicial)
  const [fim, setFim]                       = useState(dataInicial)
  const [profissionalId, setProfissionalId] = useState('')
  const [categoriaId, setCategoriaId]       = useState('')
  const [agrupar, setAgrupar]               = useState(true)
  const [profissionais, setProfissionais]   = useState<OpcaoLista[]>([])
  const [categorias, setCategorias]         = useState<OpcaoLista[]>([])
  const [gerando, setGerando]               = useState(false)
  const [erro, setErro]                     = useState<string | null>(null)

  // Cada abertura começa no dia que está na tela, sem filtros
  useEffect(() => {
    if (!open) return
    setInicio(dataInicial); setFim(dataInicial)
    setProfissionalId(''); setCategoriaId('')
    setErro(null)
  }, [open, dataInicial])

  useEffect(() => {
    if (!open) return
    let cancelado = false
    Promise.all([
      fetch('/api/clinica/profissionais').then(r => r.json()),
      fetch('/api/clinica/categorias?limit=200').then(r => r.json()),
    ]).then(([p, c]) => {
      if (cancelado) return
      setProfissionais((p.dados ?? []).map((x: { id: number; nome: string }) => ({ id: x.id, nome: x.nome })))
      setCategorias((c.dados ?? []).map((x: { id: number; descricao: string }) => ({ id: x.id, nome: x.descricao })))
    }).catch(() => { /* filtros ficam só com "Todos"; o relatório continua funcionando */ })
    return () => { cancelado = true }
  }, [open])

  if (!open) return null

  async function gerar() {
    if (!inicio || !fim) { setErro('Informe o período'); return }
    if (inicio > fim)    { setErro('A data final não pode ser anterior à inicial'); return }
    setErro(null)
    setGerando(true)

    // A janela abre já no clique (antes do fetch) pra o navegador não tratar como pop-up bloqueável
    const win = window.open('', '_blank', 'width=900,height=1100')
    if (!win) {
      setErro('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente de novo.')
      setGerando(false)
      return
    }
    win.document.write('<title>Gerando relatório...</title><body style="font-family:sans-serif;padding:24px;color:#555">Gerando relatório...</body>')

    try {
      const sp = new URLSearchParams({ inicio, fim })
      if (profissionalId) sp.set('profissional_id', profissionalId)
      if (categoriaId)    sp.set('categoria_id', categoriaId)

      const res  = await fetch(`/api/gerencial/fechamento-diario/relatorio?${sp}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        win.close()
        setErro(typeof json.erro === 'string' ? json.erro : 'Erro ao gerar o relatório')
        return
      }

      const itens: ItemRelatorioAtendimento[] = json.itens ?? []
      if (itens.length === 0) {
        win.close()
        setErro('Nenhum atendimento encontrado para os filtros informados.')
        return
      }

      const html = gerarHtmlRelatorioAtendimentos(itens, {
        inicio, fim,
        medicoNome:       profissionais.find(p => String(p.id) === profissionalId)?.nome ?? null,
        categoriaNome:    categorias.find(c => String(c.id) === categoriaId)?.nome ?? null,
        agruparPorMedico: agrupar,
        empresaNome:      json.empresa_nome ?? '',
        empresaLogo:      json.empresa_logo ?? null,
        emitidoPor:       json.emitido_por ?? '',
      })
      win.document.open()
      win.document.write(html)
      win.document.close()
      onClose()
    } catch {
      win.close()
      setErro('Erro de conexão ao gerar o relatório')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={() => { if (!gerando) onClose() }}
    >
      <div className="card" style={{ width: 460, maxWidth: '92vw', padding: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <Printer size={16} style={{ color: 'var(--cor-primaria)' }} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Imprimir Relatório</div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--texto-secundario)', marginBottom: 14 }}>
          Pacientes pelo tipo de atendimento — quem compareceu (aguardando ou atendido) ou pagou, com valor a pagar e valor pago.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Período - de</label>
            <input type="date" className="input-field" value={inicio} onChange={e => setInicio(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div>
            <label style={labelStyle}>até</label>
            <input type="date" className="input-field" value={fim} onChange={e => setFim(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Médico</label>
          <select className="input-field" value={profissionalId} onChange={e => setProfissionalId(e.target.value)} style={{ width: '100%' }}>
            <option value="">Todos os médicos</option>
            {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Categoria</label>
          <select className="input-field" value={categoriaId} onChange={e => setCategoriaId(e.target.value)} style={{ width: '100%' }}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" checked={agrupar} onChange={e => setAgrupar(e.target.checked)} style={{ marginTop: 2, cursor: 'pointer' }} />
          <span>
            <strong>Agrupar por médico</strong>
            <span style={{ display: 'block', color: 'var(--texto-terciario)', fontSize: 11.5 }}>
              Separa os atendimentos por médico, com subtotal de cada um e resumo no final. Desmarcado, sai uma lista única com a coluna Médico.
            </span>
          </span>
        </label>

        {erro && (
          <div style={{ fontSize: 12.5, color: 'var(--cor-erro)', background: 'var(--cor-erro-bg)', borderRadius: 6, padding: '8px 10px', marginBottom: 12 }}>
            {erro}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose} disabled={gerando}>Cancelar</button>
          <button className="btn-primary" onClick={gerar} disabled={gerando} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {gerando ? <><Loader2 size={14} className="spin" /> Gerando...</> : <><Printer size={14} /> Imprimir</>}
          </button>
        </div>
      </div>
    </div>
  )
}
