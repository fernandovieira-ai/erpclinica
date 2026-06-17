import { NextRequest, NextResponse } from 'next/server'

function fmtFone(raw?: string): string {
  if (!raw) return ''
  const n = raw.replace(/\D/g, '')
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`
  return raw
}

function fmtCep(raw?: string): string {
  const n = (raw ?? '').replace(/\D/g, '')
  return n.length === 8 ? `${n.slice(0,5)}-${n.slice(5)}` : (raw ?? '')
}

/** Normaliza resposta da BrasilAPI */
function normalizaBrasilAPI(d: Record<string, unknown>) {
  return {
    cnpj:              String(d.cnpj               ?? ''),
    razao_social:      String(d.razao_social        ?? ''),
    nome_fantasia:     String(d.nome_fantasia        ?? ''),
    situacao:          String(d.descricao_situacao_cadastral ?? ''),
    cep:               fmtCep(d.cep as string | undefined),
    logradouro:        String(d.logradouro          ?? ''),
    numero:            String(d.numero              ?? ''),
    complemento:       String(d.complemento         ?? ''),
    bairro:            String(d.bairro              ?? ''),
    cidade:            String(d.municipio           ?? ''),
    uf:                String(d.uf                  ?? ''),
    telefone:          fmtFone(d.ddd_telefone_1 as string | undefined),
    email:             String(d.email               ?? ''),
    optante_simples:   Boolean(d.opcao_pelo_simples ?? false),
    natureza_juridica: String(d.natureza_juridica   ?? ''),
  }
}

/** Normaliza resposta da open.cnpja.com */
function normalizaCnpja(d: Record<string, unknown>) {
  const address = (d.address ?? {}) as Record<string, unknown>
  const phones  = Array.isArray(d.phones) ? (d.phones as Record<string, unknown>[]) : []
  const emails  = Array.isArray(d.emails) ? (d.emails as Record<string, unknown>[]) : []
  const status  = (d.status ?? {}) as Record<string, unknown>
  const company = (d.company ?? {}) as Record<string, unknown>
  const nature  = (company.nature ?? {}) as Record<string, unknown>
  const simples = (d.simei ?? d.simples ?? {}) as Record<string, unknown>

  const rawFone = phones[0] ? `${phones[0].area ?? ''}${phones[0].number ?? ''}` : ''
  const rawEmail = emails[0] ? String(emails[0].address ?? '') : ''

  return {
    cnpj:              String(d.taxId             ?? ''),
    razao_social:      String(company.name        ?? ''),
    nome_fantasia:     String(d.alias             ?? ''),
    situacao:          String(status.text         ?? ''),
    cep:               fmtCep(address.zip as string | undefined),
    logradouro:        String(address.street      ?? ''),
    numero:            String(address.number      ?? ''),
    complemento:       String(address.details     ?? ''),
    bairro:            String(address.district    ?? ''),
    cidade:            String(address.city        ?? ''),
    uf:                String(address.state       ?? ''),
    telefone:          fmtFone(rawFone),
    email:             rawEmail,
    optante_simples:   Boolean(simples.optant     ?? false),
    natureza_juridica: String(nature.text         ?? ''),
  }
}

export async function GET(_req: NextRequest, { params }: { params: { cnpj: string } }) {
  const cnpj = params.cnpj.replace(/\D/g, '')

  if (cnpj.length !== 14) {
    return NextResponse.json({ erro: 'CNPJ deve ter 14 dígitos' }, { status: 400 })
  }

  // Consulta ambas as APIs em paralelo
  const [resBrasil, resCnpja] = await Promise.allSettled([
    fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    }),
    fetch(`https://open.cnpja.com/office/${cnpj}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    }),
  ])

  // Tenta BrasilAPI primeiro
  if (resBrasil.status === 'fulfilled' && resBrasil.value.ok) {
    const data = await resBrasil.value.json().catch(() => null)
    if (data) return NextResponse.json(normalizaBrasilAPI(data))
  }

  // Fallback: open.cnpja.com
  if (resCnpja.status === 'fulfilled' && resCnpja.value.ok) {
    const data = await resCnpja.value.json().catch(() => null)
    if (data) return NextResponse.json(normalizaCnpja(data))
  }

  // Tenta ler mensagem de erro da BrasilAPI
  if (resBrasil.status === 'fulfilled') {
    const data = await resBrasil.value.json().catch(() => null)
    const msg  = data?.message ?? data?.erro ?? `Erro ${resBrasil.value.status} ao consultar CNPJ`
    const status = resBrasil.value.status === 404 ? 404 : 502
    return NextResponse.json({ erro: msg }, { status })
  }

  return NextResponse.json({ erro: 'Erro ao consultar CNPJ' }, { status: 502 })
}
