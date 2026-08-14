# Milk Vendor — Delivery Manager

A multi-tenant SaaS delivery & billing manager for milk/dairy vendors. Many
vendors share one deployed app — each sees only their own data, enforced by
the database itself (Postgres Row Level Security), not just the UI.

**Stack:** React + TypeScript + Vite + Tailwind CSS v4 + React Router
(HashRouter) + **Supabase** (Postgres, Auth, Edge Functions).

> ⚠️ **This has not been tested against a live database.** Everything here
> typechecks and builds cleanly, but it was written and verified without
> network access to any Supabase project. Treat the auth flows and the Edge
> Function especially as needing your own hands-on testing before you trust
> them with real data. See "Known limitations" at the bottom.

## Why Supabase, and what changed from earlier versions

Earlier versions of this app stored everything in the browser's
`localStorage` — simple, but it meant every vendor needed their *own*
deployment (their own repo, their own URL) to keep their data separate from
anyone else's. This version moves all data into a shared Postgres database
with Row Level Security, so **one deployed app can serve many vendors**,
each automatically isolated from every other vendor's customers, delivery
boys, and billing — without needing separate copies of the site.

## How accounts work

- **Vendors** sign up with a real email + password (Supabase Auth) — needed
  for account recovery, which PIN-only login never had.
- **Delivery boys** still log in with just a phone number + PIN — no real
  email required. Under the hood, they get a real Supabase Auth account too
  (so the same permission model applies uniformly to both roles), with a
  synthetic email like `db.9876543210@krishna1.deliveries.local` generated
  from their phone + their vendor's short **vendor code**. This account is
  created for them by a server-side Edge Function (see below) — never
  directly from the browser, which would otherwise hijack the vendor's own
  active session.
- The delivery-boy login screen asks for **vendor code + phone + PIN**
  (not a dropdown of names) — with many vendors sharing one app, there's no
  safe way to list every delivery boy across every tenant on a public login
  screen. The vendor code is what scopes the login attempt to the right
  tenant. Find it in Settings.

## Data isolation

Every vendor-owned table (`customers`, `products`, `invoices`, etc.) has a
`vendor_id` column. Postgres Row Level Security policies enforce that a
signed-in user can only ever read/write rows where `vendor_id` matches
their own tenant — see `supabase/schema.sql` for the full policy set. A
delivery boy's access is further narrowed to their own assigned route.

## Setup — this part is required, not optional

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com), create a free project, and grab
your **Project URL** and **anon public key** from Project Settings → API.

### 2. Run the schema
Open the Supabase SQL editor and run the entire contents of
`supabase/schema.sql`. This creates every table, the `vendors`/`profiles`
tenant model, and all Row Level Security policies.

### 3. Deploy the Edge Function
Delivery boy accounts need to be created server-side (using the
service-role key, which must never reach the browser). This requires the
[Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy manage-delivery-boy
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected into every Edge Function automatically by Supabase — you don't
need to set these as secrets yourself.

### 4. Configure environment variables
```bash
cp .env.example .env
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

### 5. Decide on email confirmation (Supabase Auth settings)
By default, Supabase requires a vendor to click a confirmation link before
they're fully logged in. The app **handles this correctly either way** —
if confirmation is required, sign-up shows a "check your email" screen, and
booth-details setup happens on their next real login (even from a
different device). For faster local testing, you can disable it under
Authentication → Providers → Email → "Confirm email" in the Supabase
dashboard — just know that's a testing convenience, not something the app
depends on.

### 6. Run it
```bash
npm install
npm run dev
```

Sign up as a vendor, note your **vendor code** from Settings, then add a
delivery boy from Manage → Delivery Boys — that's what exercises the Edge
Function for the first time. Give the delivery boy their vendor code,
phone, and PIN to log in with.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages** → Source: **GitHub Actions**.
3. **Settings → Secrets and variables → Actions** → add `VITE_SUPABASE_URL`
   and `VITE_SUPABASE_ANON_KEY` as repo secrets.
4. Push to `main` — `.github/workflows/deploy.yml` builds and deploys
   automatically. The app is now live and ready for any vendor to sign up.

## Project structure

```
src/
  types/index.ts             Domain types (multi-tenant: Vendor, Customer, DeliveryBoy, etc.)
  theme/theme.ts              Design tokens
  lib/
    attendance.ts              resolveDay(), calendar grid, route stock (with extra-litre tracking)
    billing.ts                 Invoice calculation engine
    ledger.ts                   Customer billed/paid/pending
    analytics.ts                 Revenue trends, top products/customers, attendance rate, dues
    productTag.ts                 Company-aware product tag/label helpers
    authEmails.ts                  Synthetic delivery-boy email + vendor code generation
    db.ts                           Typed Supabase query layer — every table read/write goes through here
    supabaseClient.ts                 The Supabase client instance
  context/AppContext.tsx      Auth state machine + tenant data cache + all mutations
  components/                 atoms/ molecules/ organisms/ templates/ — see below
  pages/                      Onboarding (sign-up), Login, Dashboard, DeliveryLog, Billing,
                               Analytics, Manage, Customers, CustomerAttendance, Products,
                               DeliveryBoys, Settings, Profile
supabase/
  schema.sql                 Full multi-tenant Postgres schema + Row Level Security
  functions/manage-delivery-boy/index.ts   Edge Function: create/update/delete delivery boy accounts
.github/workflows/deploy.yml   Auto-deploy to GitHub Pages on push to main
```

## The attendance model — "default present"

Every customer is assumed delivered as usual by default; nothing is
recorded for a normal day. A delivery boy only ever taps a customer to
record an exception — **Mark absent** or **Modify** (with **Undo** to
revert). One function, `resolveDay()`, is the single source of truth the
delivery log, the attendance calendar, the milk stock summary, and the
billing engine all call.

## Billing, payments, and analytics

Unchanged in spirit from earlier versions, now backed by real queries
instead of localStorage: invoices are computed live (never stored as a
static total), each customer has a running billed/paid/pending ledger with
a "Record payment" action, and Dashboard → Analytics shows daily revenue,
revenue by product, top customers, attendance rate, and outstanding dues.

## Known limitations — read before relying on this in production

- **Not tested against a live database.** Typecheck/build/lint pass; the
  actual auth flows, RLS policies, and Edge Function have not been
  exercised against a real Supabase project. Test the sign-up → add
  delivery boy → delivery boy login path end-to-end yourself before trusting it.
- **Product pricing is technically readable by delivery boys via direct
  API calls.** The app's UI never shows them price, and route guards keep
  them off the Billing/Products screens — but that's client-side. The
  `products` table's Row Level Security policy allows any authenticated
  member of a tenant (including delivery boys) to read it, because they
  legitimately need the product name/acronym/unit to know what to deliver,
  and Postgres RLS can't hide one column while allowing the rest without
  extra work (a security-definer view/function returning only non-price
  columns). Flagged in detail in `supabase/schema.sql` right above the
  `products` table — worth closing before this handles pricing sensitive
  enough to matter.
- **No real-time sync across devices yet.** Data refetches on mutation and
  on load, but two people looking at the same route simultaneously won't
  see each other's changes live. Supabase Realtime subscriptions would be
  the natural next step.
- **Vendor code collisions**: auto-generated and retried up to 5 times on
  collision, but not exhaustively guaranteed unique at very large scale.
- **No password reset flow built for vendors** beyond what Supabase Auth
  provides out of the box (which does support it — just not wired into
  this UI yet). Delivery boys can't self-service a forgotten PIN; the
  vendor resets it for them from Delivery Boys.
- **`lookup_vendor_by_code`** SQL function exists in the schema (for a
  future "show business name before login" UX nicety) but isn't called by
  the app yet.
