import { Link } from 'react-router-dom'
import { Users, Package, UserRound, Settings as SettingsIcon, ChevronRight, type LucideIcon } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { PageContainer } from '../components/templates/PageContainer'
import { IconCircle } from '../components/atoms/IconCircle'

interface ManageItem {
  to: string
  label: string
  icon: LucideIcon
  describe: (app: ReturnType<typeof useApp>) => string
}

const items: ManageItem[] = [
  { to: '/customers', label: 'Customers', icon: Users, describe: (a) => `${a.customers.length} on your books` },
  { to: '/products', label: 'Products', icon: Package, describe: (a) => `${a.products.length} across ${a.companies.length} companies` },
  { to: '/delivery-boys', label: 'Delivery Boys', icon: UserRound, describe: (a) => `${a.deliveryBoys.length} active` },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, describe: () => 'Business branding & data' },
]

export default function Manage() {
  const app = useApp()
  return (
    <PageContainer>
      <header className="mb-5">
        <h1 className="font-display text-2xl font-extrabold text-ink-900">Manage</h1>
        <p className="text-sm text-ink-600">Everything about your business, in one place.</p>
      </header>
      <div className="space-y-3">
        {items.map(({ to, label, icon: Icon, describe }) => (
          <Link key={to} to={to} className="flex items-center gap-3 rounded-2xl border border-crate-100 bg-white p-4 active:bg-crate-50">
            <IconCircle><Icon size={19} /></IconCircle>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-ink-900">{label}</p>
              <p className="truncate text-sm text-ink-600">{describe(app)}</p>
            </div>
            <ChevronRight size={18} className="shrink-0 text-ink-600" />
          </Link>
        ))}
      </div>
    </PageContainer>
  )
}
