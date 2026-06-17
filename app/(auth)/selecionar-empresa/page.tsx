'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Empresa {
  id:            number
  razao_social:  string
  nome_fantasia: string | null
}

export default function SelecionarEmpresaPage() {
  const router = useRouter()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading]   = useState(false)
  const [erro,    setErro]      = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('empresas_login')
    if (!raw) { router.push('/login'); return }
    setEmpresas(JSON.parse(raw))
  }, [router])

  async function selecionar(empresa_id: number) {
    setLoading(true)
    setErro('')
    try {
      const res  = await fetch('/api/auth/selecionar-empresa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id }),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.erro ?? 'Erro'); return }
      sessionStorage.removeItem('empresas_login')
      router.push(data.redir)
    } catch {
      setErro('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 480, padding: '0 16px' }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Selecionar empresa</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {empresas.length === 0 && (
            <div style={{ padding: 24, color: 'var(--texto-terciario)', textAlign: 'center' }}>
              Carregando...
            </div>
          )}
          {empresas.map(emp => (
            <button
              key={emp.id}
              onClick={() => selecionar(emp.id)}
              disabled={loading}
              style={{
                display: 'block', width: '100%', padding: '14px 20px',
                textAlign: 'left', background: 'none', border: 'none',
                borderBottom: '0.5px solid var(--borda-suave)',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--texto-principal)' }}>
                {emp.nome_fantasia ?? emp.razao_social}
              </div>
              {emp.nome_fantasia && (
                <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
                  {emp.razao_social}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <div style={{ marginTop: 12, padding: '10px 12px', backgroundColor: 'var(--cor-erro-bg)', color: 'var(--cor-erro)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
          {erro}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button
          onClick={() => router.push('/login')}
          className="btn-ghost"
          style={{ fontSize: 12 }}
        >
          Voltar ao login
        </button>
      </div>
    </div>
  )
}
