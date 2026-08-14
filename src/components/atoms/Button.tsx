import type { ButtonHTMLAttributes, ReactNode } from 'react'

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }

export function PrimaryButton({ children, className = '', ...props }: PrimaryButtonProps) {
  return (
    <button
      {...props}
      className={`w-full rounded-xl bg-crate-500 py-3 text-sm font-semibold text-white active:bg-crate-600 disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className = '', ...props }: PrimaryButtonProps) {
  return (
    <button
      {...props}
      className={`w-full rounded-xl bg-fresh-500 py-3 text-sm font-semibold text-white active:bg-fresh-600 disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  )
}

export function DangerLink({ children, className = '', ...props }: PrimaryButtonProps) {
  return (
    <button {...props} className={`text-sm font-semibold text-red-500 ${className}`}>
      {children}
    </button>
  )
}
