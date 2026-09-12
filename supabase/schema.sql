-- ============================================================================
-- Milk Vendor Delivery Management — Multi-tenant Supabase schema
-- Run this in the Supabase SQL editor on a fresh project.
--
-- MULTI-TENANCY MODEL
-- One shared database, many vendors. Every vendor-owned table carries a
-- `vendor_id`, and Row Level Security enforces that a signed-in user only
-- ever sees rows belonging to their own vendor — this is what lets many
-- vendors safely share one deployed app instead of each needing their own
-- copy of the site.
--
-- ACCOUNTS
-- - A vendor owner signs up with a real email + password (Supabase Auth).
--   Their `vendors` row is keyed by their own auth.users id.
-- - Delivery boys are ALSO real Supabase Auth users (so the same RLS model
--   applies to them uniformly), but they don't have real emails. They get a
--   synthetic email like `db.9876543210@ABCD12.deliveries.local` (phone +
--   the vendor's short code) and their PIN as the password. This account is
--   created for them by the `manage-delivery-boy` Edge Function (see
--   supabase/functions/) using the service-role key, which is the only way
--   to create a pre-confirmed auth user without them ever seeing a real
--   inbox. NEVER create delivery boy accounts from the client directly with
--   the anon key — signUp() would hijack the vendor's own active session.
-- ============================================================================

-- One row per vendor "tenant". id == the owner's auth.users id.
create table public.vendors (
  id uuid primary key references auth.users(id) on delete cascade,
  vendor_code text not null unique, -- short human-typeable code, e.g. 'KRISHNA1' — delivery boys use this to log in
  business_name text not null,
  owner_name text not null,
  phone text,
  address text,
  tagline text,
  delivery_charge numeric(10,2) not null default 0,
  created_at timestamptz default now()
);

-- One row per auth user (vendor owner OR delivery boy), linking them to a
-- vendor and a role. This is what every RLS policy below keys off.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  role text not null check (role in ('vendor', 'delivery_boy')),
  full_name text not null,
  phone text,
  route_id uuid, -- only set for delivery_boy profiles; FK added after routes table exists
  created_at timestamptz default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  name text not null,
  code text not null -- short prefix (e.g. 'HER') used in every product's display tag, e.g. HERFCM
);

-- KNOWN LIMITATION: delivery boys can read this table (see the generic
-- tenant-read policy below), which technically means `price` is readable by
-- a delivery boy who queries the Supabase REST API directly, bypassing the
-- UI (the app's screens never show them price, and route guards keep them
-- off the Billing/Products pages — but that's a client-side restriction,
-- not a database one). This is a genuine trade-off: delivery boys need
-- product name/acronym/unit to know what to deliver, and Postgres RLS
-- can't hide a single column while allowing the rest of a row without
-- extra machinery (a security-definer function/view scoped to their own
-- vendor, returning only the non-price columns). Worth closing before this
-- handles pricing sensitive enough to matter — see README "Known limitations".
create table public.products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  full_name text not null,
  acronym text not null,
  unit text not null check (unit in ('litre', 'packet', 'kg')),
  price numeric(10,2) not null,
  is_active boolean default true
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  name text not null,
  delivery_boy_id uuid references public.profiles(id)
);

alter table public.profiles add constraint profiles_route_id_fkey foreign key (route_id) references public.routes(id) on delete set null;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  route_id uuid references public.routes(id) on delete set null,
  is_paused boolean default false,
  created_at timestamptz default now()
);

create table public.customer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  product_id uuid references public.products(id),
  default_qty numeric(6,2) not null
);

-- ----------------------------------------------------------------------------
-- Attendance: "default present". A customer is assumed delivered-as-usual
-- (per their customer_subscriptions rows) on every active day. Only
-- deviations are ever written here.
-- ----------------------------------------------------------------------------

create table public.delivery_exceptions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  delivery_boy_id uuid references public.profiles(id),
  date date not null,
  status text not null check (status in ('skipped', 'modified')),
  created_at timestamptz default now(),
  unique (customer_id, date)
);

create table public.delivery_exception_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  exception_id uuid references public.delivery_exceptions(id) on delete cascade,
  product_id uuid references public.products(id),
  quantity numeric(6,2) not null,
  price_at_delivery numeric(10,2) not null
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  sent_via text check (sent_via in ('email', 'whatsapp', 'sms')),
  sent_at timestamptz,
  created_at timestamptz default now()
  -- Deliberately no total_amount: always computed live from
  -- customer_subscriptions + delivery_exceptions, never stored.
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  amount numeric(10,2) not null,
  date date not null,
  method text not null check (method in ('cash', 'upi', 'other')),
  note text,
  created_at timestamptz default now()
);

create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  status text not null check (status in ('sent', 'failed')),
  cost_estimate numeric(6,4) default 0,
  sent_at timestamptz default now()
);

-- ============================================================================
-- Row Level Security
-- ============================================================================

create or replace function public.current_vendor_id() returns uuid as $$
  select vendor_id from public.profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function public.current_role() returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function public.current_route_id() returns uuid as $$
  select route_id from public.profiles where id = auth.uid();
$$ language sql stable security definer;

alter table public.vendors enable row level security;
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.products enable row level security;
alter table public.routes enable row level security;
alter table public.customers enable row level security;
alter table public.customer_subscriptions enable row level security;
alter table public.delivery_exceptions enable row level security;
alter table public.delivery_exception_items enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.notification_logs enable row level security;

-- vendors: SELECT uses current_vendor_id() (not auth.uid()) so BOTH the
-- vendor owner AND their delivery boys can read the vendor row — a
-- delivery boy's own auth.uid() is their own account id, not the vendor's.
-- UPDATE/INSERT stay restricted to id = auth.uid() (owner only): only the
-- actual vendor should change business settings, and the insert check is
-- what lets a new vendor create their own row during sign-up.
create policy "tenant reads own vendor row" on public.vendors for select using (id = public.current_vendor_id());
create policy "vendor updates own row" on public.vendors for update using (id = auth.uid());
create policy "new vendor can insert own row" on public.vendors for insert with check (id = auth.uid());

-- profiles: everyone in a vendor's tenant can see each other's profile
-- (needed so the vendor can list their delivery boys); only the vendor role
-- can insert/update/delete profiles for their tenant (delivery boy profiles
-- are actually managed via the manage-delivery-boy Edge Function using the
-- service role key, which bypasses RLS entirely — these policies mainly
-- cover the vendor's own profile row and read access).
create policy "read profiles in own vendor" on public.profiles for select using (vendor_id = public.current_vendor_id());
create policy "vendor manages profiles in own vendor" on public.profiles for all
  using (public.current_role() = 'vendor' and vendor_id = public.current_vendor_id())
  with check (public.current_role() = 'vendor' and vendor_id = public.current_vendor_id());
create policy "new vendor can insert own profile" on public.profiles for insert with check (id = auth.uid());

-- Generic "vendor full access, everyone in tenant can read" pattern —
-- deliberately limited to low-sensitivity operational tables only. Billing
-- data (invoices, payments) and per-customer subscriptions are handled
-- separately below with tighter, vendor-only or route-scoped policies.
do $$
declare
  t text;
begin
  foreach t in array array['companies','products','routes']
  loop
    execute format('create policy "tenant read %1$s" on public.%1$s for select using (vendor_id = public.current_vendor_id())', t);
    execute format('create policy "vendor writes %1$s" on public.%1$s for all using (public.current_role() = ''vendor'' and vendor_id = public.current_vendor_id()) with check (public.current_role() = ''vendor'' and vendor_id = public.current_vendor_id())', t);
  end loop;
end $$;

-- customer_subscriptions: same access shape as customers — vendor sees
-- everything, a delivery boy only sees subscriptions for customers on their
-- own route (needed so they know what to deliver, nothing more).
create policy "vendor full access to customer_subscriptions" on public.customer_subscriptions for all
  using (public.current_role() = 'vendor' and vendor_id = public.current_vendor_id())
  with check (public.current_role() = 'vendor' and vendor_id = public.current_vendor_id());
create policy "delivery boy reads own route subscriptions" on public.customer_subscriptions for select
  using (
    public.current_role() = 'delivery_boy' and vendor_id = public.current_vendor_id()
    and customer_id in (select id from public.customers where route_id = public.current_route_id())
  );

-- Billing data is vendor-only, full stop. A delivery boy has no legitimate
-- reason to read invoices, payments, or notification logs — this is what
-- actually enforces "pricing and billing should not be seen by him" at the
-- database level, not just by hiding the Billing screen in the UI.
do $$
declare
  t text;
begin
  foreach t in array array['invoices','payments','notification_logs']
  loop
    execute format('create policy "vendor only %1$s" on public.%1$s for all using (public.current_role() = ''vendor'' and vendor_id = public.current_vendor_id()) with check (public.current_role() = ''vendor'' and vendor_id = public.current_vendor_id())', t);
  end loop;
end $$;

-- customers: vendor sees everyone in their tenant; a delivery boy only ever
-- sees customers on their own assigned route.
create policy "vendor full access to customers" on public.customers for all
  using (public.current_role() = 'vendor' and vendor_id = public.current_vendor_id())
  with check (public.current_role() = 'vendor' and vendor_id = public.current_vendor_id());
create policy "delivery boy reads own route customers" on public.customers for select
  using (public.current_role() = 'delivery_boy' and vendor_id = public.current_vendor_id() and route_id = public.current_route_id());

-- delivery_exceptions / delivery_exception_items: vendor full access;
-- delivery boy can create/update exceptions only for their own route's
-- customers, and only read within their tenant.
create policy "vendor full access to delivery_exceptions" on public.delivery_exceptions for all
  using (public.current_role() = 'vendor' and vendor_id = public.current_vendor_id())
  with check (public.current_role() = 'vendor' and vendor_id = public.current_vendor_id());
create policy "delivery boy manages own route exceptions" on public.delivery_exceptions for all
  using (
    public.current_role() = 'delivery_boy' and vendor_id = public.current_vendor_id()
    and customer_id in (select id from public.customers where route_id = public.current_route_id())
  )
  with check (
    public.current_role() = 'delivery_boy' and vendor_id = public.current_vendor_id()
    and customer_id in (select id from public.customers where route_id = public.current_route_id())
  );

create policy "vendor full access to exception_items" on public.delivery_exception_items for all
  using (public.current_role() = 'vendor' and vendor_id = public.current_vendor_id())
  with check (public.current_role() = 'vendor' and vendor_id = public.current_vendor_id());
create policy "delivery boy manages own route exception_items" on public.delivery_exception_items for all
  using (
    public.current_role() = 'delivery_boy' and vendor_id = public.current_vendor_id()
    and exception_id in (
      select de.id from public.delivery_exceptions de
      join public.customers c on c.id = de.customer_id
      where c.route_id = public.current_route_id()
    )
  )
  with check (
    public.current_role() = 'delivery_boy' and vendor_id = public.current_vendor_id()
    and exception_id in (
      select de.id from public.delivery_exceptions de
      join public.customers c on c.id = de.customer_id
      where c.route_id = public.current_route_id()
    )
  );

-- ============================================================================
-- BYOK email sending
--
-- This app is sold to multiple independent vendors sharing one deployment.
-- If every vendor's invoice emails went out through one Resend API key
-- owned by the app owner, three things would break as vendors are added:
--   1. Free-tier quota (3,000/mo, 100/day) is shared across ALL vendors,
--      not given per-vendor.
--   2. One vendor's bounces/spam-complaints hurt deliverability for every
--      other vendor sending from the same domain/account.
--   3. The app owner is stuck paying (and being responsible for) every
--      vendor's email volume indefinitely.
--
-- So instead, each vendor supplies their OWN free Resend account and API
-- key ("Bring Your Own Key"). The key is never stored in plaintext in an
-- ordinary table — it's stored in Supabase Vault (encrypted at rest via
-- pgsodium), and vendor_email_settings only holds a reference to it plus
-- display-safe metadata (last 4 characters, from-address, verification
-- status). Only the service role (used inside Edge Functions, never the
-- browser) can ever read the decrypted key back out.
-- ============================================================================

create table public.vendor_email_settings (
  vendor_id uuid primary key references public.vendors(id) on delete cascade,
  secret_id uuid not null, -- points to vault.secrets.id; the real key lives there, not here
  from_email text not null,
  from_name text,
  key_last4 text not null, -- last 4 chars only — lets the UI show "•••• ab12" without ever re-reading the real key
  verified_at timestamptz, -- set once a test send using this exact key has actually succeeded
  updated_at timestamptz not null default now()
);

alter table public.vendor_email_settings enable row level security;

create policy "vendor reads own email settings" on public.vendor_email_settings for select
  using (public.current_role() = 'vendor' and vendor_id = public.current_vendor_id());
-- Deliberately NO insert/update/delete policy for authenticated users. All
-- writes go through the manage-email-settings Edge Function (service role),
-- so the Vault secret and this metadata row can never drift out of sync —
-- e.g. a row pointing at a secret_id that's already been deleted.

-- Vault wrapper functions. Supabase Vault's own functions/views (vault.*)
-- aren't exposed over the REST API, so these thin security-definer
-- wrappers are what the Edge Function actually calls via .rpc(). Each one
-- is explicitly revoked from anon/authenticated and granted only to
-- service_role — a stolen anon key can never use these to read a vendor's
-- API key, even though the wrapper functions technically live in `public`.

create or replace function public.vault_save_vendor_api_key(p_vendor_id uuid, p_api_key text, p_old_secret_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_new_id uuid;
begin
  if p_old_secret_id is not null then
    delete from vault.secrets where id = p_old_secret_id;
  end if;
  v_new_id := vault.create_secret(p_api_key, 'vendor_resend_key_' || p_vendor_id::text, 'Resend API key for vendor ' || p_vendor_id::text);
  return v_new_id;
end;
$$;
revoke all on function public.vault_save_vendor_api_key(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.vault_save_vendor_api_key(uuid, text, uuid) to service_role;

create or replace function public.vault_get_secret(p_secret_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_secret_id;
$$;
revoke all on function public.vault_get_secret(uuid) from public, anon, authenticated;
grant execute on function public.vault_get_secret(uuid) to service_role;

create or replace function public.vault_delete_secret(p_secret_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets where id = p_secret_id;
end;
$$;
revoke all on function public.vault_delete_secret(uuid) from public, anon, authenticated;
grant execute on function public.vault_delete_secret(uuid) to service_role;

-- Belt-and-suspenders cleanup: if a vendor_email_settings row is ever
-- deleted directly (rather than through the Edge Function's 'remove'
-- action, which already deletes the Vault secret itself), this makes sure
-- the Vault secret doesn't get orphaned.
create or replace function public.cleanup_vendor_vault_secret()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$$;
create trigger trg_cleanup_vendor_vault_secret
  before delete on public.vendor_email_settings
  for each row execute function public.cleanup_vendor_vault_secret();

-- Public, unauthenticated lookup: given a vendor_code, resolve which vendor
-- it belongs to (id + display name only — nothing sensitive). This is what
-- lets the delivery-boy login screen validate a vendor code before
-- attempting a real sign-in with phone+PIN.
create or replace function public.lookup_vendor_by_code(code text)
returns table (id uuid, business_name text) as $$
  select id, business_name from public.vendors where vendor_code = upper(code);
$$ language sql stable security definer;

-- ============================================================================
-- OPTIONAL: monthly automated billing
-- Do NOT run this block until:
--   1. You've deployed the monthly-billing-run Edge Function
--      (supabase functions deploy monthly-billing-run --no-verify-jwt)
--   2. You've set its CRON_SECRET secret and have that same value ready
--      to paste below in place of 'YOUR_CRON_SECRET_HERE'
--   3. You've replaced YOUR_PROJECT_REF in the URL below with your actual
--      project ref (from your Project URL, https://YOUR_PROJECT_REF.supabase.co)
--
-- This schedules the function to run at 3:00 AM UTC on the 1st of every
-- month, which generates and emails last month's bills for every vendor's
-- customers who don't already have one for that period. Requires the
-- pg_cron and pg_net extensions — enable both first under
-- Database -> Extensions in the Supabase dashboard.
-- ============================================================================

-- select cron.schedule(
--   'monthly-billing-run',
--   '0 3 1 * *',
--   $$
--   select net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/monthly-billing-run',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET_HERE', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- To check it's scheduled: select * from cron.job;
-- To remove it later: select cron.unschedule('monthly-billing-run');
