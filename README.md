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

### 3b. Set up real email sending for bills
Bills are actually emailed now (not just marked "sent") via
[Resend](https://resend.com) — free tier is plenty for a small vendor.

1. Create a free Resend account and grab an API key.
2. (Recommended for real vendors, optional for testing) [Verify a sending
   domain](https://resend.com/domains) — until you do, Resend's sandbox
   sender only delivers to your own Resend account's email address.
3. Set the secrets and deploy:
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxx
   supabase secrets set RESEND_FROM_EMAIL="billing@yourdomain.com"
   supabase functions deploy send-invoice-email
   ```
4. **On-demand sending** (Billing screen → "Generate & email" / "Resend")
   works as soon as this is deployed — no further setup needed.
5. **Automatic monthly billing** is optional — see below.

### Automating monthly billing (optional)
Generates and emails last month's bills for every vendor's customers
automatically, on a schedule, with no one needing to click anything.

1. ```bash
   supabase secrets set CRON_SECRET=$(openssl rand -hex 24)
   supabase functions deploy monthly-billing-run --no-verify-jwt
   ```
2. Supabase dashboard → **Database → Extensions** → enable both `pg_cron`
   and `pg_net`.
3. In the SQL editor, uncomment and run the `cron.schedule(...)` block at
   the bottom of `supabase/schema.sql` — fill in your project ref and the
   same `CRON_SECRET` from step 1.
4. Verify: `select * from cron.job;`

Runs at 3 AM UTC on the 1st of every month; skips customers who already
have an invoice for that period or had nothing delivered; leaves anyone
without an email as a draft invoice for the vendor to send manually.

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

## Email billing

Bills are genuinely emailed via Resend now — not just marked "sent."
On-demand sending happens from the Billing screen; a customer with an
email on file gets a real itemized HTML email when you tap "Generate &
email" or "Resend." Customers without an email fall back to the old
status-flip behavior for now (WhatsApp/SMS sending isn't wired to a real
provider yet — see limitations below).

Optional automated monthly billing is available too (see setup above) — a
scheduled job that generates and emails last month's bills for every
customer with nothing extra to click, skipping anyone already invoiced for
that period.

## Confirmed fixed (found via real device testing)

- The `vendors` table RLS policy that silently blocked delivery boys from
  loading their own vendor's data (fixed: now uses `current_vendor_id()`
  instead of `auth.uid()` for reads).
- Milk stock numbers not aligning under their column headers (fixed: header
  and rows now share one grid template instead of independently-hidden
  zero values shifting columns out of sync).
- The attendance calendar showing every day as "present" going back through
  history for a customer who was only just added (fixed: `resolveDay()`
  now checks the customer's actual creation date and shows those days as
  blank/inactive instead).

## Known limitations — read before relying on this in production

- **The newest changes (route-analytics expansion, today's-status
  drill-down, real email sending, monthly cron) have not been tested
  against a live database yet** — typecheck/build/lint pass, but that's
  static analysis, not a substitute for clicking through it. The email
  Edge Functions in particular are worth testing carefully: try an
  on-demand send first before trusting the monthly cron job with real
  vendor data.
- **Resend's sandbox sender only delivers to your own Resend account
  email** until you verify a sending domain — if a real customer's email
  isn't receiving bills, check whether you've verified a domain yet.
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
- **WhatsApp/SMS bill sending** still just flips the invoice status without
  actually sending anything — only email is real. See the original plan's
  cost comparison if you want to add the WhatsApp Cloud API next.
