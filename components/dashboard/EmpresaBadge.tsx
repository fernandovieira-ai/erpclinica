interface Props {
  nome: string
  logoBase64: string | null
}

// Identificação da empresa logada, exibida no canto superior direito do dashboard.
// Não confundir com a logo do sistema (fixa, em components/layout/Sidebar.tsx).
export default function EmpresaBadge({ nome, logoBase64 }: Props) {
  const iniciais = nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase()

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      padding: '4px 16px 4px 4px',
      backgroundColor: 'var(--cor-primaria-light)',
      border: '1px solid var(--borda-suave)',
      borderRadius: 999,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: logoBase64 ? '#fff' : 'var(--cor-primaria)', color: '#fff',
        fontSize: 13, fontWeight: 700,
        boxShadow: logoBase64 ? 'inset 0 0 0 1px var(--borda-suave)' : undefined,
      }}>
        {logoBase64
          ? <img src={logoBase64} alt={nome} style={{ width: '92%', height: '92%', objectFit: 'contain' }} />
          : iniciais}
      </div>
      <span style={{
        fontSize: 14, fontWeight: 700, color: 'var(--cor-primaria-text)', flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
        {nome}
      </span>
    </div>
  )
}
