'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Percent } from 'lucide-react'
import type { TaxaCartaoListItem } from '@/types/cartao.types'
import { Row } from '@/components/cadastro/CondicaoPagamentoFormPage'

interface Props { condicaoPagamentoId?: number }

type FormState = {
  percentual_mdr:            string
  percentual_antecipacao_am: string
  prazo_recebimento_dias:    string
  parcelas_de:               string
  parcelas_ate:              string
}

const FORM_VAZIO: FormState = {
  percentual_mdr: '', percentual_antecipacao_am: '0', prazo_recebimento_dias: '30',
  parcelas_de: '1', parcelas_ate: '99',
}

const inputStyle = {
  width: 100, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
  border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none',
} as React.CSSProperties

export default function TaxaCartaoInline({ condicaoPagamentoId }: Props) {
  // Só existe uma taxa por condição de pagamento — taxaId é o registro
  // carregado (se já existir); os campos abaixo já vêm preenchidos com
  // ela, sem precisar de nenhum clique de "editar" separado.
  const [taxaId,  setTaxaId]  = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [form,    setForm]    = useState<FormState>(FORM_VAZIO)
  const [saving,  setSaving]  = useState(false)
  const [erro,    setErro]    = useState('')

  const carregar = useCallback(() => {
    if (!condicaoPagamentoId) return
    setLoading(true)
    fetch(`/api/financeiro/cartao/taxas?condicao_pagamento_id=${condicaoPagamentoId}&limit=1`)
      .then(r => r.json())
      .then(d => {
        const t: TaxaCartaoListItem | undefined = d.dados?.[0]
        if (t) {
          setTaxaId(t.id)
          setForm({
            percentual_mdr:            String(Number(t.percentual_mdr)),
            percentual_antecipacao_am: String(Number(t.percentual_antecipacao_am)),
            prazo_recebimento_dias:    String(t.prazo_recebimento_dias),
            parcelas_de:               String(t.parcelas_de ?? 1),
            parcelas_ate:              String(t.parcelas_ate ?? 99),
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [condicaoPagamentoId])

  useEffect(() => { carregar() }, [carregar])

  async function salvar() {
    if (!condicaoPagamentoId) return
    const mdr = Number(form.percentual_mdr)
    if (!form.percentual_mdr || Number.isNaN(mdr) || mdr < 0 || mdr > 100) { setErro('MDR inválido'); return }
    const parcelasDe  = parseInt(form.parcelas_de, 10) || 1
    const parcelasAte = parseInt(form.parcelas_ate, 10) || 1
    if (parcelasAte < parcelasDe) { setErro('Parcelas "até" deve ser >= "de"'); return }

    const payload = {
      condicao_pagamento_id:     condicaoPagamentoId,
      percentual_mdr:            mdr,
      percentual_antecipacao_am: Number(form.percentual_antecipacao_am) || 0,
      prazo_recebimento_dias:    parseInt(form.prazo_recebimento_dias, 10) || 0,
      parcelas_de:               parcelasDe,
      parcelas_ate:              parcelasAte,
    }

    setSaving(true)
    setErro('')
    try {
      const url    = taxaId ? `/api/financeiro/cartao/taxas/${taxaId}` : '/api/financeiro/cartao/taxas'
      const method = taxaId ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json   = await res.json()
      if (!res.ok) { setErro(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar'); return }
      toast.success('Taxa atualizada!')
      if (!taxaId) setTaxaId(json.id)
    } finally { setSaving(false) }
  }

  return (
    <fieldset className="form-fieldset">
      <legend>
        <Percent size={12} /> Taxa de Cartão (MDR)
      </legend>

      {!condicaoPagamentoId && (
        <div style={{ fontSize: 12, color: 'var(--texto-terciario)', padding: '6px 0' }}>
          Salve a condição de pagamento primeiro para poder cadastrar a taxa.
        </div>
      )}

      {condicaoPagamentoId && (
        <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>Carregando...</div>}

          <Row label="MDR (%):*">
            <input type="number" min={0} max={100} step={0.0001} value={form.percentual_mdr}
              onChange={e => setForm(f => ({ ...f, percentual_mdr: e.target.value }))} style={inputStyle} />
          </Row>

          <Row label="Antecipação (%a.m.):">
            <input type="number" min={0} max={100} step={0.0001} value={form.percentual_antecipacao_am}
              onChange={e => setForm(f => ({ ...f, percentual_antecipacao_am: e.target.value }))} style={inputStyle} />
          </Row>

          <Row label="Prazo Receb. (dias):*">
            <input type="number" min={0} value={form.prazo_recebimento_dias}
              onChange={e => setForm(f => ({ ...f, prazo_recebimento_dias: e.target.value }))} style={inputStyle} />
          </Row>

          <Row label="Parcelas De/Até:*">
            <input type="number" min={1} value={form.parcelas_de}
              onChange={e => setForm(f => ({ ...f, parcelas_de: e.target.value }))} style={{ ...inputStyle, width: 70 }} />
            <span style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>a</span>
            <input type="number" min={1} value={form.parcelas_ate}
              onChange={e => setForm(f => ({ ...f, parcelas_ate: e.target.value }))} style={{ ...inputStyle, width: 70 }} />
          </Row>

          {erro && (
            <Row label=""><span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{erro}</span></Row>
          )}

          <Row label="">
            <button type="button" onClick={salvar} disabled={saving}
              style={{ padding: '5px 14px', background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 3, fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Salvando...' : 'Atualizar Taxa'}
            </button>
          </Row>
        </div>
      )}
    </fieldset>
  )
}
