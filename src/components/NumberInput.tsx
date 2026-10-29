import { useEffect, useState } from 'react'

const parse = (s: string) => {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Keeps the typed text (so "12." survives) while reporting a number. */
export function NumberInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => {
    setText((t) => (parse(t) === value ? t : value ? String(value) : ''))
  }, [value])
  return (
    <input
      inputMode="decimal"
      placeholder="0"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        onChange(parse(e.target.value))
      }}
    />
  )
}
