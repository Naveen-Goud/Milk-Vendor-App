import type { ReactNode } from 'react'

interface IconCircleProps {
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  tone?: 'crate' | 'fresh' | 'amber' | 'red'
}

const sizes = { sm: 'h-9 w-9', md: 'h-10 w-10', lg: 'h-16 w-16' }
const tones = {
  crate: 'bg-crate-50 text-crate-600',
  fresh: 'bg-fresh-500 text-white',
  amber: 'bg-amber-400 text-white',
  red: 'bg-red-100 text-red-500',
}

export function IconCircle({ children, size = 'md', tone = 'crate' }: IconCircleProps) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${sizes[size]} ${tones[tone]}`}>
      {children}
    </span>
  )
}
