import type { Company, Product } from '../types'

// A product's `acronym` (e.g. "FCM") is only unique within its own company —
// Heritage and Vijaya can both have an FCM. `productTag` prefixes the
// company's short code so labels stay unambiguous everywhere they're shown
// (delivery log, subscriptions, product catalog, invoices).

export function companyCode(company: Company | undefined): string {
  if (!company) return ''
  return company.code || company.name.slice(0, 3).toUpperCase()
}

export function findCompany(companies: Company[], product: Product): Company | undefined {
  return companies.find((c) => c.id === product.company_id)
}

export function productTag(product: Product, companies: Company[]): string {
  return `${companyCode(findCompany(companies, product))}${product.acronym}`
}

export function productFullLabel(product: Product, companies: Company[]): string {
  const company = findCompany(companies, product)
  return `${company ? company.name + ' ' : ''}${product.full_name}`
}
