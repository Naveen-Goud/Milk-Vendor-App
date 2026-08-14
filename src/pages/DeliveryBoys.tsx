import { useState, type FormEvent } from 'react'
import { UserRound, Phone, ChevronDown, Plus, Pencil, Trash2, MapPin } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { PageContainer } from '../components/templates/PageContainer'
import { Sheet } from '../components/organisms/Sheet'
import { FormField } from '../components/molecules/FormField'
import { TextInput } from '../components/atoms/Inputs'
import { PrimaryButton, DangerLink } from '../components/atoms/Button'
import { Badge } from '../components/atoms/Badge'
import { IconCircle } from '../components/atoms/IconCircle'
import type { DeliveryBoy } from '../types'

interface BoyForm { name: string; phone: string; routeName: string; pin: string }
const emptyForm: BoyForm = { name: '', phone: '', routeName: '', pin: '' }

export default function DeliveryBoys() {
  const { deliveryBoys, routes, customers, addDeliveryBoy, updateDeliveryBoy, deleteDeliveryBoy } = useApp()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<DeliveryBoy | null>(null)
  const [form, setForm] = useState<BoyForm>(emptyForm)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function openAdd() {
    setEditing(null)
    setForm(emptyForm)
    setSheetOpen(true)
  }

  function openEdit(boy: DeliveryBoy) {
    const route = routes.find((r) => r.id === boy.route_id)
    setEditing(boy)
    setForm({ name: boy.name, phone: boy.phone, routeName: route?.name ?? '', pin: '' })
    setSheetOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.routeName.trim()) return
    if (!editing && !/^\d{4,6}$/.test(form.pin)) return
    if (form.pin && !/^\d{4,6}$/.test(form.pin)) return
    try {
      if (editing) await updateDeliveryBoy(editing.id, form)
      else await addDeliveryBoy(form)
      setSheetOpen(false)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  async function handleDelete(boy: DeliveryBoy) {
    if (window.confirm(`Remove ${boy.name}? Their customers will become unassigned.`)) {
      try {
        await deleteDeliveryBoy(boy.id)
        if (expandedId === boy.id) setExpandedId(null)
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Something went wrong')
      }
    }
  }

  return (
    <PageContainer>
      <header className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold text-ink-900">Delivery Boys</h1>
        <button onClick={openAdd} className="flex items-center gap-1.5 rounded-full bg-crate-500 px-3.5 py-2 text-sm font-semibold text-white active:bg-crate-600">
          <Plus size={16} /> Add
        </button>
      </header>

      {deliveryBoys.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-crate-100 bg-white p-6 text-center text-sm text-ink-600">
          No delivery boys yet. Add your first one to start assigning customers.
        </p>
      ) : (
        <div className="space-y-3">
          {deliveryBoys.map((boy) => {
            const route = routes.find((r) => r.id === boy.route_id)
            const assigned = customers.filter((c) => c.route_id === boy.route_id)
            const isOpen = expandedId === boy.id
            return (
              <div key={boy.id} className="rounded-2xl border border-crate-100 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <IconCircle size="lg"><UserRound size={20} /></IconCircle>
                    <div className="min-w-0">
                      <p className="font-display font-bold text-ink-900">{boy.name}</p>
                      <p className="flex items-center gap-1 text-sm text-ink-600"><Phone size={12} /> {boy.phone || '—'}</p>
                      <p className="mt-0.5 text-xs font-medium text-crate-600">{route?.name ?? 'No route'}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => openEdit(boy)} aria-label={`Edit ${boy.name}`} className="flex h-8 w-8 items-center justify-center rounded-full text-crate-600 active:bg-crate-50">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(boy)} aria-label={`Remove ${boy.name}`} className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 active:bg-red-50">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <button onClick={() => setExpandedId(isOpen ? null : boy.id)} aria-expanded={isOpen} className="mt-3 flex w-full items-center justify-between rounded-xl bg-crate-50 px-3 py-2 text-sm font-semibold text-crate-700">
                  {assigned.length} customer{assigned.length !== 1 ? 's' : ''} on this route
                  <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <ul className="mt-2 space-y-2 border-t border-crate-100 pt-2">
                    {assigned.length === 0 ? (
                      <li className="py-2 text-center text-sm text-ink-600">No customers assigned yet.</li>
                    ) : (
                      assigned.map((c) => (
                        <li key={c.id} className="flex items-start gap-2 py-1">
                          <MapPin size={14} className="mt-0.5 shrink-0 text-crate-500" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink-900">{c.name}</p>
                            <p className="truncate text-xs text-ink-600">{c.address}</p>
                          </div>
                          {c.is_paused && <Badge tone="amber">Paused</Badge>}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Sheet open={sheetOpen} title={editing ? 'Edit delivery boy' : 'Add delivery boy'} onClose={() => setSheetOpen(false)}>
        <form onSubmit={handleSubmit}>
          <FormField label="Full name">
            <TextInput required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ramesh Babu" />
          </FormField>
          <FormField label="Phone number">
            <TextInput type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="10-digit mobile number" />
          </FormField>
          <FormField label="Route name">
            <TextInput required value={form.routeName} onChange={(e) => setForm((f) => ({ ...f, routeName: e.target.value }))} placeholder="e.g. Route C — Park Street" />
          </FormField>
          <FormField label={editing ? 'New PIN (leave blank to keep current)' : 'Login PIN (4-6 digits)'}>
            <TextInput
              required={!editing}
              inputMode="numeric"
              pattern="\d{4,6}"
              maxLength={6}
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))}
              placeholder="e.g. 1111"
              className="tracking-widest"
            />
          </FormField>
          <p className="mb-4 text-xs text-ink-600">They'll use this PIN to log in and see only their own route — never pricing or other customers.</p>
          <PrimaryButton type="submit">{editing ? 'Save changes' : 'Add delivery boy'}</PrimaryButton>
          {editing && (
            <div className="mt-3 text-center">
              <DangerLink type="button" onClick={() => { setSheetOpen(false); handleDelete(editing) }}>Remove delivery boy</DangerLink>
            </div>
          )}
        </form>
      </Sheet>
    </PageContainer>
  )
}
