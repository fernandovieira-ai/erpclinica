import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBRL(value: number | string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date
  return d.toLocaleDateString('pt-BR')
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('pt-BR')
}

export function formatCpfCnpj(v: string | null | undefined): string {
  if (!v) return '—'
  const digits = v.replace(/\D/g, '')
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return v
}

// Máscara progressiva de celular (DDD + 9 dígitos) pra digitação/exibição — mesmo padrão
// de chained .replace usado em mascaraCpfCnpj (components/cadastro/PessoaFormPage.tsx).
// Guarda-se só dígitos no banco; isso é só a formatação pra tela.
export function maskCelular(valor: string): string {
  const d = (valor ?? '').replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

// Formato E.164 (+55DDDNNNNNNNNN) pra devolver celular em API externa (ex.: integração
// Pander/GoHighLevel — ver pedido-api-vita.pdf item 3). Número de 10 dígitos (sem o 9 do
// celular, comum em cadastro legado) recebe o 9 inserido depois do DDD.
export function formatCelularE164(celular: string | null | undefined): string | null {
  if (!celular) return null
  let d = celular.replace(/\D/g, '')
  if (d.length === 10) d = d.slice(0, 2) + '9' + d.slice(2)
  if (d.length !== 11) return null
  return `+55${d}`
}
