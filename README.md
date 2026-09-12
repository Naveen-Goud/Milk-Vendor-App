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
supabase functions deploy manage-delivery-boy --no-verify-jwt
supabase functions deploy send-invoice-email --no-verify-jwt
supabase functions deploy manage-email-settings --no-verify-jwt
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected into every Edge Function automatically by Supabase — you don't
need to set these as secrets yourself.

`--no-verify-jwt` matters here: without it, Supabase's own platform gateway
checks the JWT before this function's code runs at all, which can mishandle
the browser's CORS preflight and surface as a confusing "CORS error" even
though the real cause is the platform layer, not this function. It already
does its own (better) auth check internally, so the platform check is
redundant — and if you deployed without this flag before and hit a CORS
error calling these functions, redeploying with it is the fix.

### 3b. Email sending for bills — BYOK (Bring Your Own Key)
Bills are emailed via [Resend](https://resend.com) — but since this app is
sold to multiple independent vendors sharing one deployment, there is **no
shared platform-level Resend key**. Each vendor connects their own free
Resend account from inside the app (**Settings → Email sending**), which
stores their key encrypted in Supabase Vault. This keeps each vendor's free
tier, deliverability reputation, and cost fully separate from every other
vendor's.

**One-time project setup (you, the app owner):**
1. Run the *entire* `supabase/schema.sql` (or, if you already have a live
   project from before this feature, just the new `vendor_email_settings`
   table / `vault_*` functions / trigger block — it's additive, doesn't
   touch any existing table). Supabase Vault ships enabled by default on
   every project; if `vault.create_secret` errors as "function does not
   exist", enable the **Vault** extension under **Database → Extensions**
   first.
2. Deploy the two email functions shown in step 3 above
   (`send-invoice-email` and `manage-email-settings`) — neither needs any
   secrets set manually; they read a vendor's key out of Vault at send time.

**Per-vendor setup (each vendor does this themselves, once):**
1. Sign up for a free [Resend](https://resend.com) account and grab an API
   key.
2. [Verify a sending domain](https://resend.com/domains) — until this is
   done, Resend's sandbox sender only delivers to the Resend account's own
   email address, which is fine for the test step below but not for real
   customers.
3. In the app: **Settings → Email sending → Set up email sending**. Paste
   the API key, the "from" address on the verified domain, send a test
   email to confirm it works, then save.

Once connected, **on-demand sending** (Billing screen → "Generate & email" /
"Resend") and **automatic monthly billing** (below) both just work — no
further config. A vendor who hasn't connected a key yet gets a clear
in-app message instead of a silent failure, and automated monthly billing
simply leaves their invoices as drafts until they do.

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
without an email address, or any vendor who hasn't connected their own
Resend key yet, as draft invoices to send manually.

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

## Email & WhatsApp billing

Bills are genuinely emailed via Resend — not just marked "sent." On-demand
sending happens from the Billing screen; a customer with an email on file
gets a real itemized HTML email when you tap "Email" or "Resend."

Each vendor connects their own Resend account (**Settings → Email
sending** — see setup step 3b above) rather than sharing one key across
every vendor on this app, so free-tier quota, deliverability reputation,
and cost are all isolated per vendor. A vendor who hasn't connected a key
yet sees a clear prompt instead of emails silently failing.

Every customer with a phone number also gets a **WhatsApp** button — free,
no setup, no Meta Business approval, using a `wa.me` click-to-chat link
that opens WhatsApp with the itemized bill pre-filled as a message. The one
real limitation: it's not fully automated — you (the vendor) still tap Send
in WhatsApp yourself. Full automation via the WhatsApp Cloud API is
possible but needs Meta Business verification and pre-approved message
templates, which is a separate setup this app doesn't include yet.

Optional automated monthly billing is available too (see setup above) — a
scheduled job that generates and emails last month's bills for every
customer with nothing extra to click, skipping anyone already invoiced for
that period. (The monthly job only sends email, not WhatsApp, since
WhatsApp sending here requires someone to tap Send.)

## Confirmed fixed (found via real device testing)

- **CORS error sending emails**: `send-invoice-email` and
  `manage-delivery-boy` were documented to deploy without
  `--no-verify-jwt`. Without it, Supabase's platform-level gateway can
  mishandle the browser's CORS preflight before the function's own code —
  and its own internal auth check — ever runs. Fixed in both the function
  comments and the deploy instructions above. **If you deployed either
  function before this fix, redeploy with `--no-verify-jwt` to pick it up.**
- **Bill quantities looked wrong for packet/kg products**: the underlying
  math was always correct (price × quantity, regardless of unit), but the
  display only ever appended a unit suffix ("L") for litre products —
  packet and kg quantities showed a bare, unlabeled number, which read as
  a calculation bug even though it wasn't one. Fixed: every quantity now
  shows its unit consistently, and the rate itself now shows what it's
  *per* (e.g. `₹20/pkt`) instead of a bare number.
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
- **WhatsApp sending is real but manual-tap, not automated**; SMS still
  isn't wired to anything. The WhatsApp button opens a pre-filled message
  via `wa.me` — genuinely sends, but the vendor taps Send themselves in
  WhatsApp. Full automation needs the WhatsApp Cloud API (Meta Business
  verification + pre-approved message templates) or an SMS provider (DLT
  registration in India) — both are real external approval processes, not
  something togglable in code. See the original plan's cost comparison if
  you want to pursue either.
