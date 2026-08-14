import type { ReactNode } from 'react'

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-28 pt-5">{children}</div>
}
