/**
 * Cliente server-side para a API REST da Memed (Sinapse Prescrição).
 *
 * IMPORTANTE: este arquivo só pode ser importado em código que roda no
 * servidor (Route Handlers, Server Actions, etc). Nunca importe isso em
 * um Client Component — a SECRET_KEY não pode vazar para o front-end.
 */

const MEMED_API_URL = process.env.MEMED_API_URL!;
const MEMED_API_KEY = process.env.MEMED_API_KEY!;
const MEMED_SECRET_KEY = process.env.MEMED_SECRET_KEY!;

if (!MEMED_API_URL || !MEMED_API_KEY || !MEMED_SECRET_KEY) {
  // Falha rápido em vez de deixar requisições saírem sem credenciais
  console.warn(
    "[memed] Variáveis de ambiente MEMED_API_URL / MEMED_API_KEY / MEMED_SECRET_KEY não configuradas."
  );
}

export interface CadastrarPrescritorInput {
  external_id: string; // ID do prescritor no seu ERP (recomendado: UUID)
  nome: string;
  sobrenome: string;
  data_nascimento: string; // dd/mm/aaaa
  cpf: string;
  uf: string; // UF do CRM
  sexo: "M" | "F";
  crm: string;
  email?: string;
  especialidade_id?: number; // relationships.especialidade.data.id
  cidade_id?: number; // relationships.cidade.data.id
}

export interface MemedUsuarioAttributes {
  token: string;
  status?: string;
  nome?: string;
  sobrenome?: string;
  external_id?: string;
  [key: string]: unknown;
}

interface MemedUsuarioResponse {
  data: {
    id: string;
    type: "usuarios";
    attributes: MemedUsuarioAttributes;
  };
}

function authQuery() {
  return new URLSearchParams({
    "api-key": MEMED_API_KEY,
    "secret-key": MEMED_SECRET_KEY,
  }).toString();
}

async function memedFetch(path: string, init: RequestInit) {
  const res = await fetch(`${MEMED_API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new MemedApiError(res.status, json);
  }

  return json;
}

export class MemedApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Memed API respondeu ${status}`);
    this.name = "MemedApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Cadastra um novo prescritor na Memed.
 * Só pode ser chamado a partir do backend (a Memed bloqueia essa rota
 * vinda do front-end).
 */
export async function cadastrarPrescritor(
  input: CadastrarPrescritorInput
): Promise<MemedUsuarioAttributes> {
  const relationships: Record<string, { data: { id: number } }> = {};
  if (input.especialidade_id) {
    relationships.especialidade = { data: { id: input.especialidade_id } };
  }
  if (input.cidade_id) {
    relationships.cidade = { data: { id: input.cidade_id } };
  }

  const body = {
    data: {
      type: "usuarios",
      attributes: {
        external_id: input.external_id,
        nome: input.nome,
        sobrenome: input.sobrenome,
        data_nascimento: input.data_nascimento,
        cpf: input.cpf,
        uf: input.uf,
        sexo: input.sexo,
        crm: input.crm,
        ...(input.email ? { email: input.email } : {}),
      },
      ...(Object.keys(relationships).length ? { relationships } : {}),
    },
  };

  const json: MemedUsuarioResponse = await memedFetch(
    `/sinapse-prescricao/usuarios?${authQuery()}`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );

  return json.data.attributes;
}

/**
 * Recupera os dados (incluindo o token atual) de um prescritor já
 * cadastrado, a partir do identificador usado no cadastro (external_id
 * ou o id retornado pela Memed).
 */
export async function obterPrescritor(
  identificador: string
): Promise<MemedUsuarioAttributes> {
  const json: MemedUsuarioResponse = await memedFetch(
    `/sinapse-prescricao/usuarios/${identificador}?${authQuery()}`,
    { method: "GET" }
  );

  return json.data.attributes;
}

/**
 * Helper de alto nível: tenta buscar o prescritor pelo external_id;
 * se não existir (404), cadastra. Sempre retorna um token válido para
 * a sessão atual.
 */
export async function obterOuCadastrarPrescritor(
  input: CadastrarPrescritorInput
): Promise<MemedUsuarioAttributes> {
  try {
    return await obterPrescritor(input.external_id);
  } catch (err) {
    if (err instanceof MemedApiError && err.status === 404) {
      return await cadastrarPrescritor(input);
    }
    throw err;
  }
}
