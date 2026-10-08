'use client'

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

interface Props {
  nome: string
  tamanho?: number
}

// Mesmo visual do avatar em Cadastro de Usuários (app/(erp)/usuarios/page.tsx) —
// círculo com gradiente da cor primária e iniciais do nome. Não existe um
// componente <Avatar/> compartilhado no projeto pra importar de lá, então
// replica aqui o mesmo estilo (gradiente 135deg, iniciais brancas em negrito).
export default function AvatarUsuario({ nome, tamanho = 34 }: Props) {
  return (
    <div style={{
      width: tamanho, height: tamanho, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--cor-primaria), var(--cor-primaria-hover))',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(tamanho * 0.35), fontWeight: 700,
    }}>
      {iniciais(nome)}
    </div>
  )
}
