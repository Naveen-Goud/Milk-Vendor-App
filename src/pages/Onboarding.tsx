import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Store, ArrowRight, Mail, CheckCircle2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { FormField } from '../components/molecules/FormField'
import { TextInput } from '../components/atoms/Inputs'
import { PrimaryButton } from '../components/atoms/Button'

type Step = 'signup' | 'check-email' | 'booth'

export default function Onboarding() {
  const { authStatus, signUpVendor, finishVendorSetup } = useApp()
  // If we're here because an already-confirmed account has no booth details
  // yet (authStatus === 'needs-profile'), skip straight to that step.
  const [step, setStep] = useState<Step>(authStatus === 'needs-profile' ? 'booth' : 'signup')
  const [credentials, setCredentials] = useState({ email: '', password: '' })
  const [booth, setBooth] = useState({ businessName: '', ownerName: '', phone: '', address: '', tagline: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSignUp(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { needsEmailConfirmation } = await signUpVendor(credentials)
      setStep(needsEmailConfirmation ? 'check-email' : 'booth')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleBoothSubmit(e: FormEvent) {
    e.preventDefault()
    if (!booth.businessName.trim() || !booth.ownerName.trim()) return
    setError('')
    setBusy(true)
    try {
      await finishVendorSetup(booth)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your booth details')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        {step === 'signup' && (
          <div>
            <div className="mb-6 text-center">
              <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-crate-500 text-white">
                <Store size={28} />
              </span>
              <h1 className="font-display text-2xl font-extrabold text-ink-900">Set up your business</h1>
              <p className="mt-2 text-sm text-ink-600">Create your vendor account — you'll add booth details next.</p>
            </div>
            <form onSubmit={handleSignUp}>
              <FormField label="Email">
                <TextInput required type="email" value={credentials.email} onChange={(e) => setCredentials((c) => ({ ...c, email: e.target.value }))} placeholder="you@example.com" />
              </FormField>
              <FormField label="Password">
                <TextInput required type="password" minLength={6} value={credentials.password} onChange={(e) => setCredentials((c) => ({ ...c, password: e.target.value }))} placeholder="At least 6 characters" />
              </FormField>
              {error && <p className="mb-3 text-sm font-medium text-red-500">{error}</p>}
              <PrimaryButton type="submit" disabled={busy} className="flex items-center justify-center gap-1.5">
                {busy ? 'Creating account…' : <>Continue <ArrowRight size={16} /></>}
              </PrimaryButton>
            </form>
            <p className="mt-5 text-center text-sm text-ink-600">
              Already have an account? <Link to="/login" className="font-semibold text-crate-600">Log in</Link>
            </p>
          </div>
        )}

        {step === 'check-email' && (
          <div className="text-center">
            <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-crate-500 text-white">
              <Mail size={28} />
            </span>
            <h1 className="font-display text-xl font-extrabold text-ink-900">Check your email</h1>
            <p className="mt-2 text-sm text-ink-600">
              We sent a confirmation link to <span className="font-semibold">{credentials.email}</span>. Click it,
              then come back and log in — you'll finish setting up your booth details right after.
            </p>
            <Link to="/login" className="mt-6 inline-block font-semibold text-crate-600">Go to login</Link>
          </div>
        )}

        {step === 'booth' && (
          <div>
            <div className="mb-6 text-center">
              <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-fresh-500 text-white">
                <CheckCircle2 size={28} />
              </span>
              <h1 className="font-display text-xl font-extrabold text-ink-900">Tell us about your booth</h1>
              <p className="mt-2 text-sm text-ink-600">This shows up on your dashboard and every bill you send.</p>
            </div>
            <form onSubmit={handleBoothSubmit}>
              <FormField label="Booth / business name">
                <TextInput required value={booth.businessName} onChange={(e) => setBooth((f) => ({ ...f, businessName: e.target.value }))} placeholder="e.g. Sri Krishna Dairy" />
              </FormField>
              <FormField label="Your name">
                <TextInput required value={booth.ownerName} onChange={(e) => setBooth((f) => ({ ...f, ownerName: e.target.value }))} placeholder="e.g. Krishna Murthy" />
              </FormField>
              <FormField label="Phone">
                <TextInput type="tel" value={booth.phone} onChange={(e) => setBooth((f) => ({ ...f, phone: e.target.value }))} placeholder="10-digit mobile number" />
              </FormField>
              <FormField label="Booth address">
                <TextInput value={booth.address} onChange={(e) => setBooth((f) => ({ ...f, address: e.target.value }))} placeholder="Shop no., street, area" />
              </FormField>
              <FormField label="Tagline (optional)">
                <TextInput value={booth.tagline} onChange={(e) => setBooth((f) => ({ ...f, tagline: e.target.value }))} placeholder="e.g. Fresh milk, delivered daily" />
              </FormField>
              {error && <p className="mb-3 text-sm font-medium text-red-500">{error}</p>}
              <PrimaryButton type="submit" disabled={busy}>{busy ? 'Saving…' : 'Finish setup'}</PrimaryButton>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
