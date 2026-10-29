'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Eye, EyeOff, KeyRound, Save } from 'lucide-react'
import { alterarSenhaSchema, type AlterarSenhaInput } from '@/lib/validators/alterar-senha.schema'

function CampoSenha({
  label, placeholder, mostrar, onToggle, registro, erro, autoComplete,
}: {
  label:       string
  placeholder: string
  mostrar:     boolean
  onToggle:    () => void
  registro:    ReturnType<ReturnType<typeof useForm<AlterarSenhaInput>>['register']>
  erro?:       string
  autoComplete: 'current-password' | 'new-password'
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <KeyRound size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--texto-terciario)' }} />
        <input
          className={`input-field ${erro ? 'input-error' : ''}`}
          type={mostrar ? 'text' : 'password'}
          placeholder={placeholder}
          style={{ paddingLeft: 32, paddingRight: 36 }}
          autoComplete={autoComplete}
          {...registro}
        />
        <button type="button" onClick={onToggle} style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--texto-terciario)', display: 'flex',
        }}>
          {mostrar ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {erro && <div className="field-error">{erro}</div>}
    </div>
  )
}

export default function AlterarSenhaPage() {
  const [salvando, setSalvando] = useState(false)
  const [mostrar,  setMostrar]  = useState({ atual: false, nova: false, confirmar: false })

  const {
    register, handleSubmit, reset, formState: { errors },
  } = useForm<AlterarSenhaInput>({
    resolver:     zodResolver(alterarSenhaSchema),
    defaultValues: { senha_atual: '', senha_nova: '', confirmar_senha: '' },
  })

  async function onSubmit(data: AlterarSenhaInput) {
    setSalvando(true)
    try {
      const res  = await fetch('/api/auth/alterar-senha', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.erro ?? 'Erro ao alterar a senha'); return }
      toast.success('Senha alterada com sucesso!')
      reset({ senha_atual: '', senha_nova: '', confirmar_senha: '' })
      setMostrar({ atual: false, nova: false, confirmar: false })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Alterar Senha</h1>
          <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
            Defina uma nova senha de acesso para o seu usuário
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ maxWidth: 420 }}>
          <div className="card-header">
            <span className="card-title">Senha de acesso</span>
          </div>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <CampoSenha
                label="Senha atual" placeholder="Digite sua senha atual" autoComplete="current-password"
                mostrar={mostrar.atual} onToggle={() => setMostrar(m => ({ ...m, atual: !m.atual }))}
                registro={register('senha_atual')} erro={errors.senha_atual?.message}
              />
              <CampoSenha
                label="Nova senha" placeholder="Mínimo de 6 caracteres" autoComplete="new-password"
                mostrar={mostrar.nova} onToggle={() => setMostrar(m => ({ ...m, nova: !m.nova }))}
                registro={register('senha_nova')} erro={errors.senha_nova?.message}
              />
              <CampoSenha
                label="Confirmar nova senha" placeholder="Repita a nova senha" autoComplete="new-password"
                mostrar={mostrar.confirmar} onToggle={() => setMostrar(m => ({ ...m, confirmar: !m.confirmar }))}
                registro={register('confirmar_senha')} erro={errors.confirmar_senha?.message}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 20px', borderTop: '0.5px solid var(--borda-suave)' }}>
              <button type="submit" disabled={salvando} className="btn-primary" style={{ opacity: salvando ? 0.7 : 1 }}>
                <Save size={14} /> {salvando ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
