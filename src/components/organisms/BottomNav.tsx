import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, ClipboardCheck, Receipt, LayoutGrid, UserRound, type LucideIcon } from 'lucide-react'
import { useApp } from '../../context/AppContext'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  subPaths?: string[]
}

const vendorItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/delivery-log', label: 'Today', icon: ClipboardCheck },
  { to: '/billing', label: 'Billing', icon: Receipt },
  { to: '/manage', label: 'Manage', icon: LayoutGrid, subPaths: ['/customers', '/products', '/delivery-boys', '/settings'] },
]

// Delivery boys only ever get two destinations — their route for the day,
// and their own profile. No pricing, no billing, no admin screens: this is
// enforced again (not just visually) by RequireAuth in App.tsx.
const deliveryBoyItems: NavItem[] = [
  { to: '/delivery-log', label: 'Today', icon: ClipboardCheck, end: true },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

export function BottomNav() {
  const { currentUser } = useApp()
  const location = useLocation()

  if (!currentUser || location.pathname === '/login') return null

  const items = currentUser.role === 'vendor' ? vendorItems : deliveryBoyItems

  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-crate-100 pb-[env(safe-area-inset-bottom)]" aria-label="Primary">
      <ul className="flex justify-around">
        {items.map(({ to, label, icon: Icon, end, subPaths }) => {
          const onSubPath = subPaths?.some((p) => location.pathname.startsWith(p))
          return (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${isActive || onSubPath ? 'text-crate-600' : 'text-ink-600'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex h-9 w-14 items-center justify-center rounded-full transition-colors ${isActive || onSubPath ? 'bg-crate-100' : ''}`}>
                      <Icon size={20} strokeWidth={isActive || onSubPath ? 2.4 : 2} />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
