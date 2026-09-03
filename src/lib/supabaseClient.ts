import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The app is now backed entirely by Supabase (multi-tenant: many vendors
// share one database, isolated by row-level security — see
// supabase/schema.sql). These env vars are required; App.tsx shows a
// friendly setup screen instead of a crash if they're missing.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null
