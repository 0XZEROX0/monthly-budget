import type { User } from 'firebase/auth'
import { useState } from 'react'
import type { Backend, Kind, Settings } from '../data/types'

interface Props {
  backend: Backend
  settings: Settings
  user: User | null | undefined
  onSignOut?: () => void
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED', 'KWD', 'QAR', 'TRY', 'INR', 'CAD', 'AUD']

export function SettingsView({ backend, settings, user, onSignOut }: Props) {
  const save = (s: Settings) => backend.saveSettings(s).catch((e: Error) => alert(`Could not save: ${e.message}`))
  const setCategories = (kind: Kind, list: string[]) => save({ ...settings, categories: { ...settings.categories, [kind]: list } })

  return (
    <div className="stack">
      <section className="card">
        <h2>Account</h2>
        {backend.mode === 'cloud' && user ? (
          <div className="row">
            <span>
              Signed in as <strong>{user.email}</strong>. Your data syncs across devices.
            </span>
            <span className="spacer" />
            <button onClick={onSignOut}>Sign out</button>
          </div>
        ) : (
          <p className="muted small">Local mode: data is saved in this browser only. Connect Firebase to sync across devices.</p>
        )}
      </section>

      <section className="card">
        <label>
          Currency
          <select value={settings.currency} onChange={(e) => save({ ...settings, currency: e.target.value })}>
            {[...new Set([settings.currency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </section>

      <CategoryEditor title="Expense categories" list={settings.categories.expense} onChange={(l) => setCategories('expense', l)} />
      <CategoryEditor title="Income categories" list={settings.categories.income} onChange={(l) => setCategories('income', l)} />
    </div>
  )
}

function CategoryEditor({ title, list, onChange }: { title: string; list: string[]; onChange: (l: string[]) => void }) {
  const [name, setName] = useState('')
  const add = () => {
    const n = name.trim()
    if (n && !list.includes(n)) onChange([...list, n])
    setName('')
  }
  const move = (i: number, d: number) => {
    const next = [...list]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <section className="card">
      <h2>{title}</h2>
      <ul className="chips">
        {list.map((c, i) => (
          <li key={c}>
            <span>{c}</span>
            <button aria-label={`Move ${c} up`} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button aria-label={`Remove ${c}`} onClick={() => confirm(`Remove "${c}"? Past transactions keep it.`) && onChange(list.filter((x) => x !== c))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <input value={name} placeholder="New category" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button onClick={add}>Add</button>
      </div>
    </section>
  )
}
