// Cliente server-side para a API REST da Memed (Sinapse Prescricao).
// Nunca importar isso em um Client Component - a secret-key nao pode vazar
// para o front-end (ela vem de tab_empresa, por tenant, nunca de env var).

// Homologação: https://doc.memed.com.br/docs/primeiros-passos — produção usa outro
// endpoint, fornecido pela Memed junto das chaves de produção (setar MEMED_API_URL).
const MEMED_API_URL = process.env.MEMED_API_URL || 'https://integrations.api.memed.com.br/v1'

export interface MemedCredenciais {
  apiKey:    string
  secretKey: string
}

export interface CadastrarPrescritorInput {
  external_id:     string
  nome:            string
  sobrenome:       string
  data_nascimento: string // dd/mm/aaaa
  cpf:             string
  uf:              string // UF do CRM
  sexo:            'M' | 'F'
  crm:             string
  email?:          string
}

export interface MemedUsuarioAttributes {
  // id interno do usuario na Memed (json.data.id) - diferente do external_id (o nosso,
  // ex: "PROF-4"), guardado separado pra nao confundir os dois em tab_memed_prescritor.
  memedId:    string
  token:      string
  status?:    string
  nome?:      string
  sobrenome?: string
  external_id?: string
  [key: string]: unknown
}

interface MemedUsuarioResponse {
  data: {
    id:         string
    type:       'usuarios'
    attributes: MemedUsuarioAttributes
  }
}

export class MemedApiError extends Error {
  status: number
  body:   unknown
  constructor(status: number, body: unknown) {
    super(`Memed API respondeu ${status}`)
    this.name = 'MemedApiError'
    this.status = status
    this.body = body
  }
}

function authQuery(cred: MemedCredenciais) {
  return new URLSearchParams({ 'api-key': cred.apiKey, 'secret-key': cred.secretKey }).toString()
}

async function memedFetch(path: string, init: RequestInit) {
  const res = await fetch(`${MEMED_API_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/vnd.api+json', 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new MemedApiError(res.status, json)
  return json
}

export async function cadastrarPrescritor(
  input: CadastrarPrescritorInput, cred: MemedCredenciais,
): Promise<MemedUsuarioAttributes> {
  const body = {
    data: {
      type: 'usuarios',
      attributes: {
        external_id:     input.external_id,
        nome:            input.nome,
        sobrenome:       input.sobrenome,
        data_nascimento: input.data_nascimento,
        cpf:             input.cpf,
        uf:              input.uf,
        sexo:            input.sexo,
        crm:             input.crm,
        ...(input.email ? { email: input.email } : {}),
      },
    },
  }
  const json: MemedUsuarioResponse = await memedFetch(
    `/sinapse-prescricao/usuarios?${authQuery(cred)}`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  return { ...json.data.attributes, memedId: json.data.id }
}

export async function obterPrescritor(
  identificador: string, cred: MemedCredenciais,
): Promise<MemedUsuarioAttributes> {
  const json: MemedUsuarioResponse = await memedFetch(
    `/sinapse-prescricao/usuarios/${identificador}?${authQuery(cred)}`,
    { method: 'GET' },
  )
  return { ...json.data.attributes, memedId: json.data.id }
}

// Tenta buscar o prescritor pelo external_id; se nao existir (404), cadastra.
// Sempre retorna um token valido para a sessao atual.
export async function obterOuCadastrarPrescritor(
  input: CadastrarPrescritorInput, cred: MemedCredenciais,
): Promise<MemedUsuarioAttributes> {
  try {
    return await obterPrescritor(input.external_id, cred)
  } catch (err) {
    if (err instanceof MemedApiError && err.status === 404) {
      return await cadastrarPrescritor(input, cred)
    }
    throw err
  }
}

// tab_pessoa.nome e um campo unico; a Memed pede nome/sobrenome separados.
export function splitNome(nomeCompleto: string): { nome: string; sobrenome: string } {
  const partes = nomeCompleto.trim().split(/\s+/)
  const primeiroNome = partes[0] ?? ''
  return { nome: primeiroNome, sobrenome: partes.slice(1).join(' ') || primeiroNome }
}

// tab_pessoa.data_nascimento e YYYY-MM-DD; a Memed espera dd/mm/aaaa.
export function paraDataBr(iso: string | null): string {
  if (!iso) return ''
  const [ano, mes, dia] = iso.split('-')
  if (!ano || !mes || !dia) return ''
  return `${dia}/${mes}/${ano}`
}
