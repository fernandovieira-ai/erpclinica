'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'

export default function RecuperarSenhaPage() {
  const router = useRouter()

  const [slug, setSlug]   = useState('')
  const [email, setEmail] = useState('')
  const [erro, setErro]   = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/recuperar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao solicitar recuperação')
        return
      }

      setEnviado(true)
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

          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <img src="/brand/logo-horizontal.svg" alt="VitaRF" height={36} style={{ display: 'inline-block' }} />
            <div style={{ fontSize: 13, color: 'var(--texto-terciario)', marginTop: 8 }}>
              Recuperar senha
            </div>
          </div>

          {enviado ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', padding: '8px 0' }}>
              <CheckCircle size={40} color="var(--cor-primaria)" />
              <div style={{ fontSize: 14, color: 'var(--texto-principal)', fontWeight: 600 }}>
                Se os dados estiverem corretos, enviamos um e-mail com o link para redefinir sua senha.
              </div>
              <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>
                O link expira em 1 hora.
              </div>
            </div>
          ) : (
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
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>

            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button onClick={() => router.push('/login')} className="btn-ghost" style={{ fontSize: 12 }}>
              Voltar ao login
            </button>
          </div>

        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--texto-terciario)' }}>
        VitaRF © {new Date().getFullYear()}
      </div>
    </div>
  )
}
