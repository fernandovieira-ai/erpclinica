'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { X, User, MapPin, Phone, Landmark, FileText } from 'lucide-react'
import { pessoaSchema, type PessoaInput } from '@/lib/validators/pessoa.schema'
import type { Pessoa } from '@/types/cadastros.types'

interface Props {
  pessoa:    Pessoa | null   // null = novo
  onClose:   () => void
  onSaved:   () => void
}

const SECTIONS = ['Dados', 'Endereço', 'Contato', 'Financeiro', 'Fiscal'] as const
type Section = typeof SECTIONS[number]

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export default function PessoaModal({ pessoa, onClose, onSaved }: Props) {
  const [aba, setAba]         = useState<Section>('Dados')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<PessoaInput>({
    resolver: zodResolver(pessoaSchema),
    defaultValues: {
      tipo_pessoa: 'J', ind_cliente: false, ind_fornecedor: false,
      ind_banco: false, ind_transportador: false,
      profissao: '', altura: null, peso: null,
      limite_credito: 0, contribuinte_icms: false, optante_simples: false,
    },
  })

  useEffect(() => {
    if (pessoa) {
      reset({
        tipo_pessoa:        pessoa.tipo_pessoa,
        nome:               pessoa.nome,
        nome_fantasia:      pessoa.nome_fantasia ?? '',
        cpf_cnpj:           pessoa.cpf_cnpj ?? '',
        rg_ie:              pessoa.rg_ie ?? '',
        im:                 pessoa.im ?? '',
        profissao:          pessoa.profissao ?? '',
        altura:             pessoa.altura != null ? Number(pessoa.altura) : null,
        peso:               pessoa.peso   != null ? Number(pessoa.peso)   : null,
        ind_cliente:        pessoa.ind_cliente,
        ind_fornecedor:     pessoa.ind_fornecedor,
        ind_banco:          pessoa.ind_banco,
        ind_transportador:  pessoa.ind_transportador,
        cep:                pessoa.cep ?? '',
        logradouro:         pessoa.logradouro ?? '',
        numero:             pessoa.numero ?? '',
        complemento:        pessoa.complemento ?? '',
        bairro:             pessoa.bairro ?? '',
        cidade:             pessoa.cidade ?? '',
        uf:                 pessoa.uf ?? '',
        telefone:           pessoa.telefone ?? '',
        celular:            pessoa.celular ?? '',
        whatsapp:           pessoa.whatsapp ?? '',
        email:              pessoa.email ?? '',
        email_nfe:          pessoa.email_nfe ?? '',
        limite_credito:     Number(pessoa.limite_credito),
        banco_nome:         pessoa.banco_nome ?? '',
        banco_agencia:      pessoa.banco_agencia ?? '',
        banco_conta:        pessoa.banco_conta ?? '',
        banco_tipo:         pessoa.banco_tipo ?? undefined,
        chave_pix:          pessoa.chave_pix ?? '',
        contribuinte_icms:  pessoa.contribuinte_icms,
        optante_simples:    pessoa.optante_simples,
        obs:                pessoa.obs ?? '',
      })
    }
  }, [pessoa, reset])

  async function buscarCep(cep: string) {
    const c = cep.replace(/\D/g, '')
    if (c.length !== 8) return
    try {
      const r = await fetch(`https://viacep.com.br/ws/${c}/json/`)
      const d = await r.json()
      if (d.erro) return
      setValue('logradouro', d.logradouro)
      setValue('bairro',     d.bairro)
      setValue('cidade',     d.localidade)
      setValue('uf',         d.uf)
    } catch {}
  }

  async function onSubmit(data: PessoaInput) {
    setLoading(true)
    try {
      const url    = pessoa ? `/api/cadastro/pessoas/${pessoa.id}` : '/api/cadastro/pessoas'
      const method = pessoa ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      const json   = await res.json()

      if (!res.ok) {
        toast.error(json.erro?.formErrors?.[0] ?? json.erro ?? 'Erro ao salvar')
        return
      }

      toast.success(pessoa ? 'Pessoa atualizada!' : 'Pessoa cadastrada!')
      onSaved()
    } finally {
      setLoading(false)
    }
  }

  const tipoPessoa = watch('tipo_pessoa')

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }}>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }}
      />

      {/* Slide-over */}
      <div style={{
        position: 'relative', zIndex: 51,
        width: '100%', maxWidth: 640,
        height: '100vh', overflowY: 'auto',
        backgroundColor: 'var(--bg-card)',
        borderLeft: '0.5px solid var(--borda-suave)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '0.5px solid var(--borda-suave)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 10,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--texto-principal)' }}>
              {pessoa ? 'Editar Pessoa' : 'Nova Pessoa'}
            </div>
            {pessoa && (
              <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
                #{pessoa.id} — criado em {new Date(pessoa.created_at).toLocaleDateString('pt-BR')}
              </div>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '6px 8px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Abas */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: '0.5px solid var(--borda-suave)',
          padding: '0 20px',
          overflowX: 'auto',
          position: 'sticky', top: 57, backgroundColor: 'var(--bg-card)', zIndex: 9,
        }}>
          {SECTIONS.map(s => (
            <button
              key={s}
              onClick={() => setAba(s)}
              style={{
                padding: '10px 14px',
                fontSize: 13, fontWeight: aba === s ? 600 : 400,
                color: aba === s ? 'var(--cor-primaria)' : 'var(--texto-secundario)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: aba === s ? '2px solid var(--cor-primaria)' : '2px solid transparent',
                whiteSpace: 'nowrap',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px', flex: 1 }}>

            {/* === ABA DADOS === */}
            {aba === 'Dados' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Tipo */}
                <div>
                  <label className="field-label">Tipo</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ v: 'J', l: 'Pessoa Jurídica' }, { v: 'F', l: 'Pessoa Física' }].map(({ v, l }) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" value={v} {...register('tipo_pessoa')} />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="field-label">{tipoPessoa === 'J' ? 'Razão Social' : 'Nome Completo'} *</label>
                    <input className={`input-field ${errors.nome ? 'input-error' : ''}`} {...register('nome')} />
                    {errors.nome && <span className="field-error">{errors.nome.message}</span>}
                  </div>
                  <div>
                    <label className="field-label">{tipoPessoa === 'J' ? 'Nome Fantasia' : 'Apelido'}</label>
                    <input className="input-field" {...register('nome_fantasia')} />
                  </div>
                  <div>
                    <label className="field-label">{tipoPessoa === 'J' ? 'CNPJ' : 'CPF'}</label>
                    <input className="input-field font-mono" {...register('cpf_cnpj')} placeholder={tipoPessoa === 'J' ? '00.000.000/0001-00' : '000.000.000-00'} />
                  </div>
                  <div>
                    <label className="field-label">{tipoPessoa === 'J' ? 'Insc. Estadual' : 'RG'}</label>
                    <input className="input-field" {...register('rg_ie')} />
                  </div>
                  {tipoPessoa === 'J' && (
                    <div>
                      <label className="field-label">Insc. Municipal</label>
                      <input className="input-field" {...register('im')} />
                    </div>
                  )}
                </div>

                {tipoPessoa === 'F' && (
                  <div>
                    <div className="field-section">Dados Pessoais</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label className="field-label">Profissão</label>
                        <input className="input-field" {...register('profissao')} placeholder="Ex: MÉDICO, ADVOGADO..." />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                        <div>
                          <label className="field-label">Altura (m)</label>
                          <input
                            type="number" step="0.01" min="0" max="3"
                            className="input-field font-mono"
                            {...register('altura', { setValueAs: v => v === '' ? null : Number(v) })}
                            placeholder="1.75"
                          />
                        </div>
                        <div>
                          <label className="field-label">Peso (kg)</label>
                          <input
                            type="number" step="0.1" min="0" max="999"
                            className="input-field font-mono"
                            {...register('peso', { setValueAs: v => v === '' ? null : Number(v) })}
                            placeholder="70.0"
                          />
                        </div>
                        {(() => {
                          const a = Number(watch('altura')), p = Number(watch('peso'))
                          if (!a || !p || a <= 0 || p <= 0) return <div />
                          const imc = p / (a * a)
                          let label = '', cor = ''
                          if      (imc < 18.5) { label = 'Abaixo do peso'; cor = '#3B82F6' }
                          else if (imc < 25)   { label = 'Normal';          cor = '#10B981' }
                          else if (imc < 30)   { label = 'Sobrepeso';       cor = '#F59E0B' }
                          else if (imc < 35)   { label = 'Ob. Grau I';      cor = '#F97316' }
                          else if (imc < 40)   { label = 'Ob. Grau II';     cor = '#EF4444' }
                          else                  { label = 'Ob. Grau III';    cor = '#7C3AED' }
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', background: `${cor}18`, borderRadius: 6, border: `1px solid ${cor}50`, marginBottom: 1 }}>
                              <span style={{ fontSize: 9, color: 'var(--texto-terciario)', fontWeight: 600, letterSpacing: '.05em' }}>IMC</span>
                              <span style={{ fontSize: 15, fontWeight: 700, color: cor, fontFamily: 'var(--fonte-mono)', lineHeight: 1.2 }}>{imc.toFixed(1)}</span>
                              <span style={{ fontSize: 9, color: cor, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div className="field-section">Papéis</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { key: 'ind_cliente' as const,       label: 'Cliente',       color: 'var(--cor-sucesso)' },
                      { key: 'ind_fornecedor' as const,    label: 'Fornecedor',    color: '#7C3AED' },
                      { key: 'ind_banco' as const,         label: 'Banco/Fin.',    color: 'var(--cor-info)' },
                      { key: 'ind_transportador' as const, label: 'Transportador', color: 'var(--texto-secundario)' },
                    ].map(({ key, label, color }) => (
                      <label key={key} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 12px', borderRadius: 'var(--radius-md)',
                        border: `0.5px solid ${watch(key) ? color : 'var(--borda-suave)'}`,
                        backgroundColor: watch(key) ? `${color}18` : 'var(--bg-input)',
                        cursor: 'pointer', fontSize: 13, fontWeight: watch(key) ? 600 : 400,
                        color: watch(key) ? color : 'var(--texto-secundario)',
                        transition: 'all 0.15s',
                      }}>
                        <input type="checkbox" {...register(key)} style={{ accentColor: color }} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* === ABA ENDEREÇO === */}
            {aba === 'Endereço' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
                  <div>
                    <label className="field-label">CEP</label>
                    <input
                      className="input-field font-mono"
                      {...register('cep')}
                      placeholder="00000-000"
                      onBlur={e => buscarCep(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label">Logradouro</label>
                  <input className="input-field" {...register('logradouro')} placeholder="Rua, Av., Travessa..." />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                  <div>
                    <label className="field-label">Número</label>
                    <input className="input-field" {...register('numero')} />
                  </div>
                  <div>
                    <label className="field-label">Complemento</label>
                    <input className="input-field" {...register('complemento')} placeholder="Apto, Sala, Bloco..." />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="field-label">Bairro</label>
                    <input className="input-field" {...register('bairro')} />
                  </div>
                  <div>
                    <label className="field-label">Cidade</label>
                    <input className="input-field" {...register('cidade')} />
                  </div>
                </div>
                <div style={{ width: 120 }}>
                  <label className="field-label">UF</label>
                  <select className="input-field" {...register('uf')}>
                    <option value="">—</option>
                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* === ABA CONTATO === */}
            {aba === 'Contato' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="field-label">Telefone</label>
                    <input className="input-field font-mono" {...register('telefone')} placeholder="(41) 3333-4444" />
                  </div>
                  <div>
                    <label className="field-label">Celular</label>
                    <input className="input-field font-mono" {...register('celular')} placeholder="(41) 99999-9999" />
                  </div>
                  <div>
                    <label className="field-label">WhatsApp</label>
                    <input className="input-field font-mono" {...register('whatsapp')} placeholder="(41) 99999-9999" />
                  </div>
                </div>
                <div>
                  <label className="field-label">E-mail</label>
                  <input className={`input-field ${errors.email ? 'input-error' : ''}`} type="email" {...register('email')} />
                  {errors.email && <span className="field-error">{String(errors.email.message)}</span>}
                </div>
                <div>
                  <label className="field-label">E-mail NF-e</label>
                  <input className="input-field" type="email" {...register('email_nfe')} placeholder="Para envio de notas fiscais" />
                </div>
              </div>
            )}

            {/* === ABA FINANCEIRO === */}
            {aba === 'Financeiro' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ width: 200 }}>
                  <label className="field-label">Limite de Crédito (R$)</label>
                  <input
                    className="input-field font-mono"
                    type="number" step="0.01" min="0"
                    {...register('limite_credito', { valueAsNumber: true })}
                  />
                </div>
                <div className="field-section">Dados Bancários (para pagamentos)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="field-label">Banco</label>
                    <input className="input-field" {...register('banco_nome')} placeholder="Ex: Bradesco, Itaú..." />
                  </div>
                  <div>
                    <label className="field-label">Agência</label>
                    <input className="input-field font-mono" {...register('banco_agencia')} />
                  </div>
                  <div>
                    <label className="field-label">Conta</label>
                    <input className="input-field font-mono" {...register('banco_conta')} />
                  </div>
                  <div>
                    <label className="field-label">Tipo</label>
                    <select className="input-field" {...register('banco_tipo')}>
                      <option value="">—</option>
                      <option value="C">Corrente</option>
                      <option value="P">Poupança</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Chave PIX</label>
                    <input className="input-field" {...register('chave_pix')} placeholder="CPF, CNPJ, e-mail, celular ou aleatória" />
                  </div>
                </div>
              </div>
            )}

            {/* === ABA FISCAL === */}
            {aba === 'Fiscal' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { key: 'contribuinte_icms' as const, label: 'Contribuinte de ICMS' },
                    { key: 'optante_simples' as const,   label: 'Optante pelo Simples Nacional' },
                  ].map(({ key, label }) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" {...register(key)} />
                      {label}
                    </label>
                  ))}
                </div>
                <div>
                  <label className="field-label">Observações</label>
                  <textarea
                    className="input-field"
                    rows={4}
                    style={{ resize: 'vertical', fontFamily: 'var(--fonte-sans)' }}
                    {...register('obs')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '14px 20px',
            borderTop: '0.5px solid var(--borda-suave)',
            display: 'flex', gap: 8, justifyContent: 'flex-end',
            position: 'sticky', bottom: 0, backgroundColor: 'var(--bg-card)',
          }}>
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Salvando...' : (pessoa ? 'Salvar alterações' : 'Cadastrar pessoa')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
