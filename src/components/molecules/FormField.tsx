import type { ReactNode } from 'react'

export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</span>
      {children}
    </label>
  )
}
