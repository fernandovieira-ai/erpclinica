export interface Session {
  usuario_id:       number
  database_name:    string   // ex: "fin_clienteabc"
  empresa_id_ativa: number
  perfil:           'admin' | 'financeiro' | 'operador'
  modulos:          string[]
  nome:             string
  email:            string
  profissional_id:  number | null   // vincula o usuário a um tab_pessoa (profissional) para pré-filtrar agenda/atendimentos
}

export interface AdminSession {
  admin_id: number
  email:    string
  nome:     string
}

// Payload intermediário — gerado no login quando há N empresas
// Armazenado no cookie 'select_token' até o usuário escolher a empresa
export interface SelectToken {
  database_name:   string
  usuario_id:      number
  nome:            string
  email:           string
  perfil:          Session['perfil']
  modulos:         string[] | null
  profissional_id: number | null
}

// Token de recuperação de senha — stateless, carrega o tenant (database_name)
// porque email não é único entre clientes (multi-tenant).
// pwd_v é uma fingerprint do senha_hash no momento da emissão — se a senha for
// trocada (por este link ou por qualquer outro meio) antes do token expirar,
// pwd_v não bate mais na verificação e o token vira inválido (token de uso único
// sem precisar de tabela/estado no banco).
export interface PasswordResetToken {
  type:          'password_reset'
  usuario_id:    number
  database_name: string
  pwd_v:         string
}
