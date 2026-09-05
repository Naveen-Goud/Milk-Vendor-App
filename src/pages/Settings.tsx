import { useState, type FormEvent } from 'react'
import { Store, Lock, Truck, Hash, Copy } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { PageContainer } from '../components/templates/PageContainer'
import { FormField } from '../components/molecules/FormField'
import { TextInput } from '../components/atoms/Inputs'
import { PrimaryButton } from '../components/atoms/Button'
import { IconCircle } from '../components/atoms/IconCircle'
import { BackButton } from '../components/atoms/BackButton'

export default function Settings() {
  const { vendor, updateVendor, changePassword } = useApp()
  const [form, setForm] = useState({ name: vendor?.name ?? '', ownerName: vendor?.ownerName ?? '', phone: vendor?.phone ?? '', address: vendor?.address ?? '', tagline: vendor?.tagline ?? '' })
  const [deliveryCharge, setDeliveryCharge] = useState(String(vendor?.deliveryCharge ?? 0))
  const [newPassword, setNewPassword] = useState('')
  const [pwSaved, setPwSaved] = useState(false)

  if (!vendor) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    updateVendor(form)
  }

  function handleDeliveryChargeSubmit(e: FormEvent) {
    e.preventDefault()
    updateVendor({ deliveryCharge: Number(deliveryCharge) || 0 })
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    if (newPassword.length < 6) return
    await changePassword(newPassword)
    setNewPassword('')
    setPwSaved(true)
    window.setTimeout(() => setPwSaved(false), 2000)
  }

  function copyVendorCode() {
    if (vendor) navigator.clipboard?.writeText(vendor.vendorCode)
  }

  return (
    <PageContainer>
      <header className="mb-5 flex items-center gap-3">
        <BackButton to="/manage" />
        <h1 className="font-display text-2xl font-extrabold text-ink-900">Settings</h1>
      </header>

      <section className="rounded-2xl border border-crate-100 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <IconCircle><Hash size={17} /></IconCircle>
          <div>
            <h2 className="font-display text-sm font-bold text-ink-900">Vendor code</h2>
            <p className="text-xs text-ink-600">Give this to your delivery boys — they need it to log in.</p>
          </div>
        </div>
        <button onClick={copyVendorCode} className="flex w-full items-center justify-between rounded-xl bg-crate-50 px-4 py-3">
          <span className="font-mono text-lg font-bold tracking-widest text-crate-700">{vendor.vendorCode}</span>
          <Copy size={16} className="text-crate-600" />
        </button>
      </section>

      <section className="mt-4 rounded-2xl border border-crate-100 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <IconCircle><Store size={17} /></IconCircle>
          <div>
            <h2 className="font-display text-sm font-bold text-ink-900">Business branding</h2>
            <p className="text-xs text-ink-600">This is what makes the app yours — change it and every screen updates.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <FormField label="Business name">
            <TextInput required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Owner name">
            <TextInput value={form.ownerName} onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Phone">
              <TextInput type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </FormField>
            <FormField label="Tagline">
              <TextInput value={form.tagline} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Booth address">
            <TextInput value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </FormField>
          <PrimaryButton type="submit">Save business details</PrimaryButton>
        </form>
      </section>

      <section className="mt-4 rounded-2xl border border-crate-100 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <IconCircle><Truck size={17} /></IconCircle>
          <div>
            <h2 className="font-display text-sm font-bold text-ink-900">Delivery charge</h2>
            <p className="text-xs text-ink-600">Flat amount added to every generated bill.</p>
          </div>
        </div>
        <form onSubmit={handleDeliveryChargeSubmit} className="flex gap-2">
          <TextInput type="number" min="0" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} className="flex-1" />
          <button type="submit" className="shrink-0 rounded-xl bg-crate-500 px-4 text-sm font-semibold text-white">Save</button>
        </form>
      </section>

      <section className="mt-4 rounded-2xl border border-crate-100 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <IconCircle><Lock size={17} /></IconCircle>
          <div>
            <h2 className="font-display text-sm font-bold text-ink-900">Change password</h2>
            <p className="text-xs text-ink-600">Your own login password (delivery boy PINs are managed from Delivery Boys).</p>
          </div>
        </div>
        <form onSubmit={handlePasswordSubmit}>
          <FormField label="New password">
            <TextInput required type="password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
          </FormField>
          <PrimaryButton type="submit">{pwSaved ? 'Saved ✓' : 'Update password'}</PrimaryButton>
        </form>
      </section>
    </PageContainer>
  )
}
