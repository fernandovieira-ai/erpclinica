'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'

function RedefinirSenhaForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')

    if (senha.length < 6) {
      setErro('A senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (senha !== confirmar) {
      setErro('As senhas não conferem.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/redefinir-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, senha }),
      })
      const data = await res.json()

      if (!res.ok) {
        setErro(data.erro ?? 'Erro ao redefinir senha.')
        return
      }

      setSucesso(true)
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
              Nova senha
            </div>
          </div>

          {sucesso ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', padding: '8px 0' }}>
              <CheckCircle size={40} color="var(--cor-primaria)" />
              <div style={{ fontSize: 14, color: 'var(--texto-principal)', fontWeight: 600 }}>
                Senha redefinida com sucesso!
              </div>
              <button
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={() => router.push('/login')}
              >
                Ir para o login
              </button>
            </div>
          ) : !token ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', padding: '8px 0' }}>
              <AlertCircle size={40} color="var(--cor-erro)" />
              <div style={{ fontSize: 14, color: 'var(--texto-principal)', fontWeight: 600 }}>
                Link inválido
              </div>
              <div style={{ fontSize: 12, color: 'var(--texto-terciario)' }}>
                Este link é inválido ou expirou. Solicite um novo link de recuperação.
              </div>
              <button
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={() => router.push('/recuperar-senha')}
              >
                Solicitar novo link
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              <div>
                <label className="field-label">Nova senha</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input-field"
                    type={mostrarSenha ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    required
                    autoFocus
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

              <div>
                <label className="field-label">Confirmar nova senha</label>
                <input
                  className="input-field"
                  type={mostrarSenha ? 'text' : 'password'}
                  placeholder="Repita a senha"
                  value={confirmar}
                  onChange={e => setConfirmar(e.target.value)}
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
                {loading ? 'Salvando...' : 'Salvar nova senha'}
              </button>

            </form>
          )}

        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--texto-terciario)' }}>
        VitaRF © {new Date().getFullYear()}
      </div>
    </div>
  )
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense>
      <RedefinirSenhaForm />
    </Suspense>
  )
}
