'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown, ChevronUp, Pencil, Save, X, FileText, Stethoscope, Users, User,
  Activity, AlertTriangle, ClipboardList, Scale, HeartPulse, FlaskConical, Pill, ListChecks, Mic,
  FileSignature, ExternalLink, Printer, Loader2, Paperclip, Trash2,
} from 'lucide-react'
import type { AgendamentoListItem, Prontuario, ProntuarioAnexo, ReceitaMedica, ReceitaSistemaRegistro } from '@/types/clinica.types'
import VoaPluginView, { type Status as VoaStatus, type VoaPluginHandle } from './VoaPluginView'
import MemedPrescricao from './MemedPrescricao'
import ReceitaSistema from './ReceitaSistema'
import { gerarHtmlReceita, type DadosPrescritor } from './receitaSistemaPrint'

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

const VOA_COR    = '#7C3AED'
const MEMED_COR  = '#059669'
const SISTEMA_COR = '#1E7FC3'

type FormState = {
  queixas:                 string
  hda:                     string
  antecedentes_familiares: string
  antecedentes_pessoais:   string
  habitos:                 string
  alergias:                string
  exame_fisico:            string
  peso:                    string
  imc:                     string
  pressao:                 string
  exames:                  string
  diagnostico:             string
  medicacao:               string
  outras_condutas:         string
}

const CAMPOS_VAZIOS: FormState = {
  queixas: '', hda: '', antecedentes_familiares: '', antecedentes_pessoais: '',
  habitos: '', alergias: '', exame_fisico: '', peso: '', imc: '', pressao: '',
  exames: '', diagnostico: '', medicacao: '', outras_condutas: '',
}

// Mapa dos títulos de seção do documento markdown que a Voa gera (botão "copiar todo o
// documento" dentro do widget) para os campos do nosso prontuário. Chaves já sem acento
// e em minúsculo — comparação é feita normalizando o título lido também.
const MAPA_SECOES_DOCUMENTO: Record<string, keyof FormState> = {
  'queixa principal':                 'queixas',
  'historia da doenca atual':         'hda',
  'historia pregressa':               'antecedentes_pessoais',
  'historia familiar':                'antecedentes_familiares',
  'historia social e habitos de vida': 'habitos',
  'alergias':                         'alergias',
  'exame fisico':                     'exame_fisico',
  'resultado de exames':              'exames',
  'exames complementares':            'exames',
  'escalas e scores cardiologicos':   'exames',
  'hipoteses diagnosticas':           'diagnostico',
  'medicacoes em uso':                'medicacao',
  'medicacoes prescritas':            'medicacao',
  'orientacoes':                      'outras_condutas',
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Documento gerado/copiado pela Voa vem como texto solto em markdown (títulos "## Seção:"),
// não no formato chave/valor do structuredOutputSchema — por isso precisa de um parser à parte.
function parseDocumentoVoa(texto: string): Partial<FormState> {
  const secoes: { chave: keyof FormState; linhas: string[] }[] = []
  let atual: { chave: keyof FormState; linhas: string[] } | null = null

  for (const linha of texto.split(/\r?\n/)) {
    const titulo = linha.match(/^#{1,3}\s*(.+?):?\s*$/)
    if (titulo) {
      const chave = MAPA_SECOES_DOCUMENTO[semAcento(titulo[1].trim().toLowerCase())]
      atual = chave ? { chave, linhas: [] } : null
      if (atual) secoes.push(atual)
      continue
    }
    if (atual && linha.trim()) atual.linhas.push(linha.trim())
  }

  const resultado: Partial<FormState> = {}
  for (const { chave, linhas } of secoes) {
    const bloco = linhas.join('\n').trim()
    if (!bloco) continue
    resultado[chave] = resultado[chave] ? `${resultado[chave]}\n${bloco}` : bloco
  }

  // Pressão não tem seção própria no documento — tenta achar "170x100 mmHg" direto no
  // texto, ou monta a partir de "PA Sistólica"/"PA Diastólica" (seção Sinais Vitais).
  const direto = texto.match(/(\d{2,3})\s*[xX]\s*(\d{2,3})\s*mm[hH]g/)
  if (direto) {
    resultado.pressao = `${direto[1]}x${direto[2]}mmHg`
  } else {
    const sist  = texto.match(/PA\s*Sist[oó]lica:?\s*(\d{2,3})/i)
    const diast = texto.match(/PA\s*Diast[oó]lica:?\s*(\d{2,3})/i)
    if (sist && diast) resultado.pressao = `${sist[1]}x${diast[1]}mmHg`
  }

  return resultado
}

function prontuarioParaForm(p?: Prontuario): FormState {
  if (!p) return { ...CAMPOS_VAZIOS }
  return {
    queixas:                 p.queixas ?? '',
    hda:                     p.hda ?? '',
    antecedentes_familiares: p.antecedentes_familiares ?? '',
    antecedentes_pessoais:   p.antecedentes_pessoais ?? '',
    habitos:                 p.habitos ?? '',
    alergias:                p.alergias ?? '',
    exame_fisico:            p.exame_fisico ?? '',
    peso:                    p.peso != null ? String(p.peso) : '',
    imc:                     p.imc != null ? String(p.imc) : '',
    pressao:                 p.pressao ?? '',
    exames:                  p.exames ?? '',
    diagnostico:             p.diagnostico ?? '',
    medicacao:               p.medicacao ?? '',
    outras_condutas:         p.outras_condutas ?? '',
  }
}

function Campo({ icone: Icone, label, valor, destaque }: {
  icone: React.ElementType; label: string; valor: string | null; destaque?: boolean
}) {
  if (!valor) return null
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '8px 10px',
      backgroundColor: destaque ? 'var(--cor-primaria-light)' : 'var(--bg-input)',
      borderRadius: 5, border: destaque ? '1px solid var(--cor-primaria)' : '1px solid transparent',
    }}>
      <Icone size={14} style={{ color: destaque ? 'var(--cor-primaria)' : 'var(--texto-terciario)', flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
          color: destaque ? 'var(--cor-primaria)' : 'var(--texto-terciario)', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--texto-principal)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {valor}
        </div>
      </div>
    </div>
  )
}

function CampoEdit({ label, value, onChange, area = true, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; area?: boolean; placeholder?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--texto-terciario)' }}>
        {label}
      </span>
      {area ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={{
            width: '100%', resize: 'vertical', padding: '6px 8px', fontSize: 12.5,
            border: '1px solid var(--borda-media)', borderRadius: 4, fontFamily: 'inherit',
            backgroundColor: 'var(--bg-card)', color: 'var(--texto-principal)',
          }}
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '6px 8px', fontSize: 12.5,
            border: '1px solid var(--borda-media)', borderRadius: 4,
            backgroundColor: 'var(--bg-card)', color: 'var(--texto-principal)',
          }}
        />
      )}
    </label>
  )
}

interface Props {
  pacienteId:       number
  // Agendamento em atendimento no momento (ex: aberto pela sala de espera), ainda não
  // necessariamente ATENDIDO — fixado na timeline mesmo sem histórico prévio, pra permitir
  // preencher prontuário/emitir receita da consulta em andamento.
  agendamentoAtual?: AgendamentoListItem | null
}

export default function HistoricoClinico({ pacienteId, agendamentoAtual = null }: Props) {
  const [consultas,   setConsultas]   = useState<AgendamentoListItem[]>([])
  const [prontuarios, setProntuarios] = useState<Record<number, Prontuario>>({})
  const [receitas,    setReceitas]    = useState<Record<number, ReceitaMedica[]>>({})
  const [receitasSistema, setReceitasSistema] = useState<Record<number, ReceitaSistemaRegistro[]>>({})
  const [reimprimindoId, setReimprimindoId] = useState<number | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [abertoId,    setAbertoId]    = useState<number | null>(agendamentoAtual?.id ?? null)
  const [editandoId,  setEditandoId]  = useState<number | null>(null)
  const [form,        setForm]        = useState<FormState>(CAMPOS_VAZIOS)
  const [salvando,    setSalvando]    = useState(false)
  const [voaAtivoId,   setVoaAtivoId]   = useState<number | null>(null)
  const [voaMontadoId, setVoaMontadoId] = useState<number | null>(null)
  // Espelha o status da instância montada da Voa — só pra saber se há algo "vivo"
  // a perder antes de desmontar sem avisar (troca de consulta, fechar, etc.).
  const [voaGravando, setVoaGravando] = useState(false)
  const [receitaAtivaId, setReceitaAtivaId] = useState<number | null>(null)
  const [receitaSistemaId, setReceitaSistemaId] = useState<number | null>(null)
  const [anexos, setAnexos] = useState<Record<number, ProntuarioAnexo[]>>({})
  const [enviandoAnexoId, setEnviandoAnexoId] = useState<number | null>(null)
  const [anexoAlvoId, setAnexoAlvoId] = useState<number | null>(null)
  const inputAnexoRef = useRef<HTMLInputElement>(null)
  const voaRef = useRef<VoaPluginHandle>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [resAg, resPr, resRe, resRs, resAn] = await Promise.all([
        fetch(`/api/clinica/agendamentos?${new URLSearchParams({ paciente_id: String(pacienteId), status: 'ATENDIDO' })}`),
        fetch(`/api/clinica/prontuarios?${new URLSearchParams({ paciente_id: String(pacienteId) })}`),
        fetch(`/api/clinica/receitas?${new URLSearchParams({ paciente_id: String(pacienteId) })}`),
        fetch(`/api/clinica/receitas-sistema?${new URLSearchParams({ paciente_id: String(pacienteId) })}`),
        fetch(`/api/clinica/prontuarios/anexos?${new URLSearchParams({ paciente_id: String(pacienteId) })}`),
      ])
      const dataAg = await resAg.json()
      const dataPr = await resPr.json()
      const dataRe = await resRe.json()
      const dataRs = await resRs.json()
      const dataAn = await resAn.json()
      const lista: AgendamentoListItem[] = [...(dataAg.dados ?? [])]
      if (agendamentoAtual && !lista.some(a => a.id === agendamentoAtual.id)) lista.push(agendamentoAtual)
      lista.sort((a, b) => +new Date(b.data_hora_inicio) - +new Date(a.data_hora_inicio))
      const mapa: Record<number, Prontuario> = {}
      for (const p of (dataPr.dados ?? []) as Prontuario[]) mapa[p.agendamento_id] = p
      const mapaReceitas: Record<number, ReceitaMedica[]> = {}
      for (const r of (dataRe.dados ?? []) as ReceitaMedica[]) {
        (mapaReceitas[r.agendamento_id] ??= []).push(r)
      }
      const mapaReceitasSistema: Record<number, ReceitaSistemaRegistro[]> = {}
      for (const r of (dataRs.dados ?? []) as ReceitaSistemaRegistro[]) {
        (mapaReceitasSistema[r.agendamento_id] ??= []).push(r)
      }
      const mapaAnexos: Record<number, ProntuarioAnexo[]> = {}
      for (const a of (dataAn.dados ?? []) as ProntuarioAnexo[]) {
        (mapaAnexos[a.agendamento_id] ??= []).push(a)
      }
      setConsultas(lista)
      setProntuarios(mapa)
      setReceitas(mapaReceitas)
      setReceitasSistema(mapaReceitasSistema)
      setAnexos(mapaAnexos)
    } finally {
      setLoading(false)
    }
  }, [pacienteId, agendamentoAtual])

  useEffect(() => { carregar() }, [carregar])

  function iniciarEdicao(ag: AgendamentoListItem) {
    // Se havia uma sessão da Voa montada em OUTRA consulta, encerra de vez —
    // senão ela continua escutando em background e pode aplicar dados extraídos
    // dela dentro do form desta consulta (mistura de consulta).
    if (voaMontadoId !== null && voaMontadoId !== ag.id) {
      if (voaGravando && !confirm('Há uma gravação da Voa em andamento em outra consulta. Se ainda não copiou o documento gerado, você vai perder o conteúdo ao trocar de consulta agora. Continuar?')) return
      setVoaMontadoId(null)
      setVoaGravando(false)
    }
    setForm(prontuarioParaForm(prontuarios[ag.id]))
    setEditandoId(ag.id)
    setAbertoId(ag.id)
    setVoaAtivoId(null)
    setReceitaAtivaId(null)
  }

  function cancelarEdicao() {
    setEditandoId(null)
    setVoaAtivoId(null)
  }

  // Encerra de vez a gravação da Voa (desmonta o SDK) — diferente de só ocultar o
  // painel: usado quando o usuário clica em "Encerrar gravação" ou troca de consulta.
  function encerrarVoa() {
    setVoaMontadoId(null)
    setVoaAtivoId(null)
    setVoaGravando(false)
  }

  function abrirVoa(agId: number) {
    // Se era um agendamento diferente que estava montado, desmonta primeiro
    // (React processa o setVoaMontadoId→null num render, depois o novo agId no próximo)
    if (voaMontadoId !== null && voaMontadoId !== agId) {
      setVoaMontadoId(null)
      setVoaAtivoId(null)
      setTimeout(() => {
        setVoaMontadoId(agId)
        setVoaAtivoId(agId)
      }, 50) // aguarda React desmontar o anterior antes de montar o novo
    } else {
      setVoaMontadoId(agId)
      setVoaAtivoId(agId)
    }
  }

  function aplicarDadosVoa(dados: Record<string, string>) {
    setForm(f => {
      const atualizado = { ...f }
      for (const chave of Object.keys(CAMPOS_VAZIOS) as (keyof FormState)[]) {
        if (dados[chave]) atualizado[chave] = dados[chave]
      }
      return atualizado
    })
    toast.success('Campos preenchidos pela Voa — revise antes de salvar')
  }

  // Documento completo gerado/copiado dentro do próprio widget da Voa (formato markdown,
  // diferente do structuredOutputSchema) — reaproveita o mesmo merge de aplicarDadosVoa.
  function aplicarDocumentoVoa(texto: string) {
    const dados = parseDocumentoVoa(texto)
    if (Object.keys(dados).length === 0) {
      toast.error('Não consegui reconhecer as seções do documento da Voa — copie e cole manualmente')
      return
    }
    aplicarDadosVoa(dados)
  }

  // Rastreabilidade: guarda o uuid que a própria Voa gera pra consulta, vinculado ao
  // agendamento local — não é crítico pro fluxo de gravação, por isso falha é silenciosa.
  async function salvarVoaAtendimentoId(agendamentoId: number, voaAtendimentoId: string, tipo: string) {
    try {
      await fetch('/api/voa/atendimento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agendamento_id: agendamentoId, voa_atendimento_id: voaAtendimentoId, voa_atendimento_tipo: tipo }),
      })
    } catch {
      // silencioso — auditoria, não bloqueia o fluxo principal
    }
  }

  // Anexa o arquivo no nosso sistema (fica salvo no banco/volume) e, se a Voa estiver
  // com sessão ativa nessa consulta, também empurra o mesmo arquivo pro pipeline dela.
  async function anexarArquivo(ag: AgendamentoListItem, file: File) {
    setEnviandoAnexoId(ag.id)
    try {
      const formData = new FormData()
      formData.append('agendamento_id', String(ag.id))
      formData.append('file', file)
      const res = await fetch('/api/clinica/prontuarios/anexos', { method: 'POST', body: formData })
      const salvo = await res.json()
      if (!res.ok) { toast.error(salvo.erro || 'Erro ao anexar arquivo'); return }

      setAnexos(prev => ({ ...prev, [ag.id]: [salvo, ...(prev[ag.id] ?? [])] }))

      const enviadoTambemNaVoa = voaMontadoId === ag.id && (voaRef.current?.uploadFiles([file]) ?? false)
      toast.success(enviadoTambemNaVoa ? 'Arquivo anexado e enviado também para a Voa' : 'Arquivo anexado à consulta')
    } catch {
      toast.error('Erro ao anexar arquivo')
    } finally {
      setEnviandoAnexoId(null)
    }
  }

  function abrirSeletorAnexo(agId: number) {
    setAnexoAlvoId(agId)
    inputAnexoRef.current?.click()
  }

  function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite selecionar o mesmo arquivo de novo depois
    const ag = consultas.find(a => a.id === anexoAlvoId)
    if (file && ag) anexarArquivo(ag, file)
  }

  async function removerAnexo(ag: AgendamentoListItem, anexo: ProntuarioAnexo) {
    if (!confirm(`Remover o anexo "${anexo.nome_arquivo}"?`)) return
    try {
      const res = await fetch(`/api/clinica/prontuarios/anexos/${anexo.id}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao remover anexo'); return }
      setAnexos(prev => ({ ...prev, [ag.id]: (prev[ag.id] ?? []).filter(a => a.id !== anexo.id) }))
    } catch {
      toast.error('Erro ao remover anexo')
    }
  }

  async function salvar(ag: AgendamentoListItem) {
    setSalvando(true)
    try {
      const payload = {
        agendamento_id:  ag.id,
        paciente_id:     pacienteId,
        profissional_id: ag.profissional_id,
        ...form,
        peso: form.peso === '' ? null : Number(form.peso),
        imc:  form.imc === ''  ? null : Number(form.imc),
      }
      const res = await fetch('/api/clinica/prontuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { toast.error('Erro ao salvar prontuário'); return }
      const salvo: Prontuario = await res.json()
      setProntuarios(prev => ({ ...prev, [ag.id]: salvo }))
      setEditandoId(null)
      toast.success('Prontuário salvo!')
    } finally {
      setSalvando(false)
    }
  }

  async function reimprimirReceitaSistema(reg: ReceitaSistemaRegistro, ag: AgendamentoListItem) {
    setReimprimindoId(reg.id)
    try {
      const res = await fetch(`/api/clinica/receitas-sistema?dados=true&agendamento_id=${reg.agendamento_id}`)
      const d = await res.json()
      const dados: DadosPrescritor | null = d.dados ?? null
      const itens = reg.itens.map(it => ({
        nome:         it.medicamento_nome,
        apresentacao: it.apresentacao,
        posologia:    it.posologia,
        duracao:      it.duracao,
        quantidade:   it.quantidade,
      }))
      const html = gerarHtmlReceita(itens, reg.observacoes, dados, ag.paciente_nome, ag.profissional_nome)
      const win = window.open('', '_blank', 'width=820,height=1050')
      if (win) { win.document.write(html); win.document.close() }
    } catch {
      toast.error('Erro ao gerar receita para impressão')
    } finally {
      setReimprimindoId(null)
    }
  }

  if (loading) {
    return <div style={{ fontSize: 12, color: 'var(--texto-terciario)', padding: 12 }}>Carregando histórico...</div>
  }

  if (consultas.length === 0) {
    return (
      <div style={{ padding: '24px 4px', textAlign: 'center', fontSize: 12, color: 'var(--texto-secundario)' }}>
        Nenhuma consulta atendida encontrada para este paciente.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
      <input
        ref={inputAnexoRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleArquivoSelecionado}
        accept=".pdf,.jpg,.jpeg,.png,.webp"
      />
      {consultas.map((ag, idx) => {
        const prontuario = prontuarios[ag.id]
        const aberto      = abertoId === ag.id
        const editando    = editandoId === ag.id
        const dt          = new Date(ag.data_hora_inicio)
        const cor         = STATUS_COLOR[ag.status] ?? '#888780'
        const resumo       = prontuario?.diagnostico || prontuario?.queixas
        const ultimo      = idx === consultas.length - 1

        return (
          <div key={ag.id} style={{ display: 'flex', gap: 12 }}>
            {/* Linha do tempo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', marginTop: 14,
                backgroundColor: cor, border: '2px solid var(--bg-card)', boxShadow: `0 0 0 2px ${cor}`,
                flexShrink: 0,
              }} />
              {!ultimo && <div style={{ width: 2, flex: 1, backgroundColor: 'var(--borda-suave)', marginTop: 2 }} />}
            </div>

            {/* Card */}
            <div style={{ flex: 1, paddingBottom: 14, minWidth: 0 }}>
              <div style={{
                border: '1px solid var(--borda-media)', borderRadius: 6, overflow: 'hidden',
                backgroundColor: 'var(--bg-card)',
              }}>
                {/* Cabeçalho */}
                <button
                  type="button"
                  onClick={() => {
                    // Ao recolher, fecha também os painéis de Voa/Memed dessa consulta —
                    // senão reabrir o card remonta o MemedPrescricao sozinho, sem clique
                    // do usuário, reautenticando na Memed sem necessidade.
                    if (aberto) {
                      if (voaAtivoId === ag.id) setVoaAtivoId(null)
                      if (receitaAtivaId === ag.id) setReceitaAtivaId(null)
                    }
                    setAbertoId(aberto ? null : ag.id)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ minWidth: 72 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--texto-principal)' }}>
                      {dt.toLocaleDateString('pt-BR')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)' }}>
                      {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--texto-principal)' }}>
                      {ag.profissional_nome}
                      {(ag.tipo_descricao || ag.especialidade_descricao) && (
                        <span style={{ fontWeight: 400, color: 'var(--texto-secundario)' }}>
                          {' '}· {ag.tipo_descricao ?? ag.especialidade_descricao}
                        </span>
                      )}
                    </div>
                    {!aberto && resumo && (
                      <div style={{
                        fontSize: 11.5, color: 'var(--texto-terciario)', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {resumo}
                      </div>
                    )}
                    {!aberto && !resumo && (
                      <div style={{ fontSize: 11.5, color: 'var(--texto-terciario)', marginTop: 2, fontStyle: 'italic' }}>
                        Prontuário não preenchido
                      </div>
                    )}
                  </div>

                  <span style={{
                    fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    color: cor, backgroundColor: `${cor}1E`, flexShrink: 0,
                  }}>
                    {STATUS_LABEL[ag.status] ?? ag.status}
                  </span>

                  {aberto ? <ChevronUp size={16} style={{ color: 'var(--texto-terciario)', flexShrink: 0 }} />
                          : <ChevronDown size={16} style={{ color: 'var(--texto-terciario)', flexShrink: 0 }} />}
                </button>

                {/* Corpo expandido */}
                {aberto && (
                  <div style={{ borderTop: '1px solid var(--borda-suave)', padding: 12 }}>
                    {!editando ? (
                      <>
                        {prontuario ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Campo icone={Stethoscope}    label="Queixas"                  valor={prontuario.queixas} />
                            <Campo icone={FileText}       label="HDA"                       valor={prontuario.hda} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              <Campo icone={Users}        label="Antecedentes Familiares"   valor={prontuario.antecedentes_familiares} />
                              <Campo icone={User}         label="Antecedentes Pessoais"     valor={prontuario.antecedentes_pessoais} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              <Campo icone={Activity}     label="Hábitos"                   valor={prontuario.habitos} />
                              <Campo icone={AlertTriangle} label="Alergias"                 valor={prontuario.alergias} />
                            </div>
                            <Campo icone={ClipboardList}  label="Exame Físico"              valor={prontuario.exame_fisico} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                              <Campo icone={Scale}        label="Peso"                      valor={prontuario.peso != null ? `${prontuario.peso} kg` : null} />
                              <Campo icone={Scale}        label="IMC"                       valor={prontuario.imc != null ? String(prontuario.imc) : null} />
                              <Campo icone={HeartPulse}   label="Pressão"                   valor={prontuario.pressao} />
                            </div>
                            <Campo icone={FlaskConical}   label="Exames"                    valor={prontuario.exames} />
                            <Campo icone={FileText}       label="Diagnóstico"               valor={prontuario.diagnostico} destaque />
                            <Campo icone={Pill}           label="Medicação"                 valor={prontuario.medicacao} />
                            <Campo icone={ListChecks}     label="Outras Condutas"           valor={prontuario.outras_condutas} />

                            {!prontuario.queixas && !prontuario.hda && !prontuario.diagnostico && (
                              <div style={{ fontSize: 12, color: 'var(--texto-terciario)', fontStyle: 'italic' }}>
                                Nenhum dado clínico preenchido ainda.
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', fontStyle: 'italic' }}>
                            Prontuário ainda não preenchido para esta consulta.
                          </div>
                        )}

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                          <button
                            type="button"
                            onClick={() => iniciarEdicao(ag)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '5px 10px', fontSize: 11.5, fontWeight: 600,
                              background: 'none', border: '1px solid var(--borda-media)', borderRadius: 4,
                              cursor: 'pointer', color: 'var(--cor-primaria)',
                            }}
                          >
                            <Pencil size={12} /> {prontuario ? 'Editar prontuário' : 'Preencher prontuário'}
                          </button>

                          <button
                            type="button"
                            onClick={() => setReceitaAtivaId(receitaAtivaId === ag.id ? null : ag.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '5px 10px', fontSize: 11.5, fontWeight: 600,
                              background: 'none', border: `1px solid ${MEMED_COR}`, borderRadius: 4,
                              cursor: 'pointer', color: MEMED_COR,
                            }}
                          >
                            <FileSignature size={12} /> Emitir Receita
                          </button>

                          <button
                            type="button"
                            onClick={() => setReceitaSistemaId(ag.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '5px 10px', fontSize: 11.5, fontWeight: 600,
                              background: 'none', border: '1px solid #1E7FC3', borderRadius: 4,
                              cursor: 'pointer', color: '#1E7FC3',
                            }}
                          >
                            <FileText size={12} /> Emitir Receita Sistema
                          </button>

                          <button
                            type="button"
                            onClick={() => abrirSeletorAnexo(ag.id)}
                            disabled={enviandoAnexoId === ag.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '5px 10px', fontSize: 11.5, fontWeight: 600,
                              backgroundColor: 'var(--cor-sucesso-bg)', border: '1px solid var(--cor-sucesso)', borderRadius: 4,
                              cursor: enviandoAnexoId === ag.id ? 'not-allowed' : 'pointer',
                              color: 'var(--cor-sucesso)', opacity: enviandoAnexoId === ag.id ? 0.6 : 1,
                            }}
                          >
                            {enviandoAnexoId === ag.id ? <Loader2 size={12} /> : <Paperclip size={12} />}
                            Anexar exame
                          </button>
                        </div>

                        {!!anexos[ag.id]?.length && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--texto-terciario)' }}>
                              Anexos
                            </div>
                            {anexos[ag.id].map(anexo => (
                              <div key={anexo.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                backgroundColor: 'var(--bg-input)', borderRadius: 5, fontSize: 12,
                              }}>
                                <Paperclip size={13} style={{ color: 'var(--texto-terciario)', flexShrink: 0 }} />
                                <a
                                  href={`/api/clinica/prontuarios/anexos/${anexo.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--cor-primaria)', fontWeight: 600 }}
                                >
                                  {anexo.nome_arquivo}
                                </a>
                                {anexo.tamanho_bytes != null && (
                                  <span style={{ color: 'var(--texto-terciario)', fontSize: 11, whiteSpace: 'nowrap' }}>
                                    {(anexo.tamanho_bytes / 1024).toFixed(0)} KB
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removerAnexo(ag, anexo)}
                                  style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cor-erro)', padding: 0 }}
                                  title="Remover anexo"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {receitaAtivaId === ag.id && (
                          <div style={{ marginTop: 8 }}>
                            <MemedPrescricao
                              agendamentoId={ag.id}
                              profissionalId={ag.profissional_id}
                              onFechar={() => setReceitaAtivaId(null)}
                              onEmitida={carregar}
                            />
                          </div>
                        )}

                        {receitaSistemaId === ag.id && (
                          <ReceitaSistema
                            agendamentoId={ag.id}
                            pacienteNome={ag.paciente_nome}
                            profissionalNome={ag.profissional_nome}
                            onFechar={() => setReceitaSistemaId(null)}
                            onEmitida={() => { setReceitaSistemaId(null); carregar() }}
                          />
                        )}

                        {!!receitas[ag.id]?.length && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--texto-terciario)' }}>
                              Receitas emitidas
                            </div>
                            {receitas[ag.id].map(r => (
                              <div key={r.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                backgroundColor: 'var(--bg-input)', borderRadius: 5, fontSize: 12,
                              }}>
                                <FileSignature size={13} style={{ color: MEMED_COR, flexShrink: 0 }} />
                                <span style={{ color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)', fontSize: 11 }}>
                                  {new Date(r.created_at).toLocaleDateString('pt-BR')}
                                </span>
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--texto-principal)' }}>
                                  {r.medicamentos || 'Receita emitida'}
                                </span>
                                {r.url_receita && (
                                  <a
                                    href={r.url_receita}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--cor-primaria)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
                                  >
                                    Ver/reimprimir <ExternalLink size={11} />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {!!receitasSistema[ag.id]?.length && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--texto-terciario)' }}>
                              Receitas do sistema emitidas
                            </div>
                            {receitasSistema[ag.id].map(r => (
                              <div key={r.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                backgroundColor: 'var(--bg-input)', borderRadius: 5, fontSize: 12,
                              }}>
                                <FileText size={13} style={{ color: SISTEMA_COR, flexShrink: 0 }} />
                                <span style={{ color: 'var(--texto-terciario)', fontFamily: 'var(--fonte-mono)', fontSize: 11 }}>
                                  {new Date(r.created_at).toLocaleDateString('pt-BR')}
                                </span>
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--texto-principal)' }}>
                                  {r.itens.map(it => it.medicamento_nome).join(', ') || 'Receita emitida'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => reimprimirReceitaSistema(r, ag)}
                                  disabled={reimprimindoId === r.id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 3,
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: SISTEMA_COR, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                                    padding: 0, opacity: reimprimindoId === r.id ? 0.6 : 1,
                                  }}
                                >
                                  {reimprimindoId === r.id
                                    ? <Loader2 size={11} />
                                    : <Printer size={11} />}
                                  Ver/reimprimir
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* Mantido montado após primeira abertura — só visibility muda, evita re-init do SDK */}
                        {voaMontadoId === ag.id && (
                          <div style={{ display: voaAtivoId === ag.id ? 'block' : 'none' }}>
                            <VoaPluginView
                              ref={voaRef}
                              agendamentoId={ag.id}
                              doctorId={ag.profissional_id}
                              patientId={pacienteId}
                              voaClinicalType={ag.tipo_voa_clinical_type}
                              onFechar={encerrarVoa}
                              onDadosExtraidos={aplicarDadosVoa}
                              onDocumentoGerado={aplicarDocumentoVoa}
                              onStatusChange={(s: VoaStatus) => setVoaGravando(s === 'ready')}
                              onConsultaCriada={(voaId, tipo) => salvarVoaAtendimentoId(ag.id, voaId, tipo)}
                            />
                          </div>
                        )}
                        {voaAtivoId !== ag.id && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => abrirVoa(ag.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 7, width: 'fit-content',
                                padding: '9px 18px', fontSize: 13.5, fontWeight: 700,
                                backgroundColor: VOA_COR, border: 'none', borderRadius: 7,
                                cursor: 'pointer', color: '#fff',
                                boxShadow: `0 2px 6px ${VOA_COR}55`,
                              }}
                            >
                              <Mic size={16} />
                              {voaMontadoId === ag.id ? 'Retomar Voa' : 'Gravar com Voa'}
                            </button>
                            {voaMontadoId === ag.id && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!confirm('Encerrar a gravação da Voa desta consulta? Se ainda não copiou o documento gerado, você pode perder o conteúdo.')) return
                                  encerrarVoa()
                                }}
                                title="Encerra a gravação desta consulta — a Voa para de escutar em background"
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 5, width: 'fit-content',
                                  padding: '9px 14px', fontSize: 12.5, fontWeight: 600,
                                  background: 'none', border: `1px solid ${VOA_COR}`, borderRadius: 7,
                                  cursor: 'pointer', color: VOA_COR,
                                }}
                              >
                                <X size={14} /> Encerrar gravação
                              </button>
                            )}
                          </div>
                        )}

                        <div>
                          <button
                            type="button"
                            onClick={() => abrirSeletorAnexo(ag.id)}
                            disabled={enviandoAnexoId === ag.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4, width: 'fit-content',
                              padding: '5px 10px', fontSize: 11.5, fontWeight: 600,
                              backgroundColor: 'var(--cor-sucesso-bg)', border: '1px solid var(--cor-sucesso)', borderRadius: 4,
                              cursor: enviandoAnexoId === ag.id ? 'not-allowed' : 'pointer',
                              color: 'var(--cor-sucesso)', opacity: enviandoAnexoId === ag.id ? 0.6 : 1,
                            }}
                          >
                            {enviandoAnexoId === ag.id ? <Loader2 size={12} /> : <Paperclip size={12} />}
                            Anexar exame{voaMontadoId === ag.id && voaAtivoId === ag.id ? ' (envia também pra Voa)' : ''}
                          </button>

                          {!!anexos[ag.id]?.length && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {anexos[ag.id].map(anexo => (
                                <div key={anexo.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                  backgroundColor: 'var(--bg-input)', borderRadius: 5, fontSize: 12,
                                }}>
                                  <Paperclip size={13} style={{ color: 'var(--texto-terciario)', flexShrink: 0 }} />
                                  <a
                                    href={`/api/clinica/prontuarios/anexos/${anexo.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--cor-primaria)', fontWeight: 600 }}
                                  >
                                    {anexo.nome_arquivo}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => removerAnexo(ag, anexo)}
                                    style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cor-erro)', padding: 0 }}
                                    title="Remover anexo"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <CampoEdit label="Queixas"                value={form.queixas}                 onChange={v => setForm(f => ({ ...f, queixas: v }))} />
                        <CampoEdit label="HDA"                    value={form.hda}                     onChange={v => setForm(f => ({ ...f, hda: v }))} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <CampoEdit label="Antecedentes Familiares" value={form.antecedentes_familiares} onChange={v => setForm(f => ({ ...f, antecedentes_familiares: v }))} />
                          <CampoEdit label="Antecedentes Pessoais"   value={form.antecedentes_pessoais}   onChange={v => setForm(f => ({ ...f, antecedentes_pessoais: v }))} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <CampoEdit label="Hábitos"                value={form.habitos}                 onChange={v => setForm(f => ({ ...f, habitos: v }))} />
                          <CampoEdit label="Alergias"                value={form.alergias}                onChange={v => setForm(f => ({ ...f, alergias: v }))} />
                        </div>
                        <CampoEdit label="Exame Físico"            value={form.exame_fisico}            onChange={v => setForm(f => ({ ...f, exame_fisico: v }))} />
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <CampoEdit label="Peso (kg)"    area={false} placeholder="Ex: 80" value={form.peso}    onChange={v => setForm(f => ({ ...f, peso: v }))} />
                          <CampoEdit label="IMC"          area={false} placeholder="Ex: 24.5" value={form.imc}   onChange={v => setForm(f => ({ ...f, imc: v }))} />
                          <CampoEdit label="Pressão"      area={false} placeholder="Ex: 135x85mmHg" value={form.pressao} onChange={v => setForm(f => ({ ...f, pressao: v }))} />
                        </div>
                        <CampoEdit label="Exames"                  value={form.exames}                  onChange={v => setForm(f => ({ ...f, exames: v }))} />
                        <CampoEdit label="Diagnóstico"             value={form.diagnostico}             onChange={v => setForm(f => ({ ...f, diagnostico: v }))} />
                        <CampoEdit label="Medicação"               value={form.medicacao}               onChange={v => setForm(f => ({ ...f, medicacao: v }))} />
                        <CampoEdit label="Outras Condutas"         value={form.outras_condutas}         onChange={v => setForm(f => ({ ...f, outras_condutas: v }))} />

                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <button
                            type="button"
                            disabled={salvando}
                            onClick={() => salvar(ag)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '6px 12px', fontSize: 12, fontWeight: 600,
                              backgroundColor: 'var(--cor-primaria)', color: '#fff',
                              border: 'none', borderRadius: 4, cursor: salvando ? 'not-allowed' : 'pointer',
                              opacity: salvando ? 0.7 : 1,
                            }}
                          >
                            <Save size={13} /> {salvando ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelarEdicao}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '6px 12px', fontSize: 12,
                              background: 'none', border: '1px solid var(--borda-media)', borderRadius: 4,
                              cursor: 'pointer', color: 'var(--texto-secundario)',
                            }}
                          >
                            <X size={13} /> Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
