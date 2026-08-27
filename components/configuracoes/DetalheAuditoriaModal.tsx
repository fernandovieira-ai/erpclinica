'use client'

import { X } from 'lucide-react'
import type { LogAuditoriaItem, LogAuditoriaTabela } from '@/types/log-auditoria.types'

const LABEL_TABELA: Record<LogAuditoriaTabela, string> = {
  tab_usuario:              'Usuário',
  tab_agendamento:          'Agendamento',
  tab_despesa:              'Despesa',
  tab_receita:              'Receita',
  tab_titulo_pagar:         'Título a Pagar',
  tab_titulo_receber:       'Título a Receber',
  tab_recebimento_consulta: 'Recebimento',
}

const LABEL_ACAO: Record<string, string> = {
  INSERT: 'Criação',
  UPDATE: 'Edição',
  DELETE: 'Exclusão',
}

const ISO_DATA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?Z?$/

function formatarValor(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'string') {
    const m = v.match(ISO_DATA_HORA)
    if (m) {
      const [, ano, mes, dia, hora, min, seg] = m
      // Meia-noite UTC exata = coluna DATE sem hora real (o driver pg devolve
      // TIMESTAMPTZ à meia-noite) — extrai os dígitos direto da string em vez
      // de converter pro fuso local, senão a data pode "voltar" um dia.
      if (hora === '00' && min === '00' && seg === '00') return `${dia}/${mes}/${ano}`
      return new Date(v).toLocaleString('pt-BR')
    }
  }
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

interface Props {
  item: LogAuditoriaItem
  onClose: () => void
}

export default function DetalheAuditoriaModal({ item, onClose }: Props) {
  const antes  = item.dados_antes  ?? {}
  const depois = item.dados_depois ?? {}
  const chaves = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].sort()

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} />

      <div style={{
        position: 'relative', zIndex: 51,
        width: '100%', maxWidth: 760, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        backgroundColor: 'var(--bg-card)',
        border: '0.5px solid var(--borda-suave)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '0.5px solid var(--borda-suave)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--texto-principal)' }}>
              {LABEL_TABELA[item.tabela] ?? item.tabela} — {LABEL_ACAO[item.acao] ?? item.acao}
            </div>
            <div style={{ fontSize: 12, color: 'var(--texto-terciario)', marginTop: 2 }}>
              Registro #{item.registro_id} · {item.usuario_nome ?? 'sistema'} · {new Date(item.created_at).toLocaleString('pt-BR')}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '6px 8px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
          {chaves.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--texto-terciario)', fontSize: 13 }}>
              Sem detalhes registrados para esta ação.
            </div>
          )}

          {chaves.length > 0 && (
            <table className="table-base" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Campo</th>
                  <th style={{ width: '36%' }}>Antes</th>
                  <th style={{ width: '36%' }}>Depois</th>
                </tr>
              </thead>
              <tbody>
                {chaves.map(chave => {
                  const valorAntes  = antes[chave]
                  const valorDepois = depois[chave]
                  const mudou = item.acao === 'UPDATE' && JSON.stringify(valorAntes) !== JSON.stringify(valorDepois)
                  return (
                    <tr key={chave}>
                      <td style={{ fontSize: 12, color: 'var(--texto-secundario)', fontFamily: 'var(--fonte-mono)' }}>
                        {chave}
                      </td>
                      <td style={{ fontSize: 12, color: mudou ? 'var(--cor-erro)' : 'var(--texto-principal)' }}>
                        {formatarValor(valorAntes)}
                      </td>
                      <td style={{ fontSize: 12, color: mudou ? 'var(--cor-sucesso)' : 'var(--texto-principal)', fontWeight: mudou ? 600 : 400 }}>
                        {formatarValor(valorDepois)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
