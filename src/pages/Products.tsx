import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { productTag } from '../lib/productTag'
import { PageContainer } from '../components/templates/PageContainer'
import { Sheet } from '../components/organisms/Sheet'
import { FormField } from '../components/molecules/FormField'
import { TextInput, Select } from '../components/atoms/Inputs'
import { PrimaryButton, DangerLink } from '../components/atoms/Button'
import { Badge } from '../components/atoms/Badge'
import { BackButton } from '../components/atoms/BackButton'
import type { Product, ProductUnit } from '../types'

interface ProductForm { company_id: string; full_name: string; acronym: string; unit: ProductUnit; price: string }
interface CompanyForm { name: string; code: string }

const emptyProductForm: ProductForm = { company_id: '', full_name: '', acronym: '', unit: 'litre', price: '' }
const emptyCompanyForm: CompanyForm = { name: '', code: '' }

export default function Products() {
  const { companies, products, addCompany, deleteCompany, addProduct, updateProduct, deleteProduct } = useApp()
  const [companyFilter, setCompanyFilter] = useState('all')

  const [productSheetOpen, setProductSheetOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm)

  const [companySheetOpen, setCompanySheetOpen] = useState(false)
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm)

  const filteredProducts = useMemo(
    () => (companyFilter === 'all' ? products : products.filter((p) => p.company_id === companyFilter)),
    [products, companyFilter]
  )

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const p of filteredProducts) {
      if (!map.has(p.full_name)) map.set(p.full_name, [])
      map.get(p.full_name)!.push(p)
    }
    return [...map.entries()]
  }, [filteredProducts])

  function companyName(id: string) {
    return companies.find((c) => c.id === id)?.name ?? 'Unknown'
  }

  function openAddProduct() {
    setEditingProduct(null)
    setProductForm({ ...emptyProductForm, company_id: companies[0]?.id ?? '' })
    setProductSheetOpen(true)
  }

  function openEditProduct(p: Product) {
    setEditingProduct(p)
    setProductForm({ company_id: p.company_id, full_name: p.full_name, acronym: p.acronym, unit: p.unit, price: String(p.price) })
    setProductSheetOpen(true)
  }

  async function handleProductSubmit(e: FormEvent) {
    e.preventDefault()
    if (!productForm.full_name.trim() || !productForm.acronym.trim() || !productForm.company_id) return
    const payload = { ...productForm, price: Number(productForm.price) || 0, acronym: productForm.acronym.toUpperCase() }
    try {
      if (editingProduct) await updateProduct(editingProduct.id, payload)
      else await addProduct(payload)
      setProductSheetOpen(false)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  async function handleDeleteProduct(p: Product) {
    if (window.confirm(`Remove ${p.full_name} (${companyName(p.company_id)})?`)) {
      try {
        await deleteProduct(p.id)
        setProductSheetOpen(false)
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Something went wrong')
      }
    }
  }

  async function handleAddCompany(e: FormEvent) {
    e.preventDefault()
    if (!companyForm.name.trim()) return
    try {
      await addCompany(companyForm.name.trim(), companyForm.code.trim())
      setCompanyForm(emptyCompanyForm)
      setCompanySheetOpen(false)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  async function handleDeleteCompany(c: { id: string; name: string }) {
    const count = products.filter((p) => p.company_id === c.id).length
    const warning = count > 0 ? ` This will also remove ${count} product${count > 1 ? 's' : ''}.` : ''
    if (window.confirm(`Remove ${c.name}?${warning}`)) {
      try {
        await deleteCompany(c.id)
        if (companyFilter === c.id) setCompanyFilter('all')
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Something went wrong')
      }
    }
  }

  return (
    <PageContainer>
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton to="/manage" />
          <h1 className="font-display text-2xl font-extrabold text-ink-900">Products</h1>
        </div>
        <button onClick={openAddProduct} className="flex items-center gap-1.5 rounded-full bg-crate-500 px-3.5 py-2 text-sm font-semibold text-white active:bg-crate-600">
          <Plus size={16} /> Add product
        </button>
      </header>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setCompanyFilter('all')} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${companyFilter === 'all' ? 'bg-crate-500 text-white' : 'bg-crate-50 text-crate-700'}`}>
          All companies
        </button>
        {companies.map((c) => (
          <button key={c.id} onClick={() => setCompanyFilter(c.id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${companyFilter === c.id ? 'bg-crate-500 text-white' : 'bg-crate-50 text-crate-700'}`}>
            {c.name}
          </button>
        ))}
        <button onClick={() => setCompanySheetOpen(true)} className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-crate-100 px-3.5 py-1.5 text-sm font-semibold text-crate-600">
          <Building2 size={14} /> Manage companies
        </button>
      </div>

      {grouped.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-crate-100 bg-white p-6 text-center text-sm text-ink-600">No products yet. Add your first product.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([typeName, items]) => (
            <div key={typeName}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="font-display text-sm font-bold text-ink-900">{typeName}</h2>
                {items.length > 1 && <Badge tone="fresh">{items.length} companies carry this</Badge>}
              </div>
              <div className="space-y-2">
                {items.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-2xl border border-crate-100 bg-white p-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900">{companyName(p.company_id)}</p>
                      <p className="text-xs text-ink-600">
                        <span className="font-mono font-semibold text-crate-600">{productTag(p, companies)}</span> · {p.unit}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-ink-900">₹{p.price}</span>
                      <button onClick={() => openEditProduct(p)} aria-label={`Edit ${p.full_name} from ${companyName(p.company_id)}`} className="flex h-8 w-8 items-center justify-center rounded-full text-crate-600 active:bg-crate-50">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => handleDeleteProduct(p)} aria-label={`Remove ${p.full_name} from ${companyName(p.company_id)}`} className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 active:bg-red-50">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={productSheetOpen} title={editingProduct ? 'Edit product' : 'Add product'} onClose={() => setProductSheetOpen(false)}>
        <form onSubmit={handleProductSubmit}>
          <FormField label="Company">
            <Select required value={productForm.company_id} onChange={(e) => setProductForm((f) => ({ ...f, company_id: e.target.value }))}>
              <option value="" disabled>Choose a company</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Product name">
            <TextInput required value={productForm.full_name} onChange={(e) => setProductForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Full Cream Milk" />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Acronym">
              <TextInput required maxLength={5} value={productForm.acronym} onChange={(e) => setProductForm((f) => ({ ...f, acronym: e.target.value }))} placeholder="e.g. FCM" className="uppercase" />
            </FormField>
            <FormField label="Unit">
              <Select value={productForm.unit} onChange={(e) => setProductForm((f) => ({ ...f, unit: e.target.value as ProductUnit }))}>
                <option value="litre">Litre</option>
                <option value="packet">Packet</option>
                <option value="kg">Kg</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Price (₹)">
            <TextInput required type="number" min="0" step="0.5" value={productForm.price} onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))} />
          </FormField>
          {productForm.company_id && productForm.acronym && (
            <p className="mb-4 text-xs text-ink-600">
              Will display as <span className="font-mono font-semibold text-crate-600">{companies.find((c) => c.id === productForm.company_id)?.code}{productForm.acronym.toUpperCase()}</span>
            </p>
          )}
          <PrimaryButton type="submit">{editingProduct ? 'Save changes' : 'Add product'}</PrimaryButton>
          {editingProduct && (
            <div className="mt-3 text-center">
              <DangerLink type="button" onClick={() => handleDeleteProduct(editingProduct)}>Remove product</DangerLink>
            </div>
          )}
        </form>
      </Sheet>

      <Sheet open={companySheetOpen} title="Manage companies" onClose={() => setCompanySheetOpen(false)}>
        <div className="mb-4 space-y-2">
          {companies.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl bg-crate-50 px-3.5 py-2.5">
              <span className="text-sm font-semibold text-ink-900">{c.name} <span className="font-mono text-xs text-crate-600">({c.code})</span></span>
              <button onClick={() => handleDeleteCompany(c)} aria-label={`Remove ${c.name}`} className="text-red-500">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={handleAddCompany}>
          <div className="flex gap-2">
            <TextInput value={companyForm.name} onChange={(e) => setCompanyForm((f) => ({ ...f, name: e.target.value }))} placeholder="New company, e.g. Nandini" className="flex-1" />
            <TextInput value={companyForm.code} onChange={(e) => setCompanyForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="Code" maxLength={4} className="w-20 uppercase" />
          </div>
          <p className="mt-1.5 mb-3 text-xs text-ink-600">
            Code prefixes every product's acronym (e.g. "NAN" → NANFCM) so the same product type from different companies is never confused. Leave blank to auto-generate from the name.
          </p>
          <button type="submit" className="w-full rounded-xl bg-crate-500 py-2.5 text-sm font-semibold text-white">Add company</button>
        </form>
      </Sheet>
    </PageContainer>
  )
}
