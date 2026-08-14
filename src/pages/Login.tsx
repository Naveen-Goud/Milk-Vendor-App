import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Store, UserRound, Lock, Hash, Phone } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { FormField } from '../components/molecules/FormField'
import { TextInput } from '../components/atoms/Inputs'
import { PrimaryButton } from '../components/atoms/Button'
import type { Role } from '../types'

export default function Login() {
  const { signInVendor, signInDeliveryBoy } = useApp()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>('vendor')
  const [vendorForm, setVendorForm] = useState({ email: '', password: '' })
  const [boyForm, setBoyForm] = useState({ vendorCode: '', phone: '', pin: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (role === 'vendor') {
        await signInVendor(vendorForm)
      } else {
        await signInDeliveryBoy(boyForm)
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-crate-500 text-white">
            <Store size={26} />
          </span>
          <h1 className="font-display text-2xl font-extrabold text-ink-900">Milk Vendor Manager</h1>
          <p className="text-sm text-ink-600">Log in to your account</p>
        </div>

        <div className="mb-5 inline-flex w-full rounded-full bg-crate-50 p-1">
          {([
            { id: 'vendor' as const, label: 'Vendor', icon: Store },
            { id: 'delivery_boy' as const, label: 'Delivery Boy', icon: UserRound },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setRole(id); setError('') }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold transition-colors ${role === id ? 'bg-white text-crate-700 shadow-sm' : 'text-ink-600'}`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-crate-100 bg-white p-5">
          {role === 'vendor' ? (
            <>
              <FormField label="Email">
                <TextInput required type="email" value={vendorForm.email} onChange={(e) => setVendorForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
              </FormField>
              <FormField label="Password">
                <div className="relative">
                  <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-600" />
                  <TextInput required type="password" value={vendorForm.password} onChange={(e) => setVendorForm((f) => ({ ...f, password: e.target.value }))} className="pl-9" />
                </div>
              </FormField>
            </>
          ) : (
            <>
              <FormField label="Vendor code">
                <div className="relative">
                  <Hash size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-600" />
                  <TextInput
                    required
                    value={boyForm.vendorCode}
                    onChange={(e) => setBoyForm((f) => ({ ...f, vendorCode: e.target.value.toUpperCase() }))}
                    placeholder="e.g. KRISHNA1"
                    className="pl-9 uppercase tracking-wide"
                  />
                </div>
              </FormField>
              <FormField label="Phone number">
                <div className="relative">
                  <Phone size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-600" />
                  <TextInput required type="tel" value={boyForm.phone} onChange={(e) => setBoyForm((f) => ({ ...f, phone: e.target.value }))} className="pl-9" />
                </div>
              </FormField>
              <FormField label="PIN">
                <div className="relative">
                  <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-600" />
                  <TextInput required type="password" inputMode="numeric" maxLength={6} value={boyForm.pin} onChange={(e) => setBoyForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} placeholder="••••" className="pl-9 tracking-widest" />
                </div>
              </FormField>
              <p className="mb-3 text-xs text-ink-600">Your vendor gives you the vendor code and your PIN.</p>
            </>
          )}

          {error && <p className="mb-3 text-sm font-medium text-red-500">{error}</p>}

          <PrimaryButton type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</PrimaryButton>
        </form>

        {role === 'vendor' && (
          <p className="mt-5 text-center text-sm text-ink-600">
            New vendor? <Link to="/signup" className="font-semibold text-crate-600">Set up your business</Link>
          </p>
        )}
      </div>
    </div>
  )
}
