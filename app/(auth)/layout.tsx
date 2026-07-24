export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', backgroundColor: 'var(--bg-page)' }}>

      {/* Painel de imagem — só em telas largas (>=900px, ver globals.css) */}
      <div
        className="auth-image-panel"
        style={{
          position: 'relative',
          flexDirection: 'column',
          backgroundImage: 'url(/brand/login-bg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(11,58,53,0.55) 0%, rgba(11,58,53,0.05) 30%, rgba(11,58,53,0.05) 60%, rgba(11,58,53,0.75) 100%)',
        }} />

        <div style={{ position: 'relative', zIndex: 1, padding: 40 }}>
          <img src="/brand/logo-horizontal-branca.svg" alt="VitaRF" height={32} />
        </div>

        <div style={{
          position: 'relative', zIndex: 1, marginTop: 'auto', padding: '0 40px 40px',
          color: '#fff',
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>
            Gestão completa para sua clínica
          </div>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 8 }}>
            Agenda, prontuário, financeiro e faturamento em um só lugar.
          </div>
        </div>
      </div>

      {/* Painel do formulário */}
      <div
        className="auth-form-panel"
        style={{
          flex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px 16px',
        }}
      >
        {children}
      </div>

    </div>
  )
}
