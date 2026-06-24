'use client'

import { forwardRef } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { X } from 'lucide-react'
import type { AgendamentoListItem } from '@/types/clinica.types'

interface Pessoa {
  id: number
  nome: string
  nome_fantasia?: string
  tipo_pessoa: string
  cpf_cnpj?: string
  data_nascimento?: string
  sexo?: string
  cor_raca?: string
  estado_civil?: string
  naturalidade?: string
  rg_ie?: string
  im?: string
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  uf?: string
  telefone?: string
  celular?: string
  whatsapp?: string
  email?: string
  foto?: string | null
}

interface Props {
  open: boolean
  paciente?: Pessoa | null
  agendamento?: AgendamentoListItem | null
  onClose: () => void
}

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ style, ...props }, ref) {
    return (
      <input
        ref={ref}
        {...props}
        readOnly
        style={{
          width: '100%', padding: '6px 8px',
          backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
          border: '0.5px solid var(--borda-media)', borderRadius: 4,
          fontSize: 12, fontFamily: 'var(--fonte-sans)',
          outline: 'none',
          ...style,
        }}
      />
    )
  }
)

const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ style, ...props }, ref) {
    return (
      <select
        ref={ref}
        {...props}
        disabled
        style={{
          width: '100%', padding: '6px 8px',
          backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)',
          border: '0.5px solid var(--borda-media)', borderRadius: 4,
          fontSize: 12,
          cursor: 'default',
          ...style,
        }}
      />
    )
  }
)

function FormRow({ label, children, fullWidth }: { label: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: fullWidth ? '1fr' : '100px 1fr',
      alignItems: 'flex-start',
      gap: '0 12px',
      marginBottom: 12,
    }}>
      <label style={{
        textAlign: 'right', fontSize: 11, fontWeight: 600,
        color: 'var(--texto-terciario)', whiteSpace: 'nowrap',
        paddingTop: 6,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
      }}>
        {label}
      </label>
      <div>{children}</div>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 12, fontWeight: 700, color: 'var(--texto-principal)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        paddingBottom: 12, borderBottom: '0.5px solid var(--borda-suave)',
        marginBottom: 12,
      }}>
        {titulo}
      </div>
      <div>{children}</div>
    </div>
  )
}

export default function PacienteCheckInModal({ open, paciente, agendamento, onClose }: Props) {
  if (!open || !paciente) return null

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
      padding: 16,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 8,
        maxWidth: 1100,
        width: '100%',
        maxHeight: '95vh',
        overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '0.5px solid var(--borda-suave)',
          flexShrink: 0,
        }}>
          <div>
            <h1 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 700, color: 'var(--texto-principal)' }}>
              {paciente.nome}
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--texto-terciario)' }}>
              Check-in de paciente
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '8px', borderRadius: 6,
              color: 'var(--texto-terciario)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Coluna esquerda */}
            <div>
              <Secao titulo="Informações Pessoais">
                <FormRow label="Nome Completo">
                  <Input value={paciente.nome || ''} type="text" />
                </FormRow>
                <FormRow label="CPF">
                  <Input value={paciente.cpf_cnpj || ''} type="text" />
                </FormRow>
                <FormRow label="Data Nascimento">
                  <Input
                    value={paciente.data_nascimento ? format(parseISO(paciente.data_nascimento), 'dd/MM/yyyy') : ''}
                    type="text"
                  />
                </FormRow>
                <FormRow label="Sexo">
                  <Select value={paciente.sexo || ''}>
                    <option value="">-</option>
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                    <option value="O">Outro</option>
                  </Select>
                </FormRow>
                <FormRow label="Cor/Raça">
                  <Input value={paciente.cor_raca || ''} type="text" />
                </FormRow>
                <FormRow label="Estado Civil">
                  <Select value={paciente.estado_civil || ''}>
                    <option value="">-</option>
                    <option value="Solteiro(a)">Solteiro(a)</option>
                    <option value="Casado(a)">Casado(a)</option>
                    <option value="Divorciado(a)">Divorciado(a)</option>
                    <option value="Viúvo(a)">Viúvo(a)</option>
                    <option value="Separado(a)">Separado(a)</option>
                    <option value="Solteiro(a)e">Solteiro(a)</option>
                  </Select>
                </FormRow>
                <FormRow label="Naturalidade">
                  <Input value={paciente.naturalidade || ''} type="text" />
                </FormRow>
              </Secao>
            </div>

            {/* Coluna direita */}
            <div>
              <Secao titulo="Contato e Endereço">
                <FormRow label="Telefone">
                  <Input value={paciente.telefone || ''} type="text" />
                </FormRow>
                <FormRow label="Celular">
                  <Input value={paciente.celular || ''} type="text" />
                </FormRow>
                <FormRow label="WhatsApp">
                  <Input value={paciente.whatsapp || ''} type="text" />
                </FormRow>
                <FormRow label="Email">
                  <Input value={paciente.email || ''} type="email" />
                </FormRow>
                <FormRow label="CEP">
                  <Input value={paciente.cep || ''} type="text" />
                </FormRow>
                <FormRow label="Logradouro">
                  <Input value={paciente.logradouro || ''} type="text" />
                </FormRow>
                <FormRow label="Número">
                  <Input value={paciente.numero || ''} type="text" />
                </FormRow>
                <FormRow label="Complemento">
                  <Input value={paciente.complemento || ''} type="text" />
                </FormRow>
                <FormRow label="Bairro">
                  <Input value={paciente.bairro || ''} type="text" />
                </FormRow>
                <FormRow label="Cidade">
                  <Input value={paciente.cidade || ''} type="text" />
                </FormRow>
                <FormRow label="UF">
                  <Input value={paciente.uf || ''} type="text" />
                </FormRow>
              </Secao>
            </div>
          </div>

          {/* Informações do Agendamento */}
          {agendamento && (
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: '0.5px solid var(--borda-suave)' }}>
              <Secao titulo="Agendamento">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                  <FormRow label="Profissional" fullWidth>
                    <div style={{
                      padding: '6px 8px',
                      backgroundColor: 'var(--bg-hover)',
                      borderRadius: 4,
                      fontSize: 12,
                      color: 'var(--texto-principal)',
                      fontWeight: 500,
                    }}>
                      {agendamento.profissional_nome}
                    </div>
                  </FormRow>
                  <FormRow label="Tipo" fullWidth>
                    <div style={{
                      padding: '6px 8px',
                      backgroundColor: 'var(--bg-hover)',
                      borderRadius: 4,
                      fontSize: 12,
                      color: 'var(--texto-principal)',
                      fontWeight: 500,
                    }}>
                      {agendamento.tipo_descricao || '-'}
                    </div>
                  </FormRow>
                  <FormRow label="Horário" fullWidth>
                    <div style={{
                      padding: '6px 8px',
                      backgroundColor: 'var(--bg-hover)',
                      borderRadius: 4,
                      fontSize: 12,
                      color: 'var(--texto-principal)',
                      fontWeight: 700,
                    }}>
                      {format(parseISO(agendamento.data_hora_inicio), 'HH:mm')}
                    </div>
                  </FormRow>
                  <FormRow label="Categoria" fullWidth>
                    <div style={{
                      padding: '6px 8px',
                      backgroundColor: 'var(--bg-hover)',
                      borderRadius: 4,
                      fontSize: 12,
                      color: 'var(--texto-principal)',
                      fontWeight: 500,
                    }}>
                      {agendamento.categoria_descricao || '-'}
                    </div>
                  </FormRow>
                </div>
              </Secao>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 12,
          padding: '16px 24px',
          borderTop: '0.5px solid var(--borda-suave)',
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 6,
              border: '0.5px solid var(--borda-media)',
              background: 'white', color: 'var(--texto-principal)',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'background 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'white' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
