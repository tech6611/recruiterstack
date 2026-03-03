import { createBrowserClient } from '@supabase/ssr'

// Typed generics are intentionally omitted here; use explicit type casts
// on query results. Once `supabase gen types typescript` is run, replace
// `any` with the generated Database type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
