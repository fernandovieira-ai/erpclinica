export interface UsuarioChat {
  id:     number
  nome:   string
  perfil: string
}

export interface Conversa {
  usuario_id:            number
  nome:                   string
  perfil:                 string
  ultima_mensagem:        string | null
  ultima_mensagem_em:     string | null
  ultima_mensagem_de_mim: boolean
  nao_lidas:              number
  // true = mensagem endereçada ao grupo "Recepção" ainda sem ninguém ter assumido.
  // Visível a TODAS as recepcionistas simultaneamente (fila compartilhada) até a
  // primeira resposta; pra quem enviou, é a própria mensagem aguardando atendimento.
  pendente_grupo:        boolean
}

export interface Mensagem {
  id:               string  // tab_mensagem.id é BIGSERIAL — o driver pg devolve bigint como string
  remetente_id:     number
  destinatario_id:  number
  texto:            string
  lida_em:          string | null
  created_at:       string
}
