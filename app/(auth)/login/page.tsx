'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'

const STORAGE_KEY = 'login_dados_salvos'

export default function LoginPage() {
  const router = useRouter()

  const [slug,  setSlug]  = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro,  setErro]  = useState('')
  const [loading, setLoading] = useState(false)
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [salvarDados, setSalvarDados] = useState(false)

  // Logo do cliente: buscada pelo identificador digitado (com debounce) e
  // exibida no lugar da logo do sistema quando o cliente tem uma cadastrada.
  const [slugLogo, setSlugLogo] = useState('')
  const [logoCliente, setLogoCliente] = useState<'idle' | 'carregando' | 'ok' | 'erro'>('idle')

  useEffect(() => {
    const salvo = localStorage.getItem(STORAGE_KEY)
    if (salvo) {
      try {
        const { slug: s, email: e } = JSON.parse(salvo)
        setSlug(s ?? '')
        setEmail(e ?? '')
        setSalvarDados(true)
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  useEffect(() => {
    const s = slug.trim()
    if (s.length < 2) {
      setSlugLogo('')
      setLogoCliente('idle')
      return
    }
    const t = setTimeout(() => setSlugLogo(s), 500)
    return () => clearTimeout(t)
  }, [slug])

  useEffect(() => {
    if (slugLogo) setLogoCliente('carregando')
  }, [slugLogo])

  const logoClienteUrl = slugLogo ? `/api/auth/branding/logo?slug=${encodeURIComponent(slugLogo)}` : ''
  const mostrarLogoCliente = logoCliente === 'ok'

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

      if (salvarDados) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ slug, email }))
      } else {
        localStorage.removeItem(STORAGE_KEY)
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

          {/* Marca — logo do cliente quando disponível, senão a do sistema */}
          <div className="auth-brand">
            {slugLogo && (
              <img
                key={logoClienteUrl}
                src={logoClienteUrl}
                alt=""
                className="auth-brand-cliente"
                onLoad={() => setLogoCliente('ok')}
                onError={() => setLogoCliente('erro')}
                style={{ display: mostrarLogoCliente ? 'block' : 'none' }}
              />
            )}
            {!mostrarLogoCliente && (
              <img src="/brand/logo-horizontal.svg" alt="VitaRF" height={36} style={{ display: 'inline-block' }} />
            )}
            <div className="auth-brand-legenda">Acesse sua conta</div>
            {mostrarLogoCliente && (
              <div className="auth-brand-powered">com tecnologia VitaRF</div>
            )}
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
              <div style={{ position: 'relative' }}>
                <input
                  className="input-field"
                  type={mostrarSenha ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  style={{ paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(v => !v)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', padding: 4, cursor: 'pointer',
                    color: 'var(--texto-terciario)',
                  }}
                >
                  {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 13, color: 'var(--texto-secundario)', cursor: 'pointer', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={salvarDados}
                  onChange={e => setSalvarDados(e.target.checked)}
                  style={{ width: 14, height: 14, accentColor: 'var(--cor-primaria)', cursor: 'pointer' }}
                />
                Salvar dados de acesso
              </label>

              <a
                href="/recuperar-senha"
                style={{ fontSize: 12, color: 'var(--cor-primaria)', textDecoration: 'none' }}
              >
                Esqueci minha senha
              </a>
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
        VitaRF © {new Date().getFullYear()}
      </div>
    </div>
  )
}
