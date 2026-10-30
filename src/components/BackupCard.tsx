import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { useRef, useState } from 'react'
import { today } from '../data/month'
import type { Backend, ImportData, Settings, Transaction } from '../data/types'

const native = Capacitor.isNativePlatform()

/** On the phone: Android's share sheet, where Google Drive is one of the choices. On the web: a download. */
async function saveFile(name: string, text: string, mime: string, title: string) {
  if (!native) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: mime }))
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    return
  }
  const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
  await Share.share({ title, files: [uri], dialogTitle: title })
}

const cell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(txns: Transaction[]) {
  const head = ['Date', 'Month', 'Type', 'Amount', 'Category', 'Account', 'To account', 'Debt', 'Note']
  const rows = [...txns]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, t.month, t.kind, t.amount, t.category, t.account, t.toAccount, t.debt, t.description].map(cell).join(','))
  // A byte-order mark so Excel reads Arabic notes correctly.
  return '﻿' + [head.join(','), ...rows].join('\n')
}

/** Settings: CSV export, a full backup file for Google Drive, and restoring one. */
export function BackupCard({ backend, settings }: { backend: Backend; settings: Settings }) {
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const run = async (label: string, fn: () => Promise<string | void>) => {
    setStatus(label)
    try {
      setStatus((await fn()) || '')
    } catch (e) {
      // Closing the share sheet isn't an error.
      const msg = (e as Error).message
      setStatus(/cancel/i.test(msg) ? '' : `Failed: ${msg}`)
    }
  }

  const exportCsv = () =>
    run('Preparing…', async () => {
      const { transactions } = await backend.exportAll()
      await saveFile(`budget-${today()}.csv`, toCsv(transactions), 'text/csv', 'Export transactions')
    })

  const backup = () =>
    run('Preparing…', async () => {
      const data = await backend.exportAll()
      const file = { app: 'monthly-budget', version: 1, exportedAt: new Date().toISOString(), ...data }
      await saveFile(`budget-backup-${today()}.json`, JSON.stringify(file), 'application/json', 'Back up your budget')
      try {
        localStorage.setItem('budget-app:last-backup', today())
      } catch {
        // Only used for the "last backup" line.
      }
    })

  const restore = (f: File) =>
    run('Reading the backup…', async () => {
      const data = JSON.parse(await f.text()) as Partial<ImportData> & { app?: string }
      if (data.app !== 'monthly-budget' || !data.settings || !Array.isArray(data.transactions)) throw new Error('This is not a Monthly Budget backup file.')
      if (!confirm(`Restore ${data.transactions.length} entries and your settings from this backup? Entries in it replace the same entries here; newer ones stay.`)) return
      await backend.importAll({ settings: { ...data.settings, sms: settings.sms ?? data.settings.sms }, plans: data.plans ?? {}, transactions: data.transactions })
      return `Restored ${data.transactions.length} entries.`
    }).finally(() => {
      if (input.current) input.current.value = ''
    })

  let last: string | null = null
  try {
    last = localStorage.getItem('budget-app:last-backup')
  } catch {
    // ignore
  }

  return (
    <section className="card">
      <h2>Backup and export</h2>
      <p className="muted small">
        {native ? 'Back up opens Android\'s share menu: pick Drive to save the file to your Google Drive.' : 'Back up downloads a file you can keep in Google Drive.'}
        {backend.mode === 'cloud' && ' Your data also syncs to your Google account all the time.'}
        {last && ` Last backup: ${last}.`}
      </p>
      <div className="row wrap">
        <button className="primary" onClick={backup}>
          Back up to Google Drive
        </button>
        <button onClick={exportCsv}>Export CSV</button>
        <button onClick={() => input.current?.click()}>Restore</button>
      </div>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
      {status && <p className="small">{status}</p>}
    </section>
  )
}
