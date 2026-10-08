'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { X, DollarSign, CreditCard, Percent, Check, Plus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { AgendamentoListItem } from '@/types/clinica.types'

interface Props {
  open: boolean
  onClose: () => void
  agendamento: AgendamentoListItem | null
  agendamentos?: AgendamentoListItem[]
  onRecebimentoSalvo?: () => Promise<void>
}

interface CondicaoPagamento {
  id: number
  descricao: string
  tipo: string
  tipo_pagamento: string
  num_parcelas: number
  intervalo_dias: number
}

// Uma linha por forma de pagamento já adicionada ao recebimento — pagamento misto (ex.:
// metade dinheiro, metade cartão) é só adicionar mais de uma. O caso comum (forma única)
// é adicionar 1 vez só, com o valor cheio.
interface FormaPagamentoLinha {
  condicao_pagamento_id: number
  valor: number
  nsu: string
  parcelas_cartao: number
}

interface FormRecebimento {
  desconto: number
  acrescimo: number
  observacao: string
}

function round2(v: number) {
  return Math.round(v * 100) / 100
}

interface ProfissionalOpcao {
  id: number
  nome: string
  eh_clinica?: boolean
}

interface ExecutorDef {
  medico_solicitante_id: number
  medico_executor_id: number
}

function fmtValor(v: number) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--texto-terciario)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
      {children}
    </div>
  )
}

function Field({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', ...style }}>{children}</div>
}

export default function RecebimentoModal({ open, onClose, agendamento, agendamentos, onRecebimentoSalvo }: Props) {
  const [saving, setSaving] = useState(false)
  const [condicoes, setCondicoes] = useState<CondicaoPagamento[]>([])
  const [loadingCondicoes, setLoadingCondicoes] = useState(false)
  const [profissionais, setProfissionais] = useState<ProfissionalOpcao[]>([])
  const [executores, setExecutores] = useState<Record<number, Partial<ExecutorDef>>>({})
  // Parâmetro por empresa (novos/67_recebimento_valor_digitado.sql): quando ativo, some o
  // desconto/acréscimo manual — o operador digita o valor que cada forma recebeu de fato e
  // o desconto/acréscimo necessário pra fechar com o valor de tabela é calculado sozinho.
  const [modoValorDigitado, setModoValorDigitado] = useState(false)
  // Parâmetro por empresa (novos/70_recebimento_valor_atendimento_editavel.sql): quando
  // ativo, o valor de cada atendimento (topo do modal) deixa de ser travado no preço de
  // tabela — vira um input editável, com o preço de tabela só como valor inicial sugerido.
  const [permiteEditarValorAtendimento, setPermiteEditarValorAtendimento] = useState(false)
  // agendamento_id -> valor editado manualmente (só usado quando permiteEditarValorAtendimento
  // está ativo). Ausência de entrada = usa o preço de tabela (getValorBase).
  const [valoresEditados, setValoresEditados] = useState<Record<number, number>>({})

  const [form, setForm] = useState<FormRecebimento>({
    desconto: 0,
    acrescimo: 0,
    observacao: '',
  })
  // Formas já adicionadas (lista que será enviada pro backend) + a forma em edição
  // (select + valor + botão "Adicionar", ainda não incluída na lista).
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamentoLinha[]>([])
  const [novaForma, setNovaForma] = useState<FormaPagamentoLinha>({ condicao_pagamento_id: 0, valor: 0, nsu: '', parcelas_cartao: 1 })

  const listaAgs = (agendamentos && agendamentos.length > 0) ? agendamentos : (agendamento ? [agendamento] : [])
  // Médico Solicitante é sempre uma pessoa física — a clínica (placeholder eh_clinica) fica
  // de fora. Médico Executor aceita a clínica também: alguns exames (ex.: feitos por
  // aparelho/equipe, sem um médico específico atribuído) são executados "pela clínica".
  const profissionaisSolicitante = profissionais.filter(p => !p.eh_clinica)
  // A primeira forma JÁ ADICIONADA decide o preço de tabela (à vista x a prazo) — mesma
  // condição que o backend usa como referência (ver app/api/clinica/recebimentos/route.ts).
  // Antes de adicionar a primeira forma, usa a condição em edição (novaForma) como prévia —
  // depois disso, fica travada no que já foi adicionado, pra trocar a forma seguinte (ex.:
  // escolher o cartão da 2ª parcela) não mudar retroativamente o preço/total já alocado.
  const condicaoPrimeira = condicoes.find(c => c.id === (formasPagamento[0]?.condicao_pagamento_id ?? novaForma.condicao_pagamento_id))
  // Condição atualmente selecionada na linha "forma em edição" — usada só pros campos
  // condicionais dela (PIX/parcelas/NSU), que precisam refletir a escolha atual mesmo depois
  // que condicaoPrimeira já travou no preço da 1ª forma adicionada.
  const condicaoNovaForma = condicoes.find(c => c.id === novaForma.condicao_pagamento_id)

  function getValorBase(ag: AgendamentoListItem): number {
    const isPrazo = condicaoPrimeira?.tipo === 'P'
    const valorVista = Number(ag.tipo_valor) || 0
    const valorPrazo = ag.tipo_valor_prazo != null ? Number(ag.tipo_valor_prazo) : null
    return isPrazo && valorPrazo !== null ? valorPrazo : valorVista
  }

  // Valor efetivamente usado no cálculo (base de desconto/acréscimo e enviado como
  // valor_original) — o editado manualmente, quando o parâmetro está ativo, senão o preço
  // de tabela de sempre.
  function getValorEfetivo(ag: AgendamentoListItem): number {
    if (permiteEditarValorAtendimento && valoresEditados[ag.id] != null) return valoresEditados[ag.id]
    return getValorBase(ag)
  }

  useEffect(() => {
    if (open) {
      carregarCondicoesPagamento()
      carregarProfissionais()
    } else {
      setExecutores({})
    }
  }, [open])

  // Buscado uma vez já no mount (não preso ao `open`) — o componente fica montado desde o
  // carregamento da página/modal pai, bem antes do usuário clicar pra abrir o recebimento
  // em si. Carregar isso só dentro do `if (open)` acima fazia o modal nascer sempre no
  // layout normal (Desconto/Acréscimo visíveis) e só trocar pro layout de valor digitado
  // depois que a resposta chegava — um "pulo" de tela visível toda vez que abria. Buscando
  // cedo, a resposta já chegou muito antes do clique (reação humana é bem mais lenta que
  // essa chamada), então o modal já abre direto no layout certo.
  useEffect(() => {
    carregarParametrosRecebimento()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregarProfissionais() {
    try {
      const res = await fetch('/api/clinica/profissionais')
      if (!res.ok) return
      const data = await res.json()
      setProfissionais(data.dados ?? [])
    } catch (error) {
      console.error('Erro ao carregar profissionais:', error)
    }
  }

  async function carregarParametrosRecebimento() {
    try {
      const res = await fetch('/api/clinica/recebimentos/parametros')
      if (!res.ok) return
      const data = await res.json()
      setModoValorDigitado(!!data.recebimento_permite_valor_digitado)
      setPermiteEditarValorAtendimento(!!data.recebimento_permite_editar_valor_atendimento)
    } catch (error) {
      console.error('Erro ao carregar parâmetros de recebimento:', error)
    }
  }

  // Zera desconto/acréscimo ao abrir — o valor base (Valor da Consulta) não é mais um
  // campo de formulário: é sempre derivado de getValorBase(ag), travado no preço de
  // tabela do tipo/categoria. Ver "Trava de valor no recebimento" em padroes.md — foi
  // esse campo antes editável que permitiu registrar R$500 num TCP de R$800 sem desconto.
  useEffect(() => {
    if (!open) return
    setForm(prev => ({ ...prev, desconto: 0, acrescimo: 0, observacao: '' }))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Zera desconto/acréscimo quando muda a condição de referência (à vista vs a prazo têm
  // valores de tabela diferentes — um desconto calculado sobre o valor errado confundiria).
  // Também zera valoresEditados pelo mesmo motivo: um valor editado manualmente na condição
  // anterior (ex.: à vista) não faz sentido carregar pra outra condição de referência (ex.:
  // a prazo, com preço de tabela diferente) sem o operador revisar.
  useEffect(() => {
    if (!open || condicoes.length === 0 || !condicaoPrimeira) return
    setForm(prev => ({ ...prev, desconto: 0, acrescimo: 0 }))
    setValoresEditados({})
  }, [condicaoPrimeira?.id, condicoes, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reabre do zero a cada abertura — a lista de formas já adicionadas é específica de cada
  // recebimento, não pode vazar de uma abertura do modal pra outra.
  useEffect(() => {
    if (!open) return
    setFormasPagamento([])
    setValoresEditados({})
  }, [open])

  const valorBase = listaAgs.reduce((acc, ag) => acc + getValorEfetivo(ag), 0)
  const somaFormas = round2(formasPagamento.reduce((acc, f) => acc + (Number(f.valor) || 0), 0))

  // Modo valor digitado: desconto/acréscimo deixam de ser campos digitados e passam a ser a
  // diferença entre o valor de tabela e o que foi efetivamente somado nas formas de
  // pagamento — positivo (pagou menos) vira desconto automático, negativo (pagou mais) vira
  // acréscimo automático. Ver parâmetro recebimento_permite_valor_digitado.
  const diffValorDigitado = round2(valorBase - somaFormas)
  const descontoAutomatico = Math.max(0, diffValorDigitado)
  const acrescimoAutomatico = Math.max(0, -diffValorDigitado)
  // Valores efetivamente usados no cálculo/payload — vêm do form (modo normal) ou são
  // derivados automaticamente (modo valor digitado).
  const descontoEfetivo = modoValorDigitado ? descontoAutomatico : form.desconto
  const acrescimoEfetivo = modoValorDigitado ? acrescimoAutomatico : form.acrescimo

  const totalComAjustes = modoValorDigitado
    ? (formasPagamento.length > 0 ? somaFormas : valorBase)
    : (valorBase - form.desconto + form.acrescimo)
  const restanteAlocar = round2(totalComAjustes - somaFormas)
  const formasBatem = modoValorDigitado ? formasPagamento.length > 0 : Math.abs(restanteAlocar) <= 0.01

  // O valor sugerido da próxima forma a adicionar é sempre o que falta alocar — assim, no
  // caso comum (1 forma só), já vem preenchido com o total e basta clicar "Adicionar". No
  // modo valor digitado, a sugestão é sempre "o que falta pro valor de tabela cheio" — o
  // operador edita pra baixo (desconto) ou deixa em branco/zero (cortesia).
  useEffect(() => {
    setNovaForma(prev => {
      const sugestao = modoValorDigitado
        ? round2(Math.max(0, valorBase - somaFormas))
        : round2(Math.max(0, restanteAlocar))
      if (prev.valor === sugestao) return prev
      return { ...prev, valor: sugestao }
    })
  }, [restanteAlocar, modoValorDigitado, valorBase, somaFormas]) // eslint-disable-line react-hooks/exhaustive-deps

  async function carregarCondicoesPagamento() {
    setLoadingCondicoes(true)
    try {
      const res = await fetch('/api/cadastro/condicoes-pagamento?ativo=true')
      if (!res.ok) return
      const data = await res.json()
      setCondicoes(data.dados ?? [])
      if (data.dados?.length > 0) {
        setNovaForma(prev => ({ ...prev, condicao_pagamento_id: data.dados[0].id }))
      }
    } catch (error) {
      console.error('Erro ao carregar condições:', error)
    } finally {
      setLoadingCondicoes(false)
    }
  }

  function adicionarForma() {
    if (!novaForma.condicao_pagamento_id) {
      toast.error('Selecione a condição de pagamento')
      return
    }
    // Modo valor digitado: valor R$ 0,00 só é aceito como a ÚNICA forma do recebimento
    // (cortesia 100%) — e só numa condição à vista (dinheiro/PIX), igual a trava do backend.
    const permiteZero = modoValorDigitado && formasPagamento.length === 0
    if (novaForma.valor == null || novaForma.valor < 0 || (!permiteZero && novaForma.valor === 0)) {
      toast.error(permiteZero ? 'Informe o valor pago (pode ser R$ 0,00 para cortesia)' : 'Informe um valor a receber maior que zero')
      return
    }
    if (permiteZero && novaForma.valor === 0) {
      const cond = condicoes.find(c => c.id === novaForma.condicao_pagamento_id)
      const ehCartaoOuPrazo = cond?.tipo_pagamento === 'debito' || cond?.tipo_pagamento === 'credito' || cond?.tipo_pagamento === 'a_prazo'
      if (ehCartaoOuPrazo) {
        toast.error('Cortesia total (R$ 0,00) exige uma condição à vista em dinheiro ou PIX')
        return
      }
    }
    setFormasPagamento(prev => [...prev, { ...novaForma }])
  }

  function removerForma(idx: number) {
    setFormasPagamento(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSalvar() {
    if (listaAgs.length === 0) return

    if (valorBase < 0) {
      toast.error('Valor da consulta inválido — verifique o cadastro do tipo de atendimento')
      return
    }

    if (modoValorDigitado) {
      // Modo valor digitado: o "total" é definido pelo que foi somado nas formas de
      // pagamento (desconto/acréscimo são consequência, não causa) — por isso não existe
      // aqui a trava "desconto >= valor da consulta" do modo normal: cortesia 100% (soma
      // das formas = R$ 0,00) é uma escolha deliberada do operador.
      if (formasPagamento.length === 0) {
        toast.error('Adicione ao menos uma forma de pagamento (pode ser R$ 0,00 para cortesia)')
        return
      }
      if (somaFormas === 0) {
        if (formasPagamento.length > 1) {
          toast.error('Cortesia total (R$ 0,00) só pode ter uma forma de pagamento')
          return
        }
        const condicaoUnica = condicoes.find(c => c.id === formasPagamento[0].condicao_pagamento_id)
        const ehCartaoOuPrazoUnica = condicaoUnica?.tipo_pagamento === 'debito'
          || condicaoUnica?.tipo_pagamento === 'credito'
          || condicaoUnica?.tipo_pagamento === 'a_prazo'
        if (ehCartaoOuPrazoUnica) {
          toast.error('Cortesia total (R$ 0,00) exige uma condição à vista em dinheiro ou PIX')
          return
        }
      } else {
        const qtdAPrazoLivre = formasPagamento.filter(f => condicoes.find(c => c.id === f.condicao_pagamento_id)?.tipo_pagamento === 'a_prazo').length
        if (qtdAPrazoLivre > 1) {
          toast.error('Só é permitida uma forma de pagamento a prazo por recebimento')
          return
        }
      }
    } else {
      // valorBase === 0 é válido (ex.: RETORNO sem cobrança) — só bloqueia quando o
      // desconto reduz uma consulta que tinha valor de tabela pra zero ou menos.
      if (totalComAjustes < 0 || (valorBase > 0 && totalComAjustes <= 0)) {
        toast.error('Total a receber inválido — desconto não pode ser maior ou igual ao valor da consulta')
        return
      }

      const ehCartaoOuPrazoPrimeira = condicaoPrimeira?.tipo_pagamento === 'debito'
        || condicaoPrimeira?.tipo_pagamento === 'credito'
        || condicaoPrimeira?.tipo_pagamento === 'a_prazo'

      if (totalComAjustes === 0) {
        // Sem valor a cobrar: nada a adicionar, só a condição selecionada acima — ela sozinha
        // vira a única "forma" enviada (ver montagem do payload mais abaixo).
        if (!novaForma.condicao_pagamento_id) {
          toast.error('Selecione a condição de pagamento')
          return
        }
        if (ehCartaoOuPrazoPrimeira) {
          toast.error('Atendimento sem valor a cobrar (R$ 0,00) — selecione uma condição à vista em dinheiro ou PIX para confirmar')
          return
        }
      } else {
        if (formasPagamento.length === 0) {
          toast.error('Adicione ao menos uma forma de pagamento')
          return
        }
        if (!formasBatem) {
          toast.error(`A soma das formas de pagamento (${fmtValor(somaFormas)}) não bate com o total a receber (${fmtValor(totalComAjustes)})`)
          return
        }
        const qtdAPrazo = formasPagamento.filter(f => condicoes.find(c => c.id === f.condicao_pagamento_id)?.tipo_pagamento === 'a_prazo').length
        if (qtdAPrazo > 1) {
          toast.error('Só é permitida uma forma de pagamento a prazo por recebimento')
          return
        }
      }
    }

    for (const ag of listaAgs) {
      if (!ag.profissional_eh_clinica) continue
      const def = executores[ag.id]
      if (!def?.medico_solicitante_id || !def?.medico_executor_id) {
        toast.error(`Informe o médico solicitante e o médico executor do exame de ${ag.paciente_nome}`)
        return
      }
    }

    setSaving(true)
    try {
      // Monta os itens com desconto/acréscimo rateados proporcionalmente — um único
      // payload para todos os atendimentos. valor_original vem do preço de tabela
      // (getValorBase) — ou do valor editado manualmente (getValorEfetivo), só quando
      // recebimento_permite_editar_valor_atendimento está ativo; o backend confere o
      // preço de tabela a não ser que o mesmo parâmetro esteja ativo lá também.
      // O último item fica com o resto (mesmo padrão usado no rateio de parcelas a prazo
      // na API), pra soma dos itens bater exatamente com descontoEfetivo/acrescimoEfetivo
      // mesmo após arredondar cada item pra centavos. No modo valor digitado, esses dois
      // vêm calculados automaticamente (ver descontoAutomatico/acrescimoAutomatico acima).
      let descontoAcumulado = 0
      let acrescimoAcumulado = 0
      const itens = listaAgs.map((ag, idx) => {
        const isUltimo = idx === listaAgs.length - 1
        const tipoValor = getValorEfetivo(ag)
        const proporcao = valorBase > 0 ? tipoValor / valorBase : 1 / listaAgs.length
        const desconto_ag = isUltimo ? round2(descontoEfetivo - descontoAcumulado) : round2(descontoEfetivo * proporcao)
        const acrescimo_ag = isUltimo ? round2(acrescimoEfetivo - acrescimoAcumulado) : round2(acrescimoEfetivo * proporcao)
        descontoAcumulado += desconto_ag
        acrescimoAcumulado += acrescimo_ag
        const total_ag = round2(tipoValor - desconto_ag + acrescimo_ag)
        const def = ag.profissional_eh_clinica ? executores[ag.id] : undefined
        return {
          agendamento_id: ag.id,
          paciente_id: ag.paciente_id,
          valor_original: tipoValor,
          valor_desconto: desconto_ag,
          valor_acrescimo: acrescimo_ag,
          valor_recebido: total_ag,
          total_recebimento: total_ag,
          data_recebimento: format(parseISO(ag.data_hora_inicio), 'yyyy-MM-dd'),
          medico_solicitante_id: def?.medico_solicitante_id ?? null,
          medico_executor_id: def?.medico_executor_id ?? null,
        }
      })

      // Sem valor a cobrar no modo normal: a condição selecionada (sem lista de formas) vira
      // a única forma enviada, com valor 0 — não passa pelas linhas já adicionadas (não
      // existem nesse caso). No modo valor digitado, formasPagamento já contém a linha
      // (inclusive a de R$ 0,00 da cortesia), então é sempre ela que vai.
      const linhasParaEnviar = modoValorDigitado
        ? formasPagamento
        : (totalComAjustes === 0 ? [{ ...novaForma, valor: 0 }] : formasPagamento)
      const formasPayload = linhasParaEnviar.map(linha => {
        const condicaoLinha = condicoes.find(c => c.id === linha.condicao_pagamento_id)
        const linhaCartao = condicaoLinha?.tipo_pagamento === 'debito' || condicaoLinha?.tipo_pagamento === 'credito'
        const linhaCreditoParcelavel = condicaoLinha?.tipo_pagamento === 'credito' && (condicaoLinha?.num_parcelas ?? 0) > 1
        return {
          condicao_pagamento_id: linha.condicao_pagamento_id,
          valor: linha.valor,
          nsu: linhaCartao ? (linha.nsu.trim() || null) : null,
          parcelas_cartao: linhaCreditoParcelavel ? linha.parcelas_cartao : null,
        }
      })

      // Uma única chamada — gera 1 instrumento por forma de pagamento e N recebimentos
      const res = await fetch('/api/clinica/recebimentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observacao: form.observacao,
          itens,
          formas_pagamento: formasPayload,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        const mensagem = error.detalhes ? `${error.erro}: ${error.detalhes}` : (error.erro || 'Erro ao processar recebimento')
        toast.error(mensagem)
        console.error('Erro na API de recebimento:', error)
        return
      }

      toast.success(listaAgs.length > 1 ? 'Recebimentos registrados com sucesso!' : 'Recebimento registrado com sucesso!')
      if (onRecebimentoSalvo) {
        await onRecebimentoSalvo()
      }
      onClose()
    } catch (error) {
      toast.error('Erro ao processar recebimento')
      console.error(error)
    } finally {
      setSaving(false)
    }
  }

  if (!open || listaAgs.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}
    onClick={e => {
      if (e.target === e.currentTarget) onClose()
    }}
    >
      <div style={{
        background: 'var(--bg-page)',
        borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        width: '100%',
        maxWidth: 500,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Cabeçalho */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '0.5px solid var(--borda-suave)',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--texto-principal)', margin: 0 }}>
              Recebimento da Consulta
            </h2>
            <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
              {listaAgs[0]?.paciente_nome}
              {listaAgs.length === 1
                ? ` • ${format(parseISO(listaAgs[0].data_hora_inicio), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}`
                : ` • ${listaAgs.length} atendimentos`
              }
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--texto-terciario)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Corpo */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
        }}>

          {/* Informações da Consulta */}
          <div style={{
            background: 'var(--bg-card)',
            border: '0.5px solid var(--borda-suave)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 20,
          }}>
            <Label>{listaAgs.length > 1 ? 'Atendimentos' : 'Informações da Consulta'}</Label>
            {listaAgs.length === 1 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, marginTop: 8 }}>
                <div>
                  <div style={{ color: 'var(--texto-terciario)', marginBottom: 2 }}>Profissional</div>
                  <div style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>{listaAgs[0].profissional_nome}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--texto-terciario)', marginBottom: 2 }}>Tipo</div>
                  <div style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>{listaAgs[0].tipo_descricao || '—'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--texto-terciario)', marginBottom: 2 }}>
                    Valor da Consulta
                    {condicaoPrimeira && (
                      <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color: condicaoPrimeira.tipo === 'P' ? 'var(--cor-aviso)' : 'var(--cor-sucesso)' }}>
                        ({condicaoPrimeira.tipo === 'P' ? 'A PRAZO' : 'À VISTA'})
                      </span>
                    )}
                  </div>
                  {permiteEditarValorAtendimento ? (
                    <input
                      type="number"
                      step="0.01"
                      value={getValorEfetivo(listaAgs[0])}
                      onChange={e => {
                        const id = listaAgs[0].id
                        const v = Math.max(0, parseFloat(e.target.value) || 0)
                        setValoresEditados(prev => ({ ...prev, [id]: v }))
                      }}
                      style={{
                        width: '100%',
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--cor-primaria)',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px dashed var(--borda-media)',
                        outline: 'none',
                        padding: 0,
                      }}
                    />
                  ) : (
                    <div style={{ fontWeight: 700, color: 'var(--cor-primaria)', fontSize: 14 }}>
                      {fmtValor(getValorBase(listaAgs[0]))}
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ color: 'var(--texto-terciario)', marginBottom: 2 }}>Status</div>
                  <div style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>{listaAgs[0].status}</div>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 8 }}>
                {listaAgs.map((ag, i) => (
                  <div key={ag.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '7px 0',
                    borderBottom: i < listaAgs.length - 1 ? '0.5px solid var(--borda-suave)' : 'none',
                    fontSize: 12,
                    gap: 8,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>
                        {format(parseISO(ag.data_hora_inicio), 'HH:mm')} — {ag.tipo_descricao || 'Consulta'}
                      </div>
                      <div style={{ color: 'var(--texto-terciario)', fontSize: 11, marginTop: 2 }}>
                        {ag.profissional_nome}
                      </div>
                    </div>
                    {permiteEditarValorAtendimento ? (
                      <input
                        type="number"
                        step="0.01"
                        value={getValorEfetivo(ag)}
                        onChange={e => {
                          const v = Math.max(0, parseFloat(e.target.value) || 0)
                          setValoresEditados(prev => ({ ...prev, [ag.id]: v }))
                        }}
                        style={{
                          width: 90,
                          textAlign: 'right',
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--cor-primaria)',
                          background: 'transparent',
                          border: 'none',
                          borderBottom: '1px dashed var(--borda-media)',
                          outline: 'none',
                          padding: 0,
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div style={{ fontWeight: 700, color: 'var(--cor-primaria)', flexShrink: 0 }}>
                        {fmtValor(getValorBase(ag))}
                      </div>
                    )}
                  </div>
                ))}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0 0 0', marginTop: 4,
                  borderTop: '1px solid var(--borda-suave)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--texto-terciario)' }}>Total</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cor-primaria)' }}>
                    {fmtValor(listaAgs.reduce((acc, ag) => acc + getValorEfetivo(ag), 0))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Exame agendado sem executor definido: exige solicitante + executor */}
          {listaAgs.filter(ag => ag.profissional_eh_clinica).map(ag => (
            <div key={ag.id} style={{
              background: 'var(--bg-card)',
              border: '0.5px solid var(--borda-suave)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 20,
            }}>
              <Label>
                Exame — {ag.tipo_descricao || 'Atendimento'}
                {listaAgs.length > 1 ? ` (${ag.paciente_nome}, ${format(parseISO(ag.data_hora_inicio), 'HH:mm')})` : ''}
              </Label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <Field>
                  <Label>Médico Solicitante</Label>
                  <select
                    value={executores[ag.id]?.medico_solicitante_id ?? 0}
                    onChange={e => setExecutores(prev => ({
                      ...prev,
                      [ag.id]: { ...prev[ag.id], medico_solicitante_id: Number(e.target.value) || undefined },
                    }))}
                    className="input-field"
                    style={{ fontSize: 13, padding: '8px 10px' }}
                  >
                    <option value={0}>Selecione...</option>
                    {profissionaisSolicitante.map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </Field>
                <Field>
                  <Label>Médico Executor</Label>
                  <select
                    value={executores[ag.id]?.medico_executor_id ?? 0}
                    onChange={e => setExecutores(prev => ({
                      ...prev,
                      [ag.id]: { ...prev[ag.id], medico_executor_id: Number(e.target.value) || undefined },
                    }))}
                    className="input-field"
                    style={{ fontSize: 13, padding: '8px 10px' }}
                  >
                    <option value={0}>Selecione...</option>
                    {profissionais.map(p => (
                      <option key={p.id} value={p.id}>{p.eh_clinica ? `${p.nome} (Clínica)` : p.nome}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          ))}

          {/* Valores — o valor da consulta (tabela) já aparece acima, em "Informações da
              Consulta"/"Atendimentos", então aqui só entram os campos realmente editáveis
              (desconto/acréscimo) + o total. Some inteiro no modo valor digitado — ali o
              desconto/acréscimo é calculado sozinho a partir do que foi digitado nas formas
              de pagamento (ver resumo somente-leitura logo abaixo da lista de formas). */}
          {!modoValorDigitado && (
          <Field style={{ marginBottom: 20 }}>
            <Label>Valores</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 10,
                background: 'var(--bg-card)',
                borderRadius: 6,
                border: '0.5px solid var(--borda-suave)',
              }}>
                <Percent size={16} style={{ color: 'var(--cor-aviso)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginBottom: 2 }}>Desconto</div>
                  <input
                    type="number"
                    step="0.01"
                    value={form.desconto}
                    onChange={e => setForm({ ...form, desconto: Math.max(0, parseFloat(e.target.value) || 0) })}
                    placeholder="0,00"
                    style={{
                      width: '100%',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--texto-principal)',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: 0,
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cor-aviso)' }}>
                  -{fmtValor(form.desconto)}
                </span>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 10,
                background: 'var(--bg-card)',
                borderRadius: 6,
                border: '0.5px solid var(--borda-suave)',
              }}>
                <Percent size={16} style={{ color: 'var(--cor-sucesso)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--texto-terciario)', marginBottom: 2 }}>Acréscimo</div>
                  <input
                    type="number"
                    step="0.01"
                    value={form.acrescimo}
                    onChange={e => setForm({ ...form, acrescimo: Math.max(0, parseFloat(e.target.value) || 0) })}
                    placeholder="0,00"
                    style={{
                      width: '100%',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--texto-principal)',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: 0,
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cor-sucesso)' }}>
                  +{fmtValor(form.acrescimo)}
                </span>
              </div>

              {/* Total */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 12,
                background: 'var(--cor-primaria)',
                borderRadius: 6,
                marginTop: 4,
              }}>
                <DollarSign size={16} style={{ color: '#fff', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Total a Receber</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                    {fmtValor(totalComAjustes)}
                  </div>
                </div>
              </div>
            </div>
          </Field>
          )}

          {/* Formas de Pagamento — depois do Total a Receber, pra quem vai alocar já saber
              quanto precisa somar. Sem valor a cobrar: só a condição, sem nada pra adicionar.
              Com valor: escolhe a condição + valor e clica "Adicionar" — cada clique empilha
              uma forma na lista abaixo, até a soma bater com o total. No modo valor digitado
              sempre mostra a lista de adicionar (inclusive pra digitar R$ 0,00/cortesia). */}
          <Field style={{ marginBottom: 20 }}>
            <Label>Condição de Pagamento</Label>

            {(!modoValorDigitado && totalComAjustes === 0) ? (
              <select
                value={novaForma.condicao_pagamento_id}
                onChange={e => setNovaForma(prev => ({ ...prev, condicao_pagamento_id: Number(e.target.value) }))}
                disabled={loadingCondicoes}
                className="input-field"
                style={{ fontSize: 13, fontWeight: 500, padding: '10px 12px' }}
              >
                <option value={0}>Selecione uma condição...</option>
                {condicoes.map(cond => (
                  <option key={cond.id} value={cond.id}>{cond.descricao}</option>
                ))}
              </select>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                {/* Forma em edição — vira uma linha na lista abaixo ao clicar "Adicionar" */}
                <div style={{
                  border: '0.5px solid var(--borda-suave)',
                  borderRadius: 6,
                  padding: 10,
                  background: 'var(--bg-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <Field style={{ flex: 1 }}>
                      <Label>Forma de Pagamento</Label>
                      <select
                        value={novaForma.condicao_pagamento_id}
                        onChange={e => setNovaForma(prev => ({ ...prev, condicao_pagamento_id: Number(e.target.value), parcelas_cartao: 1 }))}
                        disabled={loadingCondicoes}
                        className="input-field"
                        style={{ fontSize: 13, fontWeight: 500, padding: '10px 12px' }}
                      >
                        <option value={0}>Selecione uma condição...</option>
                        {condicoes.map(cond => {
                          const sufixoCartao = cond.tipo_pagamento === 'debito' ? ' [DÉBITO]' : cond.tipo_pagamento === 'credito' ? ' [CRÉDITO]' : ''
                          const label = `${cond.descricao}${cond.tipo === 'P' && cond.num_parcelas > 1 ? ` (${cond.num_parcelas}x)` : ''}${cond.tipo_pagamento === 'pix' ? ' [PIX]' : ''}${sufixoCartao}`
                          return (
                            <option key={cond.id} value={cond.id}>
                              {label}
                            </option>
                          )
                        })}
                      </select>
                    </Field>
                    <Field style={{ width: 120 }}>
                      <Label>{modoValorDigitado ? 'Valor Pago' : 'Valor a Receber'}</Label>
                      <input
                        type="number"
                        step="0.01"
                        value={novaForma.valor}
                        onChange={e => setNovaForma(prev => ({ ...prev, valor: Math.max(0, parseFloat(e.target.value) || 0) }))}
                        className="input-field"
                        style={{ fontSize: 13, padding: '10px 12px' }}
                      />
                    </Field>
                    <button
                      type="button"
                      onClick={adicionarForma}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '10px 14px',
                        background: 'var(--cor-primaria)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Plus size={14} />
                      Adicionar
                    </button>
                  </div>

                  {condicaoNovaForma?.tipo_pagamento === 'pix' && (
                    <div style={{
                      fontSize: 12,
                      color: 'var(--cor-primaria)',
                      padding: '8px 10px',
                      background: 'var(--cor-primaria-light)',
                      borderRadius: 4,
                    }}>
                      ✓ PIX - Conta bancária pré-configurada
                    </div>
                  )}
                  {condicaoNovaForma?.tipo_pagamento === 'credito' && condicaoNovaForma.num_parcelas > 1 && (
                    <Field>
                      <Label>Nº de Parcelas</Label>
                      <select
                        value={novaForma.parcelas_cartao}
                        onChange={e => setNovaForma(prev => ({ ...prev, parcelas_cartao: Number(e.target.value) }))}
                        className="input-field"
                        style={{ fontSize: 13, fontWeight: 500, padding: '10px 12px' }}
                      >
                        {Array.from({ length: condicaoNovaForma.num_parcelas }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>{n}x{n === 1 ? ' (à vista)' : ''}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {(condicaoNovaForma?.tipo_pagamento === 'debito' || condicaoNovaForma?.tipo_pagamento === 'credito') && (
                    <Field>
                      <Label>NSU do Cartão (opcional)</Label>
                      <input
                        type="text"
                        value={novaForma.nsu}
                        onChange={e => setNovaForma(prev => ({ ...prev, nsu: e.target.value }))}
                        placeholder="Nº do comprovante da maquininha"
                        className="input-field"
                        style={{ fontSize: 13, padding: '10px 12px' }}
                      />
                    </Field>
                  )}
                </div>

                {/* Formas já adicionadas */}
                {formasPagamento.map((linha, idx) => {
                  const condicaoLinha = condicoes.find(c => c.id === linha.condicao_pagamento_id)
                  return (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 10px',
                      background: 'var(--bg-card)',
                      border: '0.5px solid var(--borda-suave)',
                      borderRadius: 6,
                      fontSize: 13,
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>{condicaoLinha?.descricao ?? '—'}</div>
                        {linha.nsu && (
                          <div style={{ fontSize: 11, color: 'var(--texto-terciario)' }}>NSU: {linha.nsu}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 700, color: 'var(--cor-primaria)' }}>{fmtValor(linha.valor)}</span>
                        <button
                          onClick={() => removerForma(idx)}
                          title="Remover forma de pagamento"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cor-erro)', padding: 2, display: 'flex' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* Resumo — modo valor digitado: desconto/acréscimo calculados sozinhos a
                    partir do que foi somado nas formas (resumo somente-leitura, nada aqui é
                    editável). Modo normal: soma + restante, mesmo peso visual do "Total a
                    Receber" acima, pra ficar óbvio quando as formas já cobrem o total. */}
                {modoValorDigitado ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 12,
                    background: Math.abs(diffValorDigitado) <= 0.004
                      ? 'var(--cor-sucesso)'
                      : (diffValorDigitado > 0 ? 'var(--cor-aviso)' : 'var(--cor-primaria)'),
                    borderRadius: 6,
                  }}>
                    {Math.abs(diffValorDigitado) <= 0.004
                      ? <Check size={16} style={{ color: '#fff', flexShrink: 0 }} />
                      : <Percent size={16} style={{ color: '#fff', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 2 }}>
                        {Math.abs(diffValorDigitado) <= 0.004
                          ? 'Confere com o valor da consulta — sem desconto/acréscimo'
                          : diffValorDigitado > 0 ? 'Desconto automático' : 'Acréscimo automático'}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                        Total pago: {fmtValor(somaFormas)}
                        {Math.abs(diffValorDigitado) > 0.004 && (
                          <span style={{ fontWeight: 600, fontSize: 13, marginLeft: 6 }}>
                            ({diffValorDigitado > 0 ? '-' : '+'}{fmtValor(Math.abs(diffValorDigitado))})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: 12,
                    background: formasBatem ? 'var(--cor-sucesso)' : (restanteAlocar < 0 ? 'var(--cor-erro)' : 'var(--cor-aviso)'),
                    borderRadius: 6,
                  }}>
                    {formasBatem ? <Check size={16} style={{ color: '#fff', flexShrink: 0 }} /> : <DollarSign size={16} style={{ color: '#fff', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 2 }}>
                        {formasBatem ? 'Formas de pagamento conferem com o total' : restanteAlocar < 0 ? 'Valor alocado além do total' : 'Restante a alocar'}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                        {fmtValor(formasBatem ? totalComAjustes : Math.abs(restanteAlocar))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Field>

          {/* Observação */}
          <Field style={{ marginBottom: 20 }}>
            <Label>Observação</Label>
            <textarea
              value={form.observacao}
              onChange={e => setForm({ ...form, observacao: e.target.value })}
              placeholder="Digite qualquer observação relevante..."
              className="input-field"
              style={{
                minHeight: 60,
                fontSize: 12,
                fontFamily: 'inherit',
                padding: '8px 10px',
                resize: 'none',
              }}
            />
          </Field>

        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          gap: 8,
          padding: '16px 20px',
          borderTop: '0.5px solid var(--borda-suave)',
          flexShrink: 0,
          background: 'var(--bg-card)',
        }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: '0.5px solid var(--borda-media)',
              background: 'var(--bg-page)',
              color: 'var(--texto-principal)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              transition: 'all 0.2s',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: 'none',
              background: 'var(--cor-primaria)',
              color: '#fff',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              transition: 'all 0.2s',
              opacity: saving ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Check size={16} />
            {saving ? 'Processando...' : 'Confirmar Recebimento'}
          </button>
        </div>

      </div>
    </div>
  )
}
