import { getResend, EMAIL_FROM, EMAIL_REPLY_TO } from './resend'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

function templateRecuperacaoSenha(dados: { nome: string; urlRedefinir: string }) {
  const subject = 'Recuperação de senha'
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="color: #12857A; margin-bottom: 4px;">Recuperação de senha</h2>
      <p>Olá, ${dados.nome},</p>
      <p>Recebemos uma solicitação para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha:</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${dados.urlRedefinir}"
           style="background-color: #12857A; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
          Redefinir senha
        </a>
      </p>
      <p style="font-size: 13px; color: #666666;">Este link expira em 1 hora. Se você não solicitou essa alteração, apenas ignore este e-mail.</p>
    </div>
  `
  return { subject, html }
}

export async function emailRecuperacaoSenha(dados: {
  email: string
  nome: string
  token: string
}) {
  const urlRedefinir = `${BASE_URL}/redefinir-senha?token=${dados.token}`
  const { subject, html } = templateRecuperacaoSenha({ nome: dados.nome, urlRedefinir })

  return getResend().emails.send({
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
    to: dados.email,
    subject,
    html,
  })
}
