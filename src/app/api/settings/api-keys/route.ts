import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { generateApiKey } from '@/lib/api/api-keys'

// GET /api/settings/api-keys — list this org's keys (metadata only, no secrets).
export const GET = withCapability('settings:view', async (_req, orgId, supabase) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('api_keys')
    .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data: data ?? [] })
})

const createSchema = z.object({ name: z.string().min(1, 'Name is required').max(100) })

// POST /api/settings/api-keys — mint a new key. The raw key is returned exactly
// once here; only its hash is stored.
export const POST = withCapability('settings:edit', async (req, orgId, supabase, _ctx, _scope, userId) => {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid name' }, { status: 400 })
  }

  const { raw: rawKey, hash, prefix } = generateApiKey()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).from('api_keys')
    .insert({
      org_id: orgId,
      name: parsed.data.name,
      key_hash: hash,
      key_prefix: prefix,
      created_by: userId,
    })
    .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
    .single()

  if (error) return handleSupabaseError(error)

  // `key` is the ONLY time the raw token is ever exposed.
  return NextResponse.json({ data: { ...data, key: rawKey } }, { status: 201 })
})
