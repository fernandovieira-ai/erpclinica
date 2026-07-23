import { Resend } from 'resend'

// Lazy: NÃO checar/instanciar no carregamento do módulo. O Next.js avalia
// módulos de rota durante "Collecting page data" no build de produção mesmo
// sem a rota ser chamada — um throw aqui em cima quebra o build inteiro em
// qualquer ambiente sem RESEND_API_KEY configurada (ex: Railway antes do setup).
let _resend: Resend | null = null

export function getResend(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY nao configurada')
    }
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

// EMAIL_FROM/EMAIL_REPLY_TO sao lidos de env - trocar de dominio depois e so mudar a env var, sem tocar no codigo
export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? 'VitaRF <noreply@digitalrf.com.br>'
export const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO ?? 'suporte@digitalrf.com.br'
