import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

/**
 * A consistent back-navigation button. Pass `to` for a specific destination
 * (used for screens reached from a known hub, e.g. Manage's sub-pages going
 * back to /manage) — omit it to just pop browser history (used for screens
 * reached from varying places, e.g. a customer's detail page).
 */
export function BackButton({ to }: { to?: string }) {
  const navigate = useNavigate()
  const className = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-crate-50 text-crate-600'

  if (to) {
    return (
      <Link to={to} aria-label="Back" className={className}>
        <ArrowLeft size={16} />
      </Link>
    )
  }
  return (
    <button onClick={() => navigate(-1)} aria-label="Back" className={className}>
      <ArrowLeft size={16} />
    </button>
  )
}
