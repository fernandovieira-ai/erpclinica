'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle, Undo2, ClipboardList, Receipt } from 'lucide-react'
import type { FaturaCartao } from '@/types/cartao.types'
import MoneyInput from '@/components/ui/MoneyInput'

interface Props { fatura: FaturaCartao }

function fmtValor(v: string | number | null) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(d: string | null) {
  if (!d) return '—'
  return d.slice(0, 10).split('-').reverse().join('/')
}

const STATUS_COR: Record<string, string> = {
  ABERTA:     'var(--cor-aviso)',
  CONFIRMADA: 'var(--cor-sucesso)',
  CANCELADA:  'var(--texto-terciario)',
}

export default function FaturaCartaoDetalhePage({ fatura }: Props) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [estornando,  setEstornando]  = useState(false)
  const [valorDesconto,  setValorDesconto]  = useState<number>(Number(fatura.valor_desconto ?? 0))
  const [valorAcrescimo, setValorAcrescimo] = useState<number>(Number(fatura.valor_acrescimo ?? 0))
  const [dataConfirmacao, setDataConfirmacao] = useState<string>(fatura.data_confirmacao ?? new Date().toISOString().slice(0, 10))
  const [contas, setContas] = useState<Array<{ id: number; mnemonico: string }>>([])
  const [contaBancoId, setContaBancoId] = useState<number | null>(fatura.conta_banco_id)

  const valorLiquido = Number(fatura.valor_previsto) - valorDesconto + valorAcrescimo
  const isAberta      = fatura.status === 'ABERTA'
  const isConfirmada  = fatura.status === 'CONFIRMADA'

  useEffect(() => {
    if (!isAberta) return
    fetch('/api/cadastro/contas-banco?ativo=true&limit=100')
      .then(r => r.json())
      .then(d => setContas(d.dados ?? []))
      .catch(() => {})
  }, [isAberta])

  async function confirmar() {
    if (!contaBancoId) { toast.error('Selecione a conta bancária que recebeu o depósito'); return }
    if (!confirm('Confirmar recebimento desta fatura? Isso vai gerar o lançamento na conta bancária.')) return
    setConfirmando(true)
    try {
      const res  = await fetch(`/api/financeiro/cartao/faturas/${fatura.id}/confirmar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta_banco_id: contaBancoId, valor_desconto: valorDesconto, valor_acrescimo: valorAcrescimo, data_confirmacao: dataConfirmacao }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.erro ?? 'Erro ao confirmar fatura'); return }
      toast.success('Fatura confirmada — movimento bancário gerado!')
      router.refresh()
    } finally { setConfirmando(false) }
  }

  async function estornar() {
    const msg = isConfirmada
      ? 'Estornar a confirmação desta fatura? Isso vai apagar o lançamento bancário gerado e as parcelas voltam para "faturada".'
      : 'Estornar esta fatura? O registro é removido e as parcelas voltam para "pendente", prontas para uma próxima geração.'
    if (!confirm(msg)) return
    setEstornando(true)
    try {
      const res  = await fetch(`/api/financeiro/cartao/faturas/${fatura.id}/estornar`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.erro ?? 'Erro ao estornar fatura'); return }
      if (json.acao === 'CONFIRMACAO_ESTORNADA') {
        toast.success('Confirmação estornada — lançamento bancário removido.')
        router.refresh()
      } else {
        toast.success('Fatura estornada — registro removido e parcelas liberadas.')
        router.push('/financeiro/cartao-faturas')
      }
    } finally { setEstornando(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--borda-suave)', flexShrink: 0 }}>
        <button type="button" onClick={() => router.push('/financeiro/cartao-faturas')}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
          <ArrowLeft size={13} /> Voltar
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--texto-principal)', marginLeft: 4 }}>Fatura de Cartão #{fatura.id}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COR[fatura.status], border: `1px solid ${STATUS_COR[fatura.status]}`, borderRadius: 3, padding: '2px 7px' }}>{fatura.status}</span>
        <div style={{ flex: 1 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', gap: 20 }}>
        <div style={{ flex: 1, maxWidth: 420 }}>
          <fieldset className="form-fieldset" style={{ fontSize: 12 }}>
            <legend>
              <ClipboardList size={12} /> Dados da Fatura
            </legend>
            <div className="form-fieldset-body">
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px 8px', alignItems: 'center' }}>
                <span style={{ color: 'var(--texto-terciario)' }}>Adquirente:</span>      <span>{fatura.adquirente}</span>
                <span style={{ color: 'var(--texto-terciario)' }}>Data Prevista:</span>   <span>{fmtData(fatura.data_prevista)}</span>
                <span style={{ color: 'var(--texto-terciario)' }}>Qtd. Parcelas:</span>   <span>{fatura.qtd_parcelas}</span>
                <span style={{ color: 'var(--texto-terciario)' }}>Valor Original:</span>  <span style={{ fontWeight: 600, fontFamily: 'var(--fonte-mono)' }}>{fmtValor(fatura.valor_previsto)}</span>

                <span style={{ color: 'var(--texto-terciario)' }}>Desconto:</span>
                {isAberta ? <MoneyInput value={valorDesconto} onValue={setValorDesconto} style={{ width: 140 }} /> : <span>{fmtValor(fatura.valor_desconto)}</span>}

                <span style={{ color: 'var(--texto-terciario)' }}>Acréscimo:</span>
                {isAberta ? <MoneyInput value={valorAcrescimo} onValue={setValorAcrescimo} style={{ width: 140 }} /> : <span>{fmtValor(fatura.valor_acrescimo)}</span>}

                <span style={{ color: 'var(--texto-terciario)' }}>Valor a Confirmar:</span>
                {isAberta
                  ? <span style={{ fontWeight: 600, fontFamily: 'var(--fonte-mono)', color: 'var(--cor-primaria)' }}>{fmtValor(valorLiquido)}</span>
                  : <span style={{ fontWeight: 600, fontFamily: 'var(--fonte-mono)' }}>{fmtValor(fatura.valor_cobrado)}</span>}

                <span style={{ color: 'var(--texto-terciario)' }}>Data:</span>
                {isAberta ? (
                  <input type="date" value={dataConfirmacao} onChange={e => setDataConfirmacao(e.target.value)}
                    style={{ width: 160, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }} />
                ) : (
                  <span>{fmtData(fatura.data_confirmacao)}</span>
                )}
              </div>

              <div style={{ height: 1, backgroundColor: 'var(--borda-suave)', margin: '4px 0' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px 8px', alignItems: 'center' }}>
                <span style={{ color: 'var(--texto-terciario)' }}>Conta Bancária:</span>
                {isAberta ? (
                  <select className="input-field" value={contaBancoId ?? ''} onChange={e => setContaBancoId(e.target.value ? Number(e.target.value) : null)} style={{ width: 220 }}>
                    <option value="">Selecione na baixa...</option>
                    {contas.map(c => <option key={c.id} value={c.id}>{c.mnemonico}</option>)}
                  </select>
                ) : (
                  <span>{fatura.conta_banco_desc ?? '—'}</span>
                )}

                {fatura.movimento_banco_id && (<>
                  <span style={{ color: 'var(--texto-terciario)' }}>Movimento Banco:</span> <span>#{fatura.movimento_banco_id}</span>
                </>)}
              </div>

              {isAberta && (
                <div style={{ marginTop: 2, padding: '8px 12px', borderRadius: 4, background: 'var(--bg-hover)', border: '1px solid var(--borda-suave)', fontSize: 11, color: 'var(--texto-secundario)', lineHeight: 1.5 }}>
                  Confira contra o extrato/depósito real da operadora: ajuste desconto (ex: tarifa) ou acréscimo se o valor cobrado for diferente do previsto, e escolha a conta bancária que recebeu o depósito. Ao confirmar, é gerado o lançamento de entrada nessa conta com o valor líquido calculado.
                </div>
              )}

              {(isAberta || isConfirmada) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button type="button" disabled={estornando} onClick={estornar}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)', fontWeight: 600, opacity: estornando ? 0.7 : 1 }}>
                    <Undo2 size={13} /> {estornando ? 'Estornando...' : isConfirmada ? 'Estornar Confirmação' : 'Estornar Fatura'}
                  </button>
                  {isAberta && (
                    <button type="button" disabled={confirmando || !contaBancoId} onClick={confirmar}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', backgroundColor: 'var(--cor-sucesso)', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: '#fff', fontWeight: 600, opacity: (confirmando || !contaBancoId) ? 0.7 : 1 }}>
                      <CheckCircle size={13} /> {confirmando ? 'Confirmando...' : 'Confirmar Recebimento'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </fieldset>
        </div>

        <div style={{ flex: 1 }}>
          <fieldset className="form-fieldset" style={{ fontSize: 12 }}>
            <legend>
              <Receipt size={12} /> Parcelas Incluídas
            </legend>
            <div style={{ paddingTop: 6 }}>
              <div className="card">
                <div className="table-wrapper">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>Venda</th>
                        <th style={{ width: 60 }}>Parc.</th>
                        <th style={{ width: 130 }}>NSU</th>
                        <th style={{ width: 100 }}>Emissão</th>
                        <th style={{ width: 100 }}>Previsão</th>
                        <th style={{ textAlign: 'right' }}>Bruto</th>
                        <th style={{ textAlign: 'right' }}>Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(fatura.parcelas ?? []).map(p => (
                        <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/financeiro/cartao-vendas/${p.venda_cartao_id}`)}>
                          <td style={{ fontFamily: 'var(--fonte-mono)', color: 'var(--cor-primaria)' }}>#{p.venda_cartao_id}</td>
                          <td style={{ fontFamily: 'var(--fonte-mono)' }}>{p.numero_parcela}</td>
                          <td style={{ fontFamily: 'var(--fonte-mono)', fontSize: 11, color: 'var(--texto-secundario)' }}>{p.nsu ?? '—'}</td>
                          <td style={{ fontFamily: 'var(--fonte-mono)', fontSize: 12, color: 'var(--texto-secundario)' }}>{fmtData(p.data_venda)}</td>
                          <td style={{ fontFamily: 'var(--fonte-mono)', fontSize: 12, color: 'var(--texto-secundario)' }}>{fmtData(p.data_prevista)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)' }}>{fmtValor(p.valor)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--fonte-mono)', fontWeight: 600 }}>{fmtValor(p.valor_liquido)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  )
}
