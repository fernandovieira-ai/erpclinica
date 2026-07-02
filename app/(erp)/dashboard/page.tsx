import { requireSession } from '@/lib/auth/server-session'
import { getDb } from '@/lib/db'
import SalaEsperaWidget from '@/components/clinica/SalaEsperaWidget'

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style:    'currency',
    currency: 'BRL',
  }).format(value)
}

export default async function DashboardPage() {
  const session = await requireSession()
  const db      = getDb(session.database_name)
  const id      = session.empresa_id_ativa

  let contasPagar   = 0
  let contasReceber = 0
  let saldoCaixa    = 0
  let saldoBanco    = 0

  try {
    const [rPagar, rReceber, rCaixa, rBanco] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(valor_original), 0) AS total
         FROM tab_titulo_pagar
         WHERE empresa_id = $1 AND status = 'A'`,
        [id],
      ),
      db.query(
        `SELECT COALESCE(SUM(valor_original), 0) AS total
         FROM tab_titulo_receber
         WHERE empresa_id = $1 AND status = 'A'`,
        [id],
      ),
      db.query(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'E' THEN valor ELSE -valor END), 0) AS saldo
         FROM tab_movimento_caixa
         WHERE empresa_id = $1`,
        [id],
      ),
      db.query(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'E' THEN valor ELSE -valor END), 0) AS saldo
         FROM tab_movimento_banco
         WHERE empresa_id = $1`,
        [id],
      ),
    ])

    contasPagar   = Number(rPagar.rows[0].total)
    contasReceber = Number(rReceber.rows[0].total)
    saldoCaixa    = Number(rCaixa.rows[0].saldo)
    saldoBanco    = Number(rBanco.rows[0].saldo)
  } catch (err) {
    console.error('[dashboard] erro ao carregar totais:', err)
  }

  const cards = [
    {
      label: 'Contas a Pagar',
      value: contasPagar,
      cor:   contasPagar > 0 ? 'var(--cor-erro)' : 'var(--texto-terciario)',
    },
    {
      label: 'Contas a Receber',
      value: contasReceber,
      cor:   contasReceber > 0 ? 'var(--cor-sucesso)' : 'var(--texto-terciario)',
    },
    {
      label: 'Saldo Caixa',
      value: saldoCaixa,
      cor:   saldoCaixa < 0 ? 'var(--cor-erro)' : saldoCaixa > 0 ? 'var(--cor-sucesso)' : 'var(--texto-terciario)',
    },
    {
      label: 'Saldo Banco',
      value: saldoBanco,
      cor:   saldoBanco < 0 ? 'var(--cor-erro)' : saldoBanco > 0 ? 'var(--cor-sucesso)' : 'var(--texto-terciario)',
    },
  ]

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="page-body">
        <div style={{ padding: '40px 0 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--texto-principal)', marginBottom: 4 }}>
            Bem-vindo, {session.nome}!
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {cards.map(({ label, value, cor }) => (
            <div key={label} className="stat-card">
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={{ fontSize: 18, color: cor }}>
                {formatBRL(value)}
              </div>
            </div>
          ))}
        </div>

        {/* Sala de espera */}
        <div style={{ marginTop: 20, maxWidth: 560 }}>
          <SalaEsperaWidget />
        </div>
      </div>
    </>
  )
}
