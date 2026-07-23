import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY nao configurada')
}

export const resend = new Resend(process.env.RESEND_API_KEY)

// EMAIL_FROM/EMAIL_REPLY_TO sao lidos de env - trocar de dominio depois e so mudar a env var, sem tocar no codigo
export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? 'VitaRF <noreply@digitalrf.com.br>'
export const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO ?? 'suporte@digitalrf.com.br'
