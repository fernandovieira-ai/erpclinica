// Detecção de possível cadastro duplicado de paciente por nome + telefone + data de
// nascimento — necessário porque o CPF deixou de ser obrigatório no agendamento.

export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Reduz o telefone a DDD+número, removendo DDI (55) e zero inicial, pra comparar
// números salvos em formatos diferentes ((11) 98888-7777 vs 5511988887777 etc).
export function normalizarTelefoneDigits(fone: string | null | undefined): string {
  let d = (fone ?? '').replace(/\D/g, '')
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2)
  if (d.length > 11 && d.startsWith('0')) d = d.slice(1)
  return d
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}

// 0 = totalmente diferente, 1 = idêntico (após normalizar acentos/caixa/espaços)
export function similaridadeNomes(a: string, b: string): number {
  const na = normalizarNome(a)
  const nb = normalizarNome(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const maxLen = Math.max(na.length, nb.length)
  return Math.max(0, 1 - levenshtein(na, nb) / maxLen)
}

export interface CandidatoPaciente {
  id:              number
  nome:            string
  cpf_cnpj:        string | null
  celular:         string | null
  telefone:        string | null
  data_nascimento: string | null
}

export interface ResultadoDuplicidade extends CandidatoPaciente {
  score:   number
  nivel:   'ALTA' | 'MEDIA'
  motivos: string[]
}

// Regras (conservadoras — só classifica como duplicidade quando pelo menos dois
// sinais independentes concordam, ou quando o nome está praticamente idêntico):
//   ALTA  = nome muito parecido (>=90%) E (telefone OU nascimento bate)
//           OU telefone E nascimento batem (mesmo com nome diferente — ex: apelido)
//   MEDIA = nome praticamente idêntico (>=97%) sozinho
//           OU nome moderadamente parecido (>=75%) E (telefone OU nascimento bate)
export function avaliarDuplicidade(
  candidato: CandidatoPaciente,
  input: { nome: string; data_nascimento?: string | null; celular?: string | null },
): ResultadoDuplicidade | null {
  const simNome = similaridadeNomes(candidato.nome, input.nome)

  const telInput    = normalizarTelefoneDigits(input.celular)
  const telCelular   = normalizarTelefoneDigits(candidato.celular)
  const telFixo      = normalizarTelefoneDigits(candidato.telefone)
  const telefoneIgual = telInput.length >= 8 && (telInput === telCelular || telInput === telFixo)

  const dataIgual = !!input.data_nascimento && !!candidato.data_nascimento &&
    String(candidato.data_nascimento).slice(0, 10) === input.data_nascimento

  let nivel: 'ALTA' | 'MEDIA' | null = null
  if ((simNome >= 0.90 && (telefoneIgual || dataIgual)) || (telefoneIgual && dataIgual)) {
    nivel = 'ALTA'
  } else if (simNome >= 0.97 || (simNome >= 0.75 && (telefoneIgual || dataIgual))) {
    nivel = 'MEDIA'
  }
  if (!nivel) return null

  const motivos: string[] = []
  if (simNome >= 0.75) motivos.push(`Nome parecido (${Math.round(simNome * 100)}%)`)
  if (dataIgual) motivos.push('Mesma data de nascimento')
  if (telefoneIgual) motivos.push('Mesmo telefone/celular')

  return {
    ...candidato,
    score: simNome * 0.6 + (telefoneIgual ? 0.25 : 0) + (dataIgual ? 0.15 : 0),
    nivel,
    motivos,
  }
}
