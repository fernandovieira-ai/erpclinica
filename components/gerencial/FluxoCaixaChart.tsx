'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { FluxoCaixaSeriePonto } from '@/types/cadastros.types'

const COR_ENTRADA = '#12857A'
const COR_SAIDA   = '#E24B4A'
const COR_SALDO   = '#378ADD'

function fmtValor(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtCompacto(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1000) return `${v < 0 ? '-' : ''}R$ ${(abs / 1000).toFixed(1).replace('.0', '')}k`
  return `R$ ${v.toFixed(0)}`
}

function fmtDataCurta(d: string) {
  const [, m, dd] = d.split('-')
  return `${dd}/${m}`
}

function TooltipCustom({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null
  const entradas = payload.find((p: any) => p.dataKey === 'entradas')?.value ?? 0
  const saidasNeg = payload.find((p: any) => p.dataKey === 'saidasNeg')?.value ?? 0
  const saldo = payload.find((p: any) => p.dataKey === 'saldo')?.value ?? 0

  return (
    <div style={{
      background: 'var(--bg-card)', border: '0.5px solid var(--borda-media)',
      borderRadius: 8, padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
      fontSize: 12, minWidth: 160,
    }}>
      <div style={{ fontWeight: 700, color: 'var(--texto-principal)', marginBottom: 6 }}>
        {fmtDataCurta(label)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
        <span style={{ color: COR_ENTRADA, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: COR_ENTRADA, display: 'inline-block' }} />
          Entradas
        </span>
        <span style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>{fmtValor(entradas)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
        <span style={{ color: COR_SAIDA, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: COR_SAIDA, display: 'inline-block' }} />
          Saídas
        </span>
        <span style={{ fontWeight: 600, color: 'var(--texto-principal)' }}>{fmtValor(Math.abs(saidasNeg))}</span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 6,
        paddingTop: 6, borderTop: '0.5px solid var(--borda-suave)',
      }}>
        <span style={{ color: COR_SALDO, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: COR_SALDO, display: 'inline-block' }} />
          Saldo
        </span>
        <span style={{ fontWeight: 700, color: 'var(--texto-principal)' }}>{fmtValor(saldo)}</span>
      </div>
    </div>
  )
}

export default function FluxoCaixaChart({ serie }: { serie: FluxoCaixaSeriePonto[] }) {
  const data = serie.map(p => ({ ...p, saidasNeg: -p.saidas }))

  // Evita poluir o eixo X com muitos rótulos quando o período é longo
  const step = data.length > 45 ? Math.ceil(data.length / 15) : data.length > 20 ? 2 : 0

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--borda-suave)" />
        <XAxis
          dataKey="data"
          tickFormatter={fmtDataCurta}
          tick={{ fontSize: 11, fill: 'var(--texto-terciario)' }}
          axisLine={{ stroke: 'var(--borda-suave)' }}
          tickLine={false}
          interval={step}
          minTickGap={20}
        />
        <YAxis
          tickFormatter={fmtCompacto}
          tick={{ fontSize: 11, fill: 'var(--texto-terciario)' }}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <ReferenceLine y={0} stroke="var(--borda-media)" />
        <Tooltip content={<TooltipCustom />} cursor={{ fill: 'var(--bg-hover)' }} />
        <Bar dataKey="entradas" fill={COR_ENTRADA} radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Bar dataKey="saidasNeg" fill={COR_SAIDA} radius={[0, 0, 3, 3]} maxBarSize={18} />
        <Line
          type="monotone" dataKey="saldo" stroke={COR_SALDO} strokeWidth={2.25}
          dot={false} activeDot={{ r: 4, fill: COR_SALDO, stroke: 'var(--bg-card)', strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
