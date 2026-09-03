import {
  createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import type {
  Vendor, Product, Customer, DeliveryItem, CurrentUser, PaymentMethod, TenantData, Invoice,
} from '../types'
import { supabase } from '../lib/supabaseClient'
import { syntheticDeliveryBoyEmail, generateVendorCode } from '../lib/authEmails'
import * as db from '../lib/db'

// Auth/data lifecycle:
//   loading       -> checking for an existing session
//   signed-out    -> no session; Login / Sign-up screens are shown
//   needs-profile -> session exists (real account, confirmed) but no
//                    vendors/profiles row yet — happens right after a vendor
//                    signs up if Supabase's "confirm email" is on, since the
//                    booth-details step can only run once they're actually
//                    authenticated, which may be after clicking an email
//                    link on a different device than where they started
//   ready         -> profile + vendor + tenant data all loaded
type AuthStatus = 'loading' | 'signed-out' | 'needs-profile' | 'ready'

interface DeliveryBoyFormInput {
  name: string
  phone: string
  routeName: string
  pin?: string // required for create; optional for update (omit to leave unchanged)
}

interface SignUpInput { email: string; password: string }
interface FinishSetupInput { businessName: string; ownerName: string; phone: string; address: string; tagline: string }
interface VendorLoginInput { email: string; password: string }
interface DeliveryBoyLoginInput { vendorCode: string; phone: string; pin: string }

export interface SendInvoiceEmailInput {
  toEmail: string
  customerName: string
  periodLabel: string
  periodStart: string
  periodEnd: string
  lineItems: { label: string; tag: string; unit: string; rate: number; regularQty: number; regularAmount: number; extraQty: number; extraAmount: number }[]
  deliveryCharge: number
  skippedDays: number
  subtotal: number
  total: number
}

interface AppContextValue extends TenantData {
  authStatus: AuthStatus
  currentUser: CurrentUser | null
  vendor: Vendor | null
  toast: string | null
  today: string
  configured: boolean

  signUpVendor: (input: SignUpInput) => Promise<{ needsEmailConfirmation: boolean }>
  finishVendorSetup: (input: FinishSetupInput) => Promise<void>
  signInVendor: (input: VendorLoginInput) => Promise<void>
  signInDeliveryBoy: (input: DeliveryBoyLoginInput) => Promise<void>
  logout: () => Promise<void>
  changePassword: (newPassword: string) => Promise<void>

  updateVendor: (patch: Partial<Vendor>) => Promise<void>
  addCompany: (name: string, code?: string) => Promise<void>
  deleteCompany: (id: string) => Promise<void>
  addProduct: (product: Omit<Product, 'id' | 'is_active'> & { is_active?: boolean }) => Promise<void>
  updateProduct: (id: string, patch: Partial<Product>) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  addDeliveryBoy: (input: DeliveryBoyFormInput) => Promise<void>
  updateDeliveryBoy: (id: string, input: DeliveryBoyFormInput) => Promise<void>
  deleteDeliveryBoy: (id: string) => Promise<void>
  addCustomer: (customer: Omit<Customer, 'id' | 'is_paused' | 'subscriptions' | 'createdAt'> & Partial<Pick<Customer, 'is_paused' | 'subscriptions'>>) => Promise<void>
  updateCustomer: (id: string, patch: Partial<Customer>) => Promise<void>
  deleteCustomer: (id: string) => Promise<void>
  markAbsent: (customerId: string, date: string) => Promise<void>
  modifyDelivery: (customerId: string, date: string, items: DeliveryItem[]) => Promise<void>
  undoException: (customerId: string, date: string) => Promise<void>
  markInvoiceSent: (id: string, channel: NonNullable<Invoice['sent_via']>) => Promise<void>
  sendInvoiceEmail: (id: string, payload: SendInvoiceEmailInput) => Promise<void>
  markInvoicePaid: (id: string) => Promise<void>
  addPayment: (customerId: string, amount: number, method: PaymentMethod, note?: string) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

const TODAY = new Date().toISOString().slice(0, 10)
const emptyTenant: TenantData = { companies: [], products: [], routes: [], deliveryBoys: [], customers: [], exceptions: [], invoices: [], payments: [] }

export function AppProvider({ children }: { children: ReactNode }) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [tenant, setTenant] = useState<TenantData>(emptyTenant)
  const [toast, setToastState] = useState<string | null>(null)

  const showToast = useCallback((message: string) => {
    setToastState(message)
    window.setTimeout(() => setToastState((current) => (current === message ? null : current)), 2500)
  }, [])

  const requireDb = useCallback(() => {
    if (!supabase) throw new Error('Supabase is not configured')
    return supabase
  }, [])

  // Resolves everything needed once we know a session exists: who is this
  // user (vendor owner or delivery boy), which vendor tenant do they belong
  // to, and all of that tenant's operational data.
  const resolveSession = useCallback(async (activeSession: Session | null) => {
    if (!supabase) return
    if (!activeSession) {
      setSession(null); setCurrentUser(null); setVendor(null); setTenant(emptyTenant)
      setAuthStatus('signed-out')
      return
    }
    setSession(activeSession)
    try {
      const { data: profile, error } = await supabase
        .from('profiles').select('role, vendor_id, route_id, full_name, phone')
        .eq('id', activeSession.user.id).maybeSingle()

      if (error) throw new Error(error.message)

      if (!profile) {
        // Authenticated, but the vendor never finished booth setup (or this
        // is their first login after confirming email on another device).
        setCurrentUser(null); setVendor(null); setTenant(emptyTenant)
        setAuthStatus('needs-profile')
        return
      }

      const user: CurrentUser = {
        id: activeSession.user.id,
        role: profile.role,
        vendorId: profile.vendor_id,
        deliveryBoyId: profile.role === 'delivery_boy' ? activeSession.user.id : undefined,
      }
      setCurrentUser(user)

      const [vendorRow, tenantData] = await Promise.all([
        db.fetchVendor(supabase, profile.vendor_id),
        db.fetchTenantData(supabase, profile.vendor_id),
      ])
      setVendor(vendorRow)
      setTenant(tenantData)
      setAuthStatus('ready')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not load your account')
      setAuthStatus('signed-out')
    }
  }, [showToast])

  const refreshTenant = useCallback(async () => {
    if (!supabase || !currentUser) return
    const data = await db.fetchTenantData(supabase, currentUser.vendorId)
    setTenant(data)
  }, [currentUser])

  useEffect(() => {
    if (!supabase) { setAuthStatus('signed-out'); return }
    supabase.auth.getSession().then(({ data }) => resolveSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      resolveSession(newSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [resolveSession])

  // ---- Auth ----------------------------------------------------------
  const signUpVendor = useCallback(async ({ email, password }: SignUpInput) => {
    const client = requireDb()
    const { data, error } = await client.auth.signUp({ email, password })
    if (error) throw new Error(error.message)
    if (!data.user) throw new Error('Sign up did not return a user')
    return { needsEmailConfirmation: !data.session }
  }, [requireDb])

  const finishVendorSetup = useCallback(async ({ businessName, ownerName, phone, address, tagline }: FinishSetupInput) => {
    const client = requireDb()
    if (!session) throw new Error('You need to be logged in to finish setup')
    const userId = session.user.id

    // vendor_code must be unique across the whole database; the generator
    // appends a short random suffix, which has a small but real chance of
    // colliding with an existing vendor at scale — retry with a fresh code
    // rather than failing the whole sign-up over it.
    let lastError: string | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const vendorCode = generateVendorCode(businessName)
      const vendorInsert = await client.from('vendors').insert({
        id: userId, vendor_code: vendorCode, business_name: businessName, owner_name: ownerName,
        phone, address, tagline, delivery_charge: 0,
      })
      if (!vendorInsert.error) {
        lastError = null
        break
      }
      lastError = vendorInsert.error.message
      if (!vendorInsert.error.message.toLowerCase().includes('vendor_code')) break // not a collision — don't retry a different kind of failure
    }
    if (lastError) throw new Error(lastError)

    const profileInsert = await client.from('profiles').insert({
      id: userId, vendor_id: userId, role: 'vendor', full_name: ownerName, phone,
    })
    if (profileInsert.error) throw new Error(profileInsert.error.message)

    await resolveSession(session)
  }, [requireDb, session, resolveSession])

  const signInVendor = useCallback(async ({ email, password }: VendorLoginInput) => {
    const client = requireDb()
    const { error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }, [requireDb])

  const signInDeliveryBoy = useCallback(async ({ vendorCode, phone, pin }: DeliveryBoyLoginInput) => {
    const client = requireDb()
    const email = syntheticDeliveryBoyEmail(phone, vendorCode)
    const { error } = await client.auth.signInWithPassword({ email, password: pin })
    if (error) throw new Error('Vendor code, phone, or PIN is incorrect')
  }, [requireDb])

  const logout = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const changePassword = useCallback(async (newPassword: string) => {
    const client = requireDb()
    const { error } = await client.auth.updateUser({ password: newPassword })
    if (error) throw new Error(error.message)
    showToast('Password updated')
  }, [requireDb, showToast])

  // ---- Vendor settings --------------------------------------------------
  const updateVendorFn = useCallback(async (patch: Partial<Vendor>) => {
    const client = requireDb()
    if (!vendor) return
    await db.updateVendor(client, vendor.id, patch)
    setVendor((v) => (v ? { ...v, ...patch } : v))
    showToast('Business details saved')
  }, [requireDb, vendor, showToast])

  // ---- Companies ---------------------------------------------------------
  const addCompany = useCallback(async (name: string, code?: string) => {
    const client = requireDb()
    if (!currentUser) return
    const finalCode = (code || name.slice(0, 3)).toUpperCase()
    const created = await db.insertCompany(client, currentUser.vendorId, name, finalCode)
    setTenant((t) => ({ ...t, companies: [...t.companies, created] }))
    showToast(`${name} added`)
  }, [requireDb, currentUser, showToast])

  const deleteCompanyFn = useCallback(async (id: string) => {
    const client = requireDb()
    await db.deleteCompany(client, id)
    setTenant((t) => ({ ...t, companies: t.companies.filter((c) => c.id !== id), products: t.products.filter((p) => p.company_id !== id) }))
    showToast('Company removed')
  }, [requireDb, showToast])

  // ---- Products ------------------------------------------------------------
  const addProduct = useCallback(async (product: Omit<Product, 'id' | 'is_active'> & { is_active?: boolean }) => {
    const client = requireDb()
    if (!currentUser) return
    const created = await db.insertProduct(client, currentUser.vendorId, { ...product, is_active: product.is_active ?? true })
    setTenant((t) => ({ ...t, products: [...t.products, created] }))
    showToast('Product added')
  }, [requireDb, currentUser, showToast])

  const updateProductFn = useCallback(async (id: string, patch: Partial<Product>) => {
    const client = requireDb()
    await db.updateProduct(client, id, patch)
    setTenant((t) => ({ ...t, products: t.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
    showToast('Product updated')
  }, [requireDb, showToast])

  const deleteProductFn = useCallback(async (id: string) => {
    const client = requireDb()
    await db.deleteProduct(client, id)
    setTenant((t) => ({
      ...t, products: t.products.filter((p) => p.id !== id),
      customers: t.customers.map((c) => ({ ...c, subscriptions: c.subscriptions.filter((s) => s.product_id !== id) })),
    }))
    showToast('Product removed')
  }, [requireDb, showToast])

  // ---- Delivery boys (via Edge Function — needs the service role key) ----------
  const addDeliveryBoy = useCallback(async ({ name, phone, routeName, pin }: DeliveryBoyFormInput) => {
    const client = requireDb()
    if (!pin) throw new Error('PIN is required')
    const { data, error } = await client.functions.invoke('manage-delivery-boy', {
      body: { action: 'create', name, phone, pin, routeName },
    })
    if (error) throw new Error(error.message)
    if (data?.error) throw new Error(data.error)
    await refreshTenant()
    showToast(`${name} added`)
  }, [requireDb, refreshTenant, showToast])

  const updateDeliveryBoy = useCallback(async (id: string, { name, phone, routeName, pin }: DeliveryBoyFormInput) => {
    const client = requireDb()
    const { data, error } = await client.functions.invoke('manage-delivery-boy', {
      body: { action: 'update', boyId: id, name, phone, routeName, pin: pin || undefined },
    })
    if (error) throw new Error(error.message)
    if (data?.error) throw new Error(data.error)
    await refreshTenant()
    showToast('Delivery boy updated')
  }, [requireDb, refreshTenant, showToast])

  const deleteDeliveryBoy = useCallback(async (id: string) => {
    const client = requireDb()
    const { data, error } = await client.functions.invoke('manage-delivery-boy', { body: { action: 'delete', boyId: id } })
    if (error) throw new Error(error.message)
    if (data?.error) throw new Error(data.error)
    await refreshTenant()
    showToast('Delivery boy removed')
  }, [requireDb, refreshTenant, showToast])

  // ---- Customers -------------------------------------------------------------
  const addCustomer = useCallback(async (customer: Omit<Customer, 'id' | 'is_paused' | 'subscriptions' | 'createdAt'> & Partial<Pick<Customer, 'is_paused' | 'subscriptions'>>) => {
    const client = requireDb()
    if (!currentUser) return
    const full: Omit<Customer, 'id' | 'createdAt'> = { is_paused: false, subscriptions: [], ...customer }
    const created = await db.insertCustomer(client, currentUser.vendorId, full)
    setTenant((t) => ({ ...t, customers: [...t.customers, created] }))
    showToast('Customer added')
  }, [requireDb, currentUser, showToast])

  const updateCustomerFn = useCallback(async (id: string, patch: Partial<Customer>) => {
    const client = requireDb()
    if (!currentUser) return
    await db.updateCustomer(client, currentUser.vendorId, id, patch)
    setTenant((t) => ({ ...t, customers: t.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
    showToast('Customer updated')
  }, [requireDb, currentUser, showToast])

  const deleteCustomerFn = useCallback(async (id: string) => {
    const client = requireDb()
    await db.deleteCustomer(client, id)
    setTenant((t) => ({ ...t, customers: t.customers.filter((c) => c.id !== id) }))
    showToast('Customer removed')
  }, [requireDb, showToast])

  // ---- Attendance (default-present exception model) -------------------------
  const markAbsent = useCallback(async (customerId: string, date: string) => {
    const client = requireDb()
    if (!currentUser) return
    const customer = tenant.customers.find((c) => c.id === customerId)
    const returned = customer ? customer.subscriptions.reduce((sum, s) => sum + s.quantity, 0) : 0
    try {
      const created = await db.upsertException(client, currentUser.vendorId, customerId, date, 'skipped', [])
      setTenant((t) => ({ ...t, exceptions: [...t.exceptions.filter((e) => !(e.customer_id === customerId && e.date === date)), created] }))
      showToast(`Marked absent — ${returned}L returned to stock`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not mark absent')
    }
  }, [requireDb, currentUser, tenant.customers, showToast])

  const modifyDelivery = useCallback(async (customerId: string, date: string, items: DeliveryItem[]) => {
    const client = requireDb()
    if (!currentUser) return
    try {
      const created = await db.upsertException(client, currentUser.vendorId, customerId, date, 'modified', items)
      setTenant((t) => ({ ...t, exceptions: [...t.exceptions.filter((e) => !(e.customer_id === customerId && e.date === date)), created] }))
      showToast('Delivery updated')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update delivery')
    }
  }, [requireDb, currentUser, showToast])

  const undoException = useCallback(async (customerId: string, date: string) => {
    const client = requireDb()
    try {
      await db.deleteException(client, customerId, date)
      setTenant((t) => ({ ...t, exceptions: t.exceptions.filter((e) => !(e.customer_id === customerId && e.date === date)) }))
      showToast('Reverted to present')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not undo')
    }
  }, [requireDb, showToast])

  // ---- Billing & payments -----------------------------------------------------------
  const markInvoiceSent = useCallback(async (id: string, channel: NonNullable<Invoice['sent_via']>) => {
    const client = requireDb()
    const sent_at = new Date().toISOString()
    await db.updateInvoiceStatus(client, id, { status: 'sent', sent_via: channel, sent_at })
    setTenant((t) => ({ ...t, invoices: t.invoices.map((inv) => (inv.id === id ? { ...inv, status: 'sent', sent_via: channel, sent_at } : inv)) }))
    showToast(`Invoice sent via ${channel}`)
  }, [requireDb, showToast])

  // Actually sends the bill by email via the send-invoice-email Edge
  // Function (Resend), then only marks the invoice "sent" once the email
  // genuinely went out. Whatsapp/SMS aren't wired to a real provider yet —
  // see markInvoiceSent above, which still just flips the status flag for
  // those channels (see README "Known limitations").
  const sendInvoiceEmailFn = useCallback(async (id: string, payload: SendInvoiceEmailInput) => {
    const client = requireDb()
    const { data, error } = await client.functions.invoke('send-invoice-email', {
      body: { invoiceId: id, ...payload },
    })
    if (error) throw new Error(error.message)
    if (data?.error) throw new Error(data.error)
    const sent_at = new Date().toISOString()
    await db.updateInvoiceStatus(client, id, { status: 'sent', sent_via: 'email', sent_at })
    setTenant((t) => ({ ...t, invoices: t.invoices.map((inv) => (inv.id === id ? { ...inv, status: 'sent', sent_via: 'email', sent_at } : inv)) }))
    showToast(`Bill emailed to ${payload.toEmail}`)
  }, [requireDb, showToast])

  const markInvoicePaid = useCallback(async (id: string) => {
    const client = requireDb()
    await db.updateInvoiceStatus(client, id, { status: 'paid' })
    setTenant((t) => ({ ...t, invoices: t.invoices.map((inv) => (inv.id === id ? { ...inv, status: 'paid' } : inv)) }))
    showToast('Marked as paid')
  }, [requireDb, showToast])

  const addPayment = useCallback(async (customerId: string, amount: number, method: PaymentMethod, note?: string) => {
    const client = requireDb()
    if (!currentUser || amount <= 0) return
    const created = await db.insertPayment(client, currentUser.vendorId, customerId, amount, TODAY, method, note)
    setTenant((t) => ({ ...t, payments: [...t.payments, created] }))
    showToast(`Payment of ₹${amount} recorded`)
  }, [requireDb, currentUser, showToast])

  const value = useMemo<AppContextValue>(() => ({
    ...tenant,
    authStatus, currentUser, vendor, toast, today: TODAY, configured: !!supabase,
    signUpVendor, finishVendorSetup, signInVendor, signInDeliveryBoy, logout, changePassword,
    updateVendor: updateVendorFn,
    addCompany, deleteCompany: deleteCompanyFn,
    addProduct, updateProduct: updateProductFn, deleteProduct: deleteProductFn,
    addDeliveryBoy, updateDeliveryBoy, deleteDeliveryBoy,
    addCustomer, updateCustomer: updateCustomerFn, deleteCustomer: deleteCustomerFn,
    markAbsent, modifyDelivery, undoException,
    markInvoiceSent, sendInvoiceEmail: sendInvoiceEmailFn, markInvoicePaid, addPayment,
  }), [tenant, authStatus, currentUser, vendor, toast, signUpVendor, finishVendorSetup, signInVendor, signInDeliveryBoy,
      logout, changePassword, updateVendorFn, addCompany, deleteCompanyFn, addProduct, updateProductFn, deleteProductFn,
      addDeliveryBoy, updateDeliveryBoy, deleteDeliveryBoy, addCustomer, updateCustomerFn, deleteCustomerFn,
      markAbsent, modifyDelivery, undoException, markInvoiceSent, sendInvoiceEmailFn, markInvoicePaid, addPayment])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
