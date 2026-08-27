interface Props {
  nome: string
}

// Identificação da empresa logada, exibida no canto superior direito do dashboard.
// Só o nome — a logo da empresa já aparece no cabeçalho da sidebar
// (components/layout/Sidebar.tsx).
export default function EmpresaBadge({ nome }: Props) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexShrink: 0,
      padding: '8px 16px',
      backgroundColor: 'var(--cor-primaria-light)',
      border: '1px solid var(--borda-suave)',
      borderRadius: 999,
    }}>
      <span style={{
        fontSize: 14, fontWeight: 700, color: 'var(--cor-primaria-text)', flexShrink: 0,
        whiteSpace: 'nowrap',
      }}>
        {nome}
      </span>
    </div>
  )
}
