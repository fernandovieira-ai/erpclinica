'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Ban, ArrowLeft, Zap, Undo2 } from 'lucide-react'
import type { VendaCartao, VendaCartaoParcela } from '@/types/cartao.types'

interface Props { venda: VendaCartao }

function fmtValor(v: string | number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(d: string | null) {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}
function hoje() {
  return new Date().toISOString().slice(0, 10)
}
function diaAnterior(d: string) {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() - 1)
  return dt.toISOString().slice(0, 10)
}
function diffDias(dataMaior: string, dataMenor: string) {
  const a = new Date(dataMaior + 'T00:00:00').getTime()
  const b = new Date(dataMenor + 'T00:00:00').getTime()
  return Math.round((a - b) / 86400000)
}

const STATUS_COR: Record<string, string> = {
  PENDENTE:   'var(--cor-aviso)',
  PARCIAL:    'var(--cor-aviso)',
  FATURADA:   'var(--cor-primaria)',
  CONCILIADA: 'var(--cor-sucesso)',
  CANCELADA:  'var(--texto-terciario)',
  CANCELADO:  'var(--texto-terciario)',
}

// Venda no cartão é sempre gerada automaticamente pelo recebimento de
// consulta/receita/baixa de título — não existe formulário de criação manual.
export default function VendaCartaoFormPage({ venda }: Props) {
  const router = useRouter()
  const [cancelando, setCancelando] = useState(false)
  const [antecipandoId, setAntecipandoId] = useState<number | null>(null)
  const [novaData, setNovaData] = useState('')
  const [processando, setProcessando] = useState<number | null>(null)

  const podeCancelar = venda.status === 'PENDENTE' && venda.parcelas.every(p => p.status === 'PENDENTE')
  const pctAntecipacaoAM = Number(venda.percentual_antecipacao_am) || 0

  async function cancelar() {
    if (!confirm('Cancelar esta venda no cartão?')) return
    setCancelando(true)
    try {
      const res = await fetch(`/api/financeiro/cartao/vendas/${venda.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancelar' }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.erro ?? 'Erro ao cancelar'); return }
      toast.success('Venda cancelada!')
      router.refresh()
    } finally { setCancelando(false) }
  }

  function abrirAntecipar(p: VendaCartaoParcela) {
    setAntecipandoId(p.id)
    setNovaData('')
  }

  function fecharAntecipar() {
    setAntecipandoId(null)
    setNovaData('')
  }

  function previewAntecipacao(p: VendaCartaoParcela) {
    if (!novaData) return null
    const dias = diffDias(p.data_prevista, novaData)
    if (dias <= 0) return { erro: 'A data precisa ser anterior à previsão atual' }
    const pct = pctAntecipacaoAM * dias / 30
    if (pct >= 100) return { erro: 'Desconto calculado inválido — revise a taxa de antecipação cadastrada' }
    const novoValor = Number(p.valor_liquido) * (1 - pct / 100)
    return { dias, pct, novoValor }
  }

  async function confirmarAntecipar(p: VendaCartaoParcela) {
    const preview = previewAntecipacao(p)
    if (!preview || 'erro' in preview) return
    setProcessando(p.id)
    try {
      const res = await fetch(`/api/financeiro/cartao/vendas/parcelas/${p.id}/antecipar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nova_data_prevista: novaData }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.erro ?? 'Erro ao antecipar parcela'); return }
      toast.success(`Antecipada — ${fmtValor(json.valor_liquido_novo)} (desconto de ${Number(json.percentual_aplicado).toFixed(2)}%)`)
      fecharAntecipar()
      router.refresh()
    } finally { setProcessando(null) }
  }

  async function estornarAntecipacao(p: VendaCartaoParcela) {
    if (!confirm('Estornar a antecipação desta parcela? Ela volta para o valor e data originais.')) return
    setProcessando(p.id)
    try {
      const res = await fetch(`/api/financeiro/cartao/vendas/parcelas/${p.id}/estornar-antecipacao`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.erro ?? 'Erro ao estornar antecipação'); return }
      toast.success('Antecipação estornada.')
      router.refresh()
    } finally { setProcessando(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--borda-suave)', flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/financeiro/cartao-vendas')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <ArrowLeft size={13} /> Voltar
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)', marginLeft: 4 }}>Venda no Cartão #{venda.id}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COR[venda.status_parcelas], border: `1px solid ${STATUS_COR[venda.status_parcelas]}`, borderRadius: 3, padding: '2px 7px' }}>{venda.status_parcelas}</span>
        <div style={{ flex: 1 }} />
        {podeCancelar && (
          <button type="button" disabled={cancelando} onClick={cancelar}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)', opacity: cancelando ? 0.5 : 1 }}>
            <Ban size={13} /> {cancelando ? 'Cancelando...' : 'Cancelar Venda'}
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', gap: 20 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 420, fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px 8px' }}>
            <span style={{ color: 'var(--texto-terciario)' }}>Origem:</span>            <span>{venda.observacao ?? '—'}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Conta Bancária:</span>     <span>{venda.conta_banco_desc}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Condição:</span>           <span>{venda.condicao_descricao}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Adquirente:</span>         <span>{venda.adquirente} · {venda.bandeira}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Modalidade:</span>         <span>{venda.modalidade}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Parcelas:</span>           <span>{venda.qtd_parcelas}x</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Valor Bruto:</span>        <span style={{ fontWeight: 600, fontFamily: 'var(--fonte-mono)' }}>{fmtValor(venda.valor_bruto)}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>MDR Aplicado:</span>       <span>{venda.percentual_mdr_aplicado ? `${Number(venda.percentual_mdr_aplicado).toFixed(4)}%` : '—'}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>NSU:</span>                <span style={{ fontFamily: 'var(--fonte-mono)' }}>{venda.nsu ?? '—'}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Cód. Autorização:</span>   <span style={{ fontFamily: 'var(--fonte-mono)' }}>{venda.codigo_autorizacao ?? '—'}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Data da Venda:</span>      <span>{new Date(venda.data_venda).toLocaleString('pt-BR')}</span>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--texto-terciario)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Parcelas {pctAntecipacaoAM > 0 && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· taxa de antecipação: {pctAntecipacaoAM.toFixed(2)}% a.m.</span>}
          </div>
          <div className="card">
            <div className="table-wrapper">
              <table className="table-base">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>Nº</th>
                    <th style={{ textAlign: 'right' }}>Bruto</th>
                    <th style={{ textAlign: 'right' }}>Líquido</th>
                    <th>Previsão</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ width: 170 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {venda.parcelas.map(p => {
                    const preview = antecipandoId === p.id ? previewAntecipacao(p) : null
                    return (
                    <Fragment key={p.id}>
                      <tr>
                        <td style={{ fontFamily: 'var(--fonte-mono)' }}>{p.numero_parcela}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)' }}>{fmtValor(p.valor)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600 }}>
                          {fmtValor(p.valor_liquido)}
                          {p.antecipado && (
                            <div style={{ fontSize: 10, color: 'var(--texto-terciario)', fontWeight: 400 }}>
                              era {fmtValor(p.valor_liquido_original)}
                            </div>
                          )}
                        </td>
                        <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--texto-secundario)' }}>
                          {fmtData(p.data_prevista)}
                          {p.antecipado && (
                            <div style={{ fontSize: 10, color: 'var(--texto-terciario)' }}>
                              era {fmtData(p.data_prevista_original)}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COR[p.status] }}>{p.status}</span>
                          {p.antecipado && (
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#F59E0B', marginTop: 2 }}>
                              <Zap size={9} style={{ verticalAlign: -1 }} /> antecipada {Number(p.percentual_antecipacao_aplicado).toFixed(2)}%
                            </div>
                          )}
                        </td>
                        <td>
                          {p.status === 'PENDENTE' && !p.antecipado && antecipandoId !== p.id && (
                            <button type="button" onClick={() => abrirAntecipar(p)}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'none', border: '1px solid var(--cor-primaria)', borderRadius: 3, fontSize: 11, cursor: 'pointer', color: 'var(--cor-primaria)' }}>
                              <Zap size={11} /> Antecipar
                            </button>
                          )}
                          {p.status === 'PENDENTE' && p.antecipado && (
                            <button type="button" disabled={processando === p.id} onClick={() => estornarAntecipacao(p)}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3, fontSize: 11, cursor: 'pointer', color: 'var(--cor-erro)', opacity: processando === p.id ? 0.6 : 1 }}>
                              <Undo2 size={11} /> {processando === p.id ? 'Estornando...' : 'Estornar'}
                            </button>
                          )}
                          {antecipandoId === p.id && (
                            <button type="button" onClick={fecharAntecipar}
                              style={{ padding: '3px 8px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 11, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
                              Cancelar
                            </button>
                          )}
                        </td>
                      </tr>
                      {antecipandoId === p.id && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--bg-hover)', padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <label style={{ fontSize: 11, color: 'var(--texto-secundario)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                Nova data de recebimento:
                                <input type="date" className="input-field" value={novaData}
                                  min={hoje()} max={diaAnterior(p.data_prevista)}
                                  onChange={e => setNovaData(e.target.value)} style={{ width: 150 }} />
                              </label>
                              {preview && 'erro' in preview && (
                                <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{preview.erro}</span>
                              )}
                              {preview && !('erro' in preview) && (
                                <span style={{ fontSize: 12, color: 'var(--texto-principal)' }}>
                                  {preview.dias} dia(s) antes · desconto {preview.pct.toFixed(2)}% ·
                                  {' '}<strong style={{ color: 'var(--cor-primaria)' }}>{fmtValor(preview.novoValor)}</strong>
                                  {' '}<span style={{ color: 'var(--texto-terciario)' }}>(era {fmtValor(p.valor_liquido)})</span>
                                </span>
                              )}
                              <button type="button" disabled={!preview || 'erro' in preview || processando === p.id}
                                onClick={() => confirmarAntecipar(p)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: (!preview || 'erro' in preview) ? 'not-allowed' : 'pointer', opacity: (!preview || 'erro' in preview) ? 0.5 : 1 }}>
                                <Zap size={11} /> {processando === p.id ? 'Confirmando...' : 'Confirmar Antecipação'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
