import { z } from 'zod'

export const alterarSenhaSchema = z.object({
  senha_atual:     z.string().min(1, 'Informe a senha atual'),
  senha_nova:      z.string().min(6, 'Mínimo de 6 caracteres'),
  confirmar_senha: z.string().min(1, 'Confirme a nova senha'),
}).refine(d => d.senha_nova === d.confirmar_senha, {
  message: 'As senhas não coincidem',
  path:    ['confirmar_senha'],
})

export type AlterarSenhaInput = z.infer<typeof alterarSenhaSchema>
