import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, MapPin, X, CalendarDays } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { productFullLabel, productTag } from '../lib/productTag'
import { getCustomerLedger } from '../lib/ledger'
import { PageContainer } from '../components/templates/PageContainer'
import { Sheet } from '../components/organisms/Sheet'
import { FormField } from '../components/molecules/FormField'
import { TextInput, Select } from '../components/atoms/Inputs'
import { PrimaryButton, DangerLink } from '../components/atoms/Button'
import { Badge } from '../components/atoms/Badge'
import type { Customer, Subscription } from '../types'

interface CustomerForm {
  name: string
  phone: string
  email: string
  address: string
  route_id: string
  is_paused: boolean
  subscriptions: Subscription[]
}

const emptyForm: CustomerForm = { name: '', phone: '', email: '', address: '', route_id: '', is_paused: false, subscriptions: [] }

export default function Customers() {
  const { customers, routes, products, companies, invoices, payments, exceptions, vendor, today, addCustomer, updateCustomer, deleteCustomer } = useApp()
  const [query, setQuery] = useState('')
  const [routeFilter, setRouteFilter] = useState('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [addProductId, setAddProductId] = useState('')

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const matchesQuery = !query.trim() || c.name.toLowerCase().includes(query.toLowerCase()) || c.address.toLowerCase().includes(query.toLowerCase())
      const matchesRoute = routeFilter === 'all' || (routeFilter === 'unassigned' ? !c.route_id : c.route_id === routeFilter)
      return matchesQuery && matchesRoute
    })
  }, [customers, query, routeFilter])

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setAddProductId('')
    setSheetOpen(true)
  }

  function openEdit(c: Customer) {
    setEditing(c)
    setForm({ name: c.name, phone: c.phone, email: c.email, address: c.address, route_id: c.route_id ?? '', is_paused: c.is_paused, subscriptions: [...c.subscriptions] })
    setAddProductId('')
    setSheetOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.address.trim()) return
    const payload = { ...form, route_id: form.route_id || null }
    try {
      if (editing) await updateCustomer(editing.id, payload)
      else await addCustomer(payload)
      setSheetOpen(false)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  async function handleDelete(c: Customer) {
    if (window.confirm(`Remove ${c.name}? This can't be undone.`)) {
      try {
        await deleteCustomer(c.id)
        setSheetOpen(false)
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Something went wrong')
      }
    }
  }

  function addSubscription() {
    if (!addProductId || form.subscriptions.some((s) => s.product_id === addProductId)) return
    setForm((f) => ({ ...f, subscriptions: [...f.subscriptions, { product_id: addProductId, quantity: 1 }] }))
    setAddProductId('')
  }

  function updateSubQty(productId: string, delta: number) {
    setForm((f) => ({
      ...f,
      subscriptions: f.subscriptions.map((s) => (s.product_id === productId ? { ...s, quantity: Math.max(0.5, +(s.quantity + delta).toFixed(1)) } : s)),
    }))
  }

  function removeSubscription(productId: string) {
    setForm((f) => ({ ...f, subscriptions: f.subscriptions.filter((s) => s.product_id !== productId) }))
  }

  function productLabel(id: string) {
    const p = products.find((pr) => pr.id === id)
    if (!p) return 'Unknown product'
    return `${productFullLabel(p, companies)} (${productTag(p, companies)})`
  }

  return (
    <PageContainer>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold text-ink-900">Customers</h1>
        <button onClick={openAdd} className="flex items-center gap-1.5 rounded-full bg-crate-500 px-3.5 py-2 text-sm font-semibold text-white active:bg-crate-600">
          <Plus size={16} /> Add
        </button>
      </header>

      <div className="relative mb-3">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-600" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or address"
          className="w-full rounded-xl border border-crate-100 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-crate-500 focus:outline-none"
        />
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[{ id: 'all', name: 'All' }, ...routes, { id: 'unassigned', name: 'Unassigned' }].map((r) => (
          <button
            key={r.id}
            onClick={() => setRouteFilter(r.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${routeFilter === r.id ? 'bg-crate-500 text-white' : 'bg-crate-50 text-crate-700'}`}
          >
            {r.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-crate-100 bg-white p-6 text-center text-sm text-ink-600">
          No customers match. Try a different search or add a new customer.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const route = routes.find((r) => r.id === c.route_id)
            const ledger = getCustomerLedger(c, invoices, payments, exceptions, products, companies, vendor?.deliveryCharge ?? 0, today)
            return (
              <div key={c.id} className="rounded-2xl border border-crate-100 bg-white p-4">
                <button onClick={() => openEdit(c)} className="block w-full text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-display font-bold text-ink-900">{c.name}</p>
                      <p className="mt-0.5 flex items-start gap-1 text-sm text-ink-600">
                        <MapPin size={13} className="mt-0.5 shrink-0" />
                        <span className="truncate">{c.address}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {c.is_paused && <Badge tone="amber">Paused</Badge>}
                      <Badge tone="crate">{route?.name ?? 'Unassigned'}</Badge>
                      {ledger.pending > 0 && <Badge tone="red">Due ₹{ledger.pending.toLocaleString('en-IN')}</Badge>}
                    </div>
                  </div>
                </button>
                <Link
                  to={`/customers/${c.id}/attendance`}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-crate-50 py-2 text-xs font-semibold text-crate-700"
                >
                  <CalendarDays size={14} /> View attendance & payments
                </Link>
              </div>
            )
          })}
        </div>
      )}

      <Sheet open={sheetOpen} title={editing ? 'Edit customer' : 'Add customer'} onClose={() => setSheetOpen(false)}>
        <form onSubmit={handleSubmit}>
          <FormField label="Full name">
            <TextInput required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Delivery address">
            <TextInput required value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="House no., street, area" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Phone">
              <TextInput type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </FormField>
            <FormField label="Email">
              <TextInput type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Route / delivery boy">
            <Select value={form.route_id} onChange={(e) => setForm((f) => ({ ...f, route_id: e.target.value }))}>
              <option value="">Unassigned</option>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </FormField>

          <label className="mb-4 flex items-center gap-2">
            <input type="checkbox" checked={form.is_paused} onChange={(e) => setForm((f) => ({ ...f, is_paused: e.target.checked }))} className="h-4 w-4 rounded accent-crate-500" />
            <span className="text-sm font-medium text-ink-900">Pause deliveries for this customer</span>
          </label>

          <FormField label="Daily subscription">
            <div className="space-y-2">
              {form.subscriptions.length === 0 && <p className="text-sm text-ink-600">No products yet — add their usual daily order below.</p>}
              {form.subscriptions.map((s) => (
                <div key={s.product_id} className="flex items-center justify-between rounded-xl bg-crate-50 px-3 py-2">
                  <span className="truncate text-sm text-ink-900">{productLabel(s.product_id)}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => updateSubQty(s.product_id, -0.5)} className="h-7 w-7 rounded-full bg-white text-crate-600">−</button>
                    <span className="w-8 text-center font-mono text-sm font-semibold">{s.quantity}</span>
                    <button type="button" onClick={() => updateSubQty(s.product_id, 0.5)} className="h-7 w-7 rounded-full bg-white text-crate-600">+</button>
                    <button type="button" onClick={() => removeSubscription(s.product_id)} aria-label="Remove product" className="text-red-500">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <Select value={addProductId} onChange={(e) => setAddProductId(e.target.value)} className="flex-1">
                <option value="">Choose a product to add…</option>
                {products.filter((p) => !form.subscriptions.some((s) => s.product_id === p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{productLabel(p.id)}</option>
                ))}
              </Select>
              <button type="button" onClick={addSubscription} className="shrink-0 rounded-xl bg-crate-50 px-3 text-sm font-semibold text-crate-700">Add</button>
            </div>
          </FormField>

          <div className="mt-2">
            <PrimaryButton type="submit">{editing ? 'Save changes' : 'Add customer'}</PrimaryButton>
          </div>
          {editing && (
            <div className="mt-3 text-center">
              <DangerLink type="button" onClick={() => handleDelete(editing)}>Remove customer</DangerLink>
            </div>
          )}
        </form>
      </Sheet>
    </PageContainer>
  )
}
