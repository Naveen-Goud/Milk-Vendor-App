import { FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js'

// supabase-js's functions.invoke() has a rough edge: when an Edge Function
// returns a non-2xx status, `error.message` is just the generic
// "Edge Function returned a non-2xx status code" — the actual JSON body
// your function sent back (e.g. { error: "..." }) is NOT what ends up in
// `error.message`. It's still readable, but only via `error.context`, which
// is the raw Response object, and has to be parsed separately. Every call
// site in this app was throwing the generic message and losing the real
// reason — this wraps that so the person actually sees why something
// failed (e.g. "Resend rejected this API key" instead of a dead end).
export async function invokeEdgeFunction<T = unknown>(
  client: SupabaseClient,
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await client.functions.invoke(name, { body })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      let realMessage: string | null = null
      try {
        const body = await error.context.json()
        realMessage = body?.error || body?.message || null
      } catch {
        // response body wasn't JSON — fall through to the generic message below
      }
      throw new Error(realMessage ?? error.message)
    }
    throw new Error(error.message)
  }

  const result = data as { error?: string } | null
  if (result?.error) throw new Error(result.error)
  return data as T
}
