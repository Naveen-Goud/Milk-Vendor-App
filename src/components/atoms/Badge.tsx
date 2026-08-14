import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  tone?: 'crate' | 'fresh' | 'amber' | 'red' | 'neutral'
}

const tones = {
  crate: 'bg-crate-50 text-crate-600',
  fresh: 'bg-fresh-50 text-fresh-600',
  amber: 'bg-amber-100 text-amber-400',
  red: 'bg-red-100 text-red-500',
  neutral: 'bg-cream-100 text-ink-600',
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${tones[tone]}`}>
      {children}
    </span>
  )
}
