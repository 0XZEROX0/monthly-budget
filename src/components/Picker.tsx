import { askChoice, type Choice } from './dialog'

/** A dropdown that opens the app's own list dialog instead of the system's picker. */
export function Picker({ value, options, onChange, label, className = '' }: { value: string; options: Choice[]; onChange: (v: string) => void; label: string; className?: string }) {
  const current = options.find((o) => o.value === value)
  return (
    <button
      type="button"
      className={`picker ${className}`}
      aria-label={label}
      aria-haspopup="listbox"
      onClick={async () => {
        const v = await askChoice(label, options, value)
        if (v != null && v !== value) onChange(v)
      }}
    >
      <span className="grow">
        {current?.icon && `${current.icon} `}
        {current?.label ?? value}
      </span>
      <span className="picker-caret" aria-hidden>
        ▾
      </span>
    </button>
  )
}
