import { dbControl } from '@/lib/db'
import { formatDate } from '@/lib/utils'

interface Instancia {
  id:                   string
  slug:                 string
  nome:                 string
  dominio:              string
  plano:                string
  status:               string
  status_efetivo:       string
  porta:                number
  db_name:              string
  email_contato:        string | null
  limite_empresas:      number
  limite_usuarios:      number
  erp_version:          string | null
  trial_ate:            string | null
  dias_trial_restante:  number | null
  provisioned_at:       string
  last_seen_at:         string | null
  health_status:        string | null
  latencia_ms:          number | null
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ativo:          'badge-pago',
    trial:          'badge-info',
    suspenso:       'badge-vencido',
    cancelado:      'badge-cancelado',
    trial_expirado: 'badge-vencido',
  }
  const cls = map[status] ?? 'badge-cancelado'
  return <span className={`badge-status ${cls}`}>{status.replace('_', ' ')}</span>
}

function HealthDot({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: 'var(--texto-terciario)', fontSize: 12 }}>—</span>
  const color = status === 'ok' ? 'var(--cor-sucesso)' : status === 'degraded' ? 'var(--cor-aviso)' : 'var(--cor-erro)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, display: 'inline-block' }} />
      {status}
    </span>
  )
}

export default async function AdminPage() {
  const { rows } = await dbControl.query<Instancia>(`
    SELECT id, slug, nome, dominio, plano, status, status_efetivo,
           porta, db_name, email_contato, limite_empresas, limite_usuarios,
           erp_version, trial_ate, dias_trial_restante,
           provisioned_at, last_seen_at,
           health_status, latencia_ms
    FROM vw_painel_admin
    ORDER BY nome
  `)

  return (
    <>
      <div className="page-header" style={{ backgroundColor: '#1A1D27', borderBottomColor: 'rgba(255,255,255,0.06)' }}>
        <h1 className="page-title" style={{ color: '#F9FAFB' }}>Instâncias SaaS</h1>
        <div style={{ fontSize: 13, color: '#6B7280' }}>
          {rows.length} cliente{rows.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="page-body">
        <div style={{
          backgroundColor: '#1A1D27',
          border: '0.5px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          <div className="table-wrapper">
            <table className="table-base">
              <thead>
                <tr>
                  <th style={{ backgroundColor: '#111317', color: '#6B7280' }}>Cliente</th>
                  <th style={{ backgroundColor: '#111317', color: '#6B7280' }}>Slug / Database</th>
                  <th style={{ backgroundColor: '#111317', color: '#6B7280' }}>Plano</th>
                  <th style={{ backgroundColor: '#111317', color: '#6B7280' }}>Status</th>
                  <th style={{ backgroundColor: '#111317', color: '#6B7280' }}>Health</th>
                  <th style={{ backgroundColor: '#111317', color: '#6B7280' }}>Porta</th>
                  <th style={{ backgroundColor: '#111317', color: '#6B7280' }}>Provisionado</th>
                  <th style={{ backgroundColor: '#111317', color: '#6B7280' }}>Último acesso</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(inst => (
                  <tr key={inst.id}>
                    <td style={{ color: '#F9FAFB' }}>
                      <div style={{ fontWeight: 600 }}>{inst.nome}</div>
                      {inst.email_contato && (
                        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{inst.email_contato}</div>
                      )}
                    </td>
                    <td style={{ color: '#9CA3AF', fontFamily: 'monospace', fontSize: 12 }}>
                      <div>{inst.slug}</div>
                      <div style={{ color: '#4B5563' }}>{inst.db_name}</div>
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
                        color: '#60A5FA',
                      }}>
                        {inst.plano}
                      </span>
                      {inst.dias_trial_restante !== null && (
                        <div style={{ fontSize: 10, color: '#EF9F27', marginTop: 2 }}>
                          {inst.dias_trial_restante}d restantes
                        </div>
                      )}
                    </td>
                    <td><StatusBadge status={inst.status_efetivo} /></td>
                    <td><HealthDot status={inst.health_status} /></td>
                    <td style={{ color: '#9CA3AF', fontFamily: 'monospace', fontSize: 12 }}>{inst.porta}</td>
                    <td style={{ color: '#6B7280', fontSize: 12 }}>{formatDate(inst.provisioned_at)}</td>
                    <td style={{ color: '#6B7280', fontSize: 12 }}>
                      {inst.last_seen_at ? formatDate(inst.last_seen_at) : '—'}
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#6B7280' }}>
                      Nenhuma instância cadastrada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
