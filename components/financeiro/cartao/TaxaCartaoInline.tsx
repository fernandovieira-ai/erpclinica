'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'
import { Percent, Plus, Trash2 } from 'lucide-react'
import type { TaxaCartaoListItem } from '@/types/cartao.types'

interface Props { condicaoPagamentoId?: number }

export interface TaxaCartaoInlineHandle {
  // Retorna null se salvou com sucesso, ou a mensagem de erro caso contrário.
  salvar: (condicaoPagamentoId: number) => Promise<string | null>
}

type FaixaForm = {
  // id nulo = faixa nova, ainda não gravada
  id:                        number | null
  percentual_mdr:            string
  percentual_antecipacao_am: string
  prazo_recebimento_dias:    string
  parcelas_de:               string
  parcelas_ate:              string
}

function faixaVazia(): FaixaForm {
  return { id: null, percentual_mdr: '', percentual_antecipacao_am: '0', prazo_recebimento_dias: '30', parcelas_de: '1', parcelas_ate: '99' }
}

const inputStyle = {
  width: 80, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
  border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, outline: 'none',
} as React.CSSProperties

// Cada condição de pagamento pode ter várias faixas de parcelas (ex: 1-3x
// com um MDR, 4-6x com outro) — cada faixa tem seu próprio MDR base (o
// desconto da 1ª parcela) e sua própria taxa de antecipação mensal (o
// desconto adicional, composto, que cada parcela seguinte carrega — ver
// fn_trg_venda_cartao_parcelas, novos/78_taxa_cartao_antecipacao_composta.sql).
const TaxaCartaoInline = forwardRef<TaxaCartaoInlineHandle, Props>(function TaxaCartaoInline(
  { condicaoPagamentoId }, ref,
) {
  const [faixas,     setFaixas]     = useState<FaixaForm[]>([])
  const [removidas,  setRemovidas]  = useState<number[]>([])
  const [loading,    setLoading]    = useState(false)
  const [erro,       setErro]       = useState('')

  const carregar = useCallback(() => {
    if (!condicaoPagamentoId) return
    setLoading(true)
    fetch(`/api/financeiro/cartao/taxas?condicao_pagamento_id=${condicaoPagamentoId}&limit=50`)
      .then(r => r.json())
      .then(d => {
        const lista: TaxaCartaoListItem[] = d.dados ?? []
        setFaixas(lista.length
          ? lista.map(t => ({
              id:                        t.id,
              percentual_mdr:            String(Number(t.percentual_mdr)),
              percentual_antecipacao_am: String(Number(t.percentual_antecipacao_am)),
              prazo_recebimento_dias:    String(t.prazo_recebimento_dias),
              parcelas_de:               String(t.parcelas_de ?? 1),
              parcelas_ate:              String(t.parcelas_ate ?? 99),
            }))
          : [faixaVazia()])
        setRemovidas([])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [condicaoPagamentoId])

  useEffect(() => { carregar() }, [carregar])

  function atualizarFaixa(idx: number, campo: keyof FaixaForm, valor: string) {
    setFaixas(fs => fs.map((f, i) => i === idx ? { ...f, [campo]: valor } : f))
  }

  function adicionarFaixa() {
    setFaixas(fs => [...fs, faixaVazia()])
  }

  function removerFaixa(idx: number) {
    const alvoId = faixas[idx]?.id
    if (alvoId != null) setRemovidas(r => [...r, alvoId])
    setFaixas(fs => {
      const resto = fs.filter((_, i) => i !== idx)
      return resto.length ? resto : [faixaVazia()]
    })
  }

  // Exposto pro formulário pai (CondicaoPagamentoFormPage) — o botão "Salvar"
  // do topo grava condição + todas as faixas de taxa numa ação só.
  useImperativeHandle(ref, () => ({
    async salvar(condId: number) {
      setErro('')

      const parsed = faixas.map(f => ({
        ...f,
        mdr:   Number(f.percentual_mdr),
        de:    parseInt(f.parcelas_de, 10) || 1,
        ate:   parseInt(f.parcelas_ate, 10) || 1,
        prazo: parseInt(f.prazo_recebimento_dias, 10) || 0,
        antecip: Number(f.percentual_antecipacao_am) || 0,
      }))

      for (const f of parsed) {
        if (!f.percentual_mdr || Number.isNaN(f.mdr) || f.mdr < 0 || f.mdr > 100) {
          const msg = `MDR inválido na faixa ${f.de}-${f.ate}x`
          setErro(msg)
          return msg
        }
        if (f.ate < f.de) {
          const msg = `Faixa ${f.de}-${f.ate}x: "até" deve ser >= "de"`
          setErro(msg)
          return msg
        }
      }

      // overlap entre faixas (além da sobreposição exata, que o upsert do
      // backend já trata) — faixas parcialmente sobrepostas mascaram qual
      // MDR vale, então bloqueia aqui antes de salvar.
      const ordenadas = [...parsed].sort((a, b) => a.de - b.de)
      for (let i = 1; i < ordenadas.length; i++) {
        if (ordenadas[i].de <= ordenadas[i - 1].ate) {
          const msg = `Faixas de parcelas se sobrepõem: ${ordenadas[i - 1].de}-${ordenadas[i - 1].ate}x e ${ordenadas[i].de}-${ordenadas[i].ate}x`
          setErro(msg)
          return msg
        }
      }

      try {
        for (const removidoId of removidas) {
          const resDel = await fetch(`/api/financeiro/cartao/taxas/${removidoId}`, { method: 'DELETE' })
          if (!resDel.ok) {
            const msg = `Erro ao remover faixa (id ${removidoId}) — tente salvar de novo`
            setErro(msg)
            return msg
          }
        }

        const novosIds: (number | null)[] = []
        for (const f of parsed) {
          const payload = {
            condicao_pagamento_id:     condId,
            percentual_mdr:            f.mdr,
            percentual_antecipacao_am: f.antecip,
            prazo_recebimento_dias:    f.prazo,
            parcelas_de:               f.de,
            parcelas_ate:              f.ate,
          }
          const url    = f.id ? `/api/financeiro/cartao/taxas/${f.id}` : '/api/financeiro/cartao/taxas'
          const method = f.id ? 'PATCH' : 'POST'
          const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
          const json   = await res.json()
          if (!res.ok) {
            const msg = json.erro?.formErrors?.[0] ?? json.erro ?? `Erro ao salvar faixa ${f.de}-${f.ate}x`
            setErro(msg)
            return msg
          }
          novosIds.push(f.id ?? json.id ?? null)
        }

        setFaixas(fs => fs.map((f, i) => f.id ? f : { ...f, id: novosIds[i] }))
        setRemovidas([])
        return null
      } catch {
        const msg = 'Erro ao salvar taxa de cartão'
        setErro(msg)
        return msg
      }
    },
  }), [faixas, removidas])

  return (
    <fieldset className="form-fieldset">
      <legend>
        <Percent size={12} /> Taxa de Cartão (MDR por faixa de parcelas)
      </legend>

      <div style={{ paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>Carregando...</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '60px 70px 85px 85px 70px 28px', gap: 4, fontSize: 11, color: 'var(--texto-terciario)' }}>
          <span>Parc. De</span><span>Parc. Até</span><span>MDR (%)</span><span>Antecip. (%a.m.)</span><span>Prazo (d)</span><span />
        </div>

        {faixas.map((f, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '60px 70px 85px 85px 70px 28px', gap: 4, alignItems: 'center' }}>
            <input type="number" min={1} value={f.parcelas_de}
              onChange={e => atualizarFaixa(idx, 'parcelas_de', e.target.value)} style={{ ...inputStyle, width: 55 }} />
            <input type="number" min={1} value={f.parcelas_ate}
              onChange={e => atualizarFaixa(idx, 'parcelas_ate', e.target.value)} style={{ ...inputStyle, width: 65 }} />
            <input type="number" min={0} max={100} step={0.0001} value={f.percentual_mdr}
              onChange={e => atualizarFaixa(idx, 'percentual_mdr', e.target.value)} style={{ ...inputStyle, width: 80 }} />
            <input type="number" min={0} max={100} step={0.0001} value={f.percentual_antecipacao_am}
              onChange={e => atualizarFaixa(idx, 'percentual_antecipacao_am', e.target.value)} style={{ ...inputStyle, width: 80 }} />
            <input type="number" min={0} value={f.prazo_recebimento_dias}
              onChange={e => atualizarFaixa(idx, 'prazo_recebimento_dias', e.target.value)} style={{ ...inputStyle, width: 65 }} />
            <button type="button" onClick={() => removerFaixa(idx)} title="Remover faixa"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, background: 'none', border: '1px solid var(--borda-media)', borderRadius: 3, cursor: 'pointer', color: 'var(--cor-erro)' }}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}

        <button type="button" onClick={adicionarFaixa}
          style={{ display: 'flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start', padding: '3px 8px', background: 'none', border: '1px solid var(--cor-primaria)', borderRadius: 3, fontSize: 11, cursor: 'pointer', color: 'var(--cor-primaria)' }}>
          <Plus size={11} /> Adicionar faixa
        </button>

        {erro && (
          <span style={{ fontSize: 11, color: 'var(--cor-erro)' }}>{erro}</span>
        )}

        <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>
          MDR é o desconto da 1ª parcela. A antecipação mensal é aplicada de forma composta a cada parcela seguinte (parcela N = MDR × antecipação^(N-1)).
          Salvo junto com a condição de pagamento — use o botão &quot;Salvar&quot; no topo da tela.
        </div>
      </div>
    </fieldset>
  )
})

export default TaxaCartaoInline
