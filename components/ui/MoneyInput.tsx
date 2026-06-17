'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  value?: number | null
  onValue: (n: number) => void
  onBlur?: () => void
  disabled?: boolean
  error?: boolean
  style?: React.CSSProperties
}

export default function MoneyInput({ value, onValue, onBlur, disabled, error, style }: Props) {
  const fmt = (n: number | null | undefined) =>
    n == null || isNaN(Number(n)) ? '0,00' : Number(n).toFixed(2).replace('.', ',')

  const parse = (s: string): number => {
    const n = parseFloat(s.replace(',', '.').replace(/[^\d.-]/g, ''))
    return isNaN(n) ? 0 : n
  }

  const [text, setText] = useState(() => fmt(value))
  const prevValue = useRef(value)

  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value
      setText(fmt(value))
    }
  }, [value])

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      onChange={e => setText(e.target.value)}
      onBlur={() => {
        const n = parse(text)
        setText(fmt(n))
        onValue(n)
        onBlur?.()
      }}
      onFocus={e => e.target.select()}
      style={{
        padding: '3px 6px',
        backgroundColor: 'var(--bg-input)',
        color: 'var(--texto-principal)',
        border: error ? '1px solid var(--cor-erro)' : '1px solid var(--borda-media)',
        borderRadius: 3,
        fontSize: 12,
        fontFamily: 'var(--fonte-mono)',
        outline: 'none',
        textAlign: 'right',
        opacity: disabled ? 0.65 : 1,
        ...style,
      }}
    />
  )
}
