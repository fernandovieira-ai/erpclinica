'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle, Undo2 } from 'lucide-react'
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
  const [valorCobrado, setValorCobrado] = useState<number>(Number(fatura.valor_cobrado ?? fatura.valor_previsto))

  const diferenca    = valorCobrado - Number(fatura.valor_previsto)
  const isAberta      = fatura.status === 'ABERTA'
  const isConfirmada  = fatura.status === 'CONFIRMADA'

  async function confirmar() {
    if (!confirm('Confirmar recebimento desta fatura? Isso vai gerar o lançamento na conta bancária.')) return
    setConfirmando(true)
    try {
      const res  = await fetch(`/api/financeiro/cartao/faturas/${fatura.id}/confirmar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor_cobrado: valorCobrado }),
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
        {(isAberta || isConfirmada) && (
          <button type="button" disabled={estornando} onClick={estornar}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', background: 'none', border: '1px solid var(--cor-erro)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--cor-erro)', fontWeight: 600, opacity: estornando ? 0.7 : 1 }}>
            <Undo2 size={13} /> {estornando ? 'Estornando...' : isConfirmada ? 'Estornar Confirmação' : 'Estornar Fatura'}
          </button>
        )}
        {isAberta && (
          <button type="button" disabled={confirmando} onClick={confirmar}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', backgroundColor: 'var(--cor-sucesso)', border: 'none', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: '#fff', fontWeight: 600, opacity: confirmando ? 0.7 : 1 }}>
            <CheckCircle size={13} /> {confirmando ? 'Confirmando...' : 'Confirmar Recebimento'}
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', gap: 20 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 420, fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '6px 8px', alignItems: 'center' }}>
            <span style={{ color: 'var(--texto-terciario)' }}>Conta Bancária:</span>  <span>{fatura.conta_banco_desc}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Adquirente:</span>      <span>{fatura.adquirente}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Data Prevista:</span>   <span>{fmtData(fatura.data_prevista)}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Qtd. Parcelas:</span>   <span>{fatura.qtd_parcelas}</span>
            <span style={{ color: 'var(--texto-terciario)' }}>Valor Previsto:</span>  <span style={{ fontWeight: 600, fontFamily: 'var(--fonte-mono)' }}>{fmtValor(fatura.valor_previsto)}</span>

            <span style={{ color: 'var(--texto-terciario)' }}>Valor Cobrado:</span>
            {isAberta ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MoneyInput value={valorCobrado} onValue={setValorCobrado} style={{ width: 140 }} />
                {diferenca !== 0 && (
                  <span style={{ fontSize: 11, color: diferenca < 0 ? 'var(--cor-erro)' : 'var(--cor-sucesso)' }}>
                    {diferenca > 0 ? '+' : ''}{fmtValor(diferenca)} vs. previsto
                  </span>
                )}
              </div>
            ) : (
              <span style={{ fontWeight: 600, fontFamily: 'var(--fonte-mono)' }}>{fmtValor(fatura.valor_cobrado)}</span>
            )}

            {fatura.data_confirmacao && (<>
              <span style={{ color: 'var(--texto-terciario)' }}>Confirmada em:</span> <span>{fmtData(fatura.data_confirmacao)}</span>
            </>)}
            {fatura.movimento_banco_id && (<>
              <span style={{ color: 'var(--texto-terciario)' }}>Movimento Banco:</span> <span>#{fatura.movimento_banco_id}</span>
            </>)}
          </div>

          {isAberta && (
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 4, background: 'var(--bg-hover)', border: '1px solid var(--borda-suave)', fontSize: 11, color: 'var(--texto-secundario)', lineHeight: 1.5 }}>
              Confira o valor cobrado contra o extrato/depósito real da operadora antes de confirmar. Ao confirmar, é gerado o lançamento de entrada na conta bancária com esse valor.
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--texto-terciario)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Parcelas Incluídas</div>
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
      </div>
    </div>
  )
}
