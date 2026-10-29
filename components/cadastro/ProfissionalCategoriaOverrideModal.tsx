'use client'

import { useState } from 'react'
import { X, Plus, Trash2, Tag } from 'lucide-react'

export interface OverrideCategoria {
  categoria_id: number
  categoria_descricao: string
  percentual: string   // texto do input, igual ao padrão da linha geral (vazio = 100)
  valor_fixo: string
}

interface Props {
  tipoDescricao: string
  categoriasDisponiveis: { id: number; descricao: string }[]
  overridesAtuais: OverrideCategoria[]
  onClose: () => void
  onSalvar: (overrides: OverrideCategoria[]) => void
}

const th: React.CSSProperties = { textAlign: 'left', padding: '4px 6px', color: 'var(--texto-secundario)', fontWeight: 600, fontSize: 11 }
const td: React.CSSProperties = { padding: '4px 6px' }

export default function ProfissionalCategoriaOverrideModal({
  tipoDescricao, categoriasDisponiveis, overridesAtuais, onClose, onSalvar,
}: Props) {
  const [linhas, setLinhas] = useState<OverrideCategoria[]>(overridesAtuais)
  const [novaCategoriaId, setNovaCategoriaId] = useState<number>(0)

  const disponiveisParaAdicionar = categoriasDisponiveis.filter(
    c => !linhas.some(l => l.categoria_id === c.id),
  )

  function adicionar() {
    const cat = disponiveisParaAdicionar.find(c => c.id === novaCategoriaId)
    if (!cat) return
    // percentual '' = 100% (mesmo padrão da linha geral, ver comentário em
    // OverrideCategoria acima) - começar em '0' faria uma categoria nova
    // "aplicar" silenciosamente, sem o admin mexer em nada, pagar R$0 ao
    // profissional (0% sem valor fixo) até alguém notar.
    setLinhas(l => [...l, { categoria_id: cat.id, categoria_descricao: cat.descricao, percentual: '', valor_fixo: '' }])
    setNovaCategoriaId(0)
  }

  function remover(categoriaId: number) {
    setLinhas(l => l.filter(x => x.categoria_id !== categoriaId))
  }

  function atualizar(categoriaId: number, campo: 'percentual' | 'valor_fixo', valor: string) {
    setLinhas(l => l.map(x => x.categoria_id === categoriaId ? { ...x, [campo]: valor } : x))
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 8, width: '100%', maxWidth: 560, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)', border: '1px solid var(--borda-media)',
      }}>
        <div style={{
          padding: '10px 16px', background: 'var(--cor-primaria)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
            <Tag size={15} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Repasse por categoria</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>{tipoDescricao}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 4, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11.5, color: 'var(--texto-terciario)' }}>
            Defina uma regra diferente para quando o atendimento for de uma categoria (convênio) específica.
            Categorias sem regra aqui continuam usando a regra geral do tipo.
          </div>

          {linhas.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--texto-terciario)', padding: '8px 4px' }}>
              Nenhuma categoria com regra própria.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--borda-media)' }}>
                  <th style={th}>Categoria</th>
                  <th style={{ ...th, textAlign: 'right', width: 90 }}>% Profissional</th>
                  <th style={{ ...th, textAlign: 'right', width: 110 }}>Valor Fixo (R$)</th>
                  <th style={{ ...th, width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => {
                  const raw = l.percentual.trim()
                  const pct = raw === '' ? 100 : Number(raw)
                  const usaFixo = Number.isFinite(pct) && pct === 0
                  return (
                    <tr key={l.categoria_id} style={{ borderBottom: '1px solid var(--borda-suave)' }}>
                      <td style={td}>{l.categoria_descricao}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <input
                          type="number" min={0} max={100} step={1}
                          value={l.percentual}
                          onChange={e => atualizar(l.categoria_id, 'percentual', e.target.value)}
                          placeholder="100"
                          style={{ width: 60, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, textAlign: 'right' }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--texto-secundario)' }}> %</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {usaFixo ? (
                          <input
                            type="number" min={0} step={0.01}
                            value={l.valor_fixo}
                            onChange={e => atualizar(l.categoria_id, 'valor_fixo', e.target.value)}
                            placeholder="0,00"
                            style={{ width: 90, padding: '3px 6px', backgroundColor: 'var(--bg-input)', color: 'var(--texto-principal)', border: '1px solid var(--borda-media)', borderRadius: 3, fontSize: 12, textAlign: 'right' }}
                          />
                        ) : <span style={{ color: 'var(--texto-terciario)' }}>-</span>}
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <button
                          type="button" onClick={() => remover(l.categoria_id)} title="Remover"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cor-erro, #dc2626)', display: 'flex' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {disponiveisParaAdicionar.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select
                className="input-field" style={{ flex: 1, fontSize: 12 }}
                value={novaCategoriaId}
                onChange={e => setNovaCategoriaId(Number(e.target.value))}
              >
                <option value={0}>Selecione a categoria...</option>
                {disponiveisParaAdicionar.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
              </select>
              <button
                type="button" onClick={adicionar} disabled={!novaCategoriaId}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 4, fontSize: 12, cursor: novaCategoriaId ? 'pointer' : 'not-allowed', color: 'var(--texto-secundario)', opacity: novaCategoriaId ? 1 : 0.5 }}
              >
                <Plus size={13} /> Adicionar
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--borda-media)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button
            type="button" onClick={onClose}
            style={{ padding: '6px 14px', background: 'none', border: '1px solid var(--borda-media)', borderRadius: 4, fontSize: 12, cursor: 'pointer', color: 'var(--texto-secundario)' }}
          >
            Cancelar
          </button>
          <button
            type="button" onClick={() => onSalvar(linhas)}
            style={{ padding: '6px 14px', background: 'var(--cor-primaria)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  )
}
