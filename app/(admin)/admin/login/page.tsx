'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield } from 'lucide-react'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email,   setEmail]   = useState('')
  const [senha,   setSenha]   = useState('')
  const [erro,    setErro]    = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const res  = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.erro ?? 'Erro'); return }
      router.push(data.redir)
    } catch {
      setErro('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0F1117',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 380, padding: '0 16px' }}>
        <div style={{
          backgroundColor: '#1A1D27',
          border: '0.5px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          overflow: 'hidden',
        }}>
          <div style={{ padding: 32 }}>
            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  backgroundColor: '#1E40AF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Shield size={22} color="#93C5FD" />
                </div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#F9FAFB' }}>
                DigitalRF Admin
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                Painel de controle SaaS
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: 4 }}>
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="admin@digitalrf.com.br"
                  style={{
                    width: '100%', padding: '8px 12px',
                    backgroundColor: '#111317', color: '#F9FAFB',
                    border: '0.5px solid rgba(255,255,255,0.12)',
                    borderRadius: 8, fontSize: 13, outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9CA3AF', marginBottom: 4 }}>
                  Senha
                </label>
                <input
                  type="password"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: '100%', padding: '8px 12px',
                    backgroundColor: '#111317', color: '#F9FAFB',
                    border: '0.5px solid rgba(255,255,255,0.12)',
                    borderRadius: 8, fontSize: 13, outline: 'none',
                  }}
                />
              </div>

              {erro && (
                <div style={{ padding: '10px 12px', backgroundColor: '#3B0A0A', color: '#FCA5A5', borderRadius: 8, fontSize: 13 }}>
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '9px 16px', marginTop: 4,
                  backgroundColor: '#1D4ED8', color: '#fff',
                  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Entrando...' : 'Entrar no Admin'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
