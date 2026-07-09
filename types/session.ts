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
