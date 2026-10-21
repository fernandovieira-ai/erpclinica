'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { X, Copy, CalendarClock } from 'lucide-react'
import MoneyInput from '@/components/ui/MoneyInput'

// Subconjunto de campos da despesa necessário pro modal — permite reaproveitar
// tanto a partir do formulário completo (Despesa) quanto do grid de listagem
// (que busca esses dados sob demanda antes de abrir o modal).
export interface DespesaReplicavel {
  id:                 number
  data_despesa:       string
  valor:              string
  documento:          string | null
  observacao:         string | null
  destino:            'C' | 'B' | null
  tipo_despesa_desc:  string | null
  pessoa_nome:        string | null
  conta_banco_desc:   string | null
}

// Soma meses a uma data (YYYY-MM-DD) preservando o dia, com clamp no último dia
// do mês de destino (ex.: 31/01 + 1 mês -> 28 ou 29/02).
function addMesesClamp(dataISO: string, meses: number): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const base = new Date(ano, mes - 1 + meses, 1)
  const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  base.setDate(Math.min(dia, ultimoDia))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`
}

export default function ReplicarDespesaModal({ despesa, onClose, onReplicado }: {
  despesa:     DespesaReplicavel
  onClose:     () => void
  onReplicado: (novaId: number) => void
}) {
  const [data,       setData]       = useState(() => addMesesClamp(despesa.data_despesa, 1))
  const [valor,      setValor]      = useState(() => parseFloat(despesa.valor) || 0)
  const [documento,  setDocumento]  = useState(despesa.documento ?? '')
  const [observacao, setObservacao] = useState(despesa.observacao ?? '')
  const [enviando,   setEnviando]   = useState(false)

  async function confirmar() {
    if (!data) { toast.error('Informe a data da réplica.'); return }
    if (!valor || valor <= 0) { toast.error('Informe um valor válido.'); return }
    setEnviando(true)
    try {
      const res = await fetch(`/api/financeiro/despesas/${despesa.id}/replicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_despesa: data, valor, documento: documento || null, observacao: observacao || null }),
      })
      const json = await res.json()
      if (!res.ok) {
        const flat = json.erro?.formErrors?.[0]
          ?? (json.erro?.fieldErrors ? Object.values(json.erro.fieldErrors).flat()[0] : undefined)
          ?? (typeof json.erro === 'string' ? json.erro : undefined)
          ?? 'Erro ao replicar'
        toast.error(String(flat))
        return
      }
      toast.success(`Despesa replicada! Nova despesa #${json.id} criada e aprovada.`)
      onReplicado(json.id)
    } catch {
      toast.error('Erro ao replicar — verifique sua conexão e tente novamente.')
    } finally { setEnviando(false) }
  }

  const destinoLabel = despesa.destino === 'B' ? `Banco${despesa.conta_banco_desc ? ` (${despesa.conta_banco_desc})` : ''}` : 'Caixa'
  const inStyle: React.CSSProperties = { width: '100%', padding: '5px 8px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--borda-media)', borderRadius: 6, width: 420, display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--borda-suave)' }}>
          <CalendarClock size={15} style={{ color: 'var(--cor-primaria)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--texto-principal)' }}>Replicar Despesa #{despesa.id}</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', display: 'flex', padding: 2 }}><X size={16} /></button>
        </div>

        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--texto-secundario)' }}>
            Cria uma nova despesa a partir desta ({despesa.tipo_despesa_desc}, {despesa.pessoa_nome}, pagamento em {destinoLabel}), com outra data.
          </p>

          <div>
            <label style={{ fontSize: 12, color: 'var(--texto-secundario)', display: 'block', marginBottom: 3 }}>Nova Data (emissão = pagamento):*</label>
            <input type="date" autoFocus value={data} onChange={e => setData(e.target.value)} style={inStyle} />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--texto-secundario)', display: 'block', marginBottom: 3 }}>Valor:*</label>
            <MoneyInput value={valor} onValue={setValor} style={{ width: '100%', padding: '5px 8px' }} />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--texto-secundario)', display: 'block', marginBottom: 3 }}>Documento:</label>
            <input value={documento} onChange={e => setDocumento(e.target.value)} maxLength={50} style={{ ...inStyle, textTransform: 'uppercase' }} />
          </div>

          <div>
            <label style={{ fontSize: 12, color: 'var(--texto-secundario)', display: 'block', marginBottom: 3 }}>Observação:</label>
            <textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} style={{ ...inStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--borda-suave)' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '5px 12px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={enviando}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', backgroundColor: 'var(--cor-primaria)', border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#fff', opacity: enviando ? 0.7 : 1 }}>
            <Copy size={13} /> {enviando ? 'Replicando...' : 'Confirmar Réplica'}
          </button>
        </div>
      </div>
    </div>
  )
}
