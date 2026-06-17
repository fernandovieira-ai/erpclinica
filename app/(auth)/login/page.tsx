'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  const [slug,  setSlug]  = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro,  setErro]  = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)

    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email, senha }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao fazer login')
        return
      }

      if (data.status === 'ok') {
        router.push(data.redir)
        return
      }

      if (data.status === 'select_empresa') {
        // Salva lista temporária e redireciona para o seletor
        sessionStorage.setItem('empresas_login', JSON.stringify(data.empresas))
        router.push('/selecionar-empresa')
      }
    } catch {
      setErro('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 400, padding: '0 16px' }}>
      <div className="card">
        <div className="card-body" style={{ padding: 32 }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--cor-primaria)' }}>
              DigitalRF Financeiro
            </div>
            <div style={{ fontSize: 13, color: 'var(--texto-terciario)', marginTop: 4 }}>
              Acesse sua conta
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <label className="field-label">Identificador do cliente</label>
              <input
                className="input-field"
                type="text"
                placeholder="ex: minha-empresa"
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().trim())}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="field-label">E-mail</label>
              <input
                className="input-field"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="field-label">Senha</label>
              <input
                className="input-field"
                type="password"
                placeholder="••••••••"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
              />
            </div>

            {erro && (
              <div style={{
                padding: '10px 12px',
                backgroundColor: 'var(--cor-erro-bg)',
                color: 'var(--cor-erro)',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
              }}>
                {erro}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

          </form>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--texto-terciario)' }}>
        DigitalRF © {new Date().getFullYear()}
      </div>
    </div>
  )
}
