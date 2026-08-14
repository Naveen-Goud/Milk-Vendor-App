import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'

const baseInput =
  'w-full rounded-xl border border-crate-100 bg-cream-50 px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-600/50 focus:border-crate-500 focus:bg-white focus:outline-none'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${baseInput} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${baseInput} ${props.className ?? ''}`} />
}
