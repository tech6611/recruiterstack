/**
 * One-shot migration: copy each org's Google/Microsoft/Zoom tokens from
 * org_settings to user_integrations, attributing them to the org's primary
 * admin (first org_members row with role='admin', ordered by created_at ASC).
 *
 * Slack is intentionally skipped — it stays org-level.
 *
 * Run once, after Phase B is deployed and the Clerk backfill has populated
 * users + org_members:
 *
 *   npx tsx scripts/migrate-org-tokens-to-users.ts
 *
 * Idempotent — user_integrations uses UNIQUE(user_id, provider), so rerunning
 * is a no-op. Existing per-user rows are NOT overwritten (we only fill gaps).
 *
 * org_settings columns are left intact so the host-resolver's legacy fallback
 * continues to work for orgs where this script didn't run yet.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
try {
  const envLines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of envLines) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch { /* rely on existing env */ }

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type OrgRow = {
  org_id: string
  google_oauth_access_token:  string | null
  google_oauth_refresh_token: string | null
  google_oauth_token_expiry:  string | null
  google_connected_email:     string | null
  ms_access_token:    string | null
  ms_refresh_token:   string | null
  ms_token_expiry:    string | null
  ms_tenant_id:       string | null
  ms_connected_email: string | null
  zoom_access_token:    string | null
  zoom_refresh_token:   string | null
  zoom_token_expiry:    string | null
  zoom_account_id:      string | null
  zoom_connected_email: string | null
}

type Provider = 'google' | 'microsoft' | 'zoom'

interface Stats {
  copied: number
  skipped_existing: number
  skipped_no_tokens: number
  skipped_no_admin: number
  failed: number
}

async function findPrimaryAdmin(orgId: string): Promise<string | null> {
  const { data } = await supabase
    .from('org_members')
    .select('user_id, created_at')
    .eq('org_id', orgId)
    .eq('role', 'admin')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)

  return (data?.[0]?.user_id as string | undefined) ?? null
}

async function upsertIfAbsent(
  userId: string,
  orgId: string,
  provider: Provider,
  columns: {
    access_token_encrypted: string | null
    refresh_token_encrypted: string | null
    token_expiry: string | null
    connected_email: string | null
    tenant_id?: string | null
    account_id?: string | null
  },
): Promise<'copied' | 'skipped_existing' | 'skipped_no_tokens' | 'failed'> {
  if (!columns.access_token_encrypted || !columns.refresh_token_encrypted) {
    return 'skipped_no_tokens'
  }

  // If a row already exists for this (user, provider), don't overwrite — the
  // user may have connected fresh since the legacy tokens were stored.
  const { data: existing } = await supabase
    .from('user_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()

  if (existing) return 'skipped_existing'

  const { error } = await supabase.from('user_integrations').insert({
    user_id: userId,
    org_id: orgId,
    provider,
    access_token_encrypted: columns.access_token_encrypted,
    refresh_token_encrypted: columns.refresh_token_encrypted,
    token_expiry: columns.token_expiry,
    connected_email: columns.connected_email,
    tenant_id: columns.tenant_id ?? null,
    account_id: columns.account_id ?? null,
    scopes: [],
    connected_at: new Date().toISOString(),
  })

  if (error) {
    console.error(`  ✖ insert ${provider} for ${userId}: ${error.message}`)
    return 'failed'
  }
  return 'copied'
}

async function migrateOrg(row: OrgRow, stats: Stats): Promise<void> {
  const adminId = await findPrimaryAdmin(row.org_id)
  if (!adminId) {
    console.warn(`  ⚠ ${row.org_id}: no admin in org_members — skipping (connect an admin first)`)
    stats.skipped_no_admin++
    return
  }

  console.log(`  ${row.org_id} → admin ${adminId}`)

  // Google
  const g = await upsertIfAbsent(adminId, row.org_id, 'google', {
    access_token_encrypted:  row.google_oauth_access_token,
    refresh_token_encrypted: row.google_oauth_refresh_token,
    token_expiry:            row.google_oauth_token_expiry,
    connected_email:         row.google_connected_email,
  })
  bumpStat(stats, g)

  // Microsoft
  const m = await upsertIfAbsent(adminId, row.org_id, 'microsoft', {
    access_token_encrypted:  row.ms_access_token,
    refresh_token_encrypted: row.ms_refresh_token,
    token_expiry:            row.ms_token_expiry,
    connected_email:         row.ms_connected_email,
    tenant_id:               row.ms_tenant_id,
  })
  bumpStat(stats, m)

  // Zoom
  const z = await upsertIfAbsent(adminId, row.org_id, 'zoom', {
    access_token_encrypted:  row.zoom_access_token,
    refresh_token_encrypted: row.zoom_refresh_token,
    token_expiry:            row.zoom_token_expiry,
    connected_email:         row.zoom_connected_email,
    account_id:              row.zoom_account_id,
  })
  bumpStat(stats, z)
}

function bumpStat(stats: Stats, outcome: 'copied' | 'skipped_existing' | 'skipped_no_tokens' | 'failed'): void {
  if (outcome === 'copied') stats.copied++
  else if (outcome === 'skipped_existing') stats.skipped_existing++
  else if (outcome === 'skipped_no_tokens') stats.skipped_no_tokens++
  else stats.failed++
}

async function main() {
  console.log('Fetching org_settings rows with any OAuth tokens…')
  const { data: orgs, error } = await supabase
    .from('org_settings')
    .select(
      'org_id, ' +
      'google_oauth_access_token, google_oauth_refresh_token, google_oauth_token_expiry, google_connected_email, ' +
      'ms_access_token, ms_refresh_token, ms_token_expiry, ms_tenant_id, ms_connected_email, ' +
      'zoom_access_token, zoom_refresh_token, zoom_token_expiry, zoom_account_id, zoom_connected_email',
    )

  if (error) {
    console.error('Failed to read org_settings:', error.message)
    process.exit(1)
  }

  const stats: Stats = {
    copied: 0,
    skipped_existing: 0,
    skipped_no_tokens: 0,
    skipped_no_admin: 0,
    failed: 0,
  }

  const rows = (orgs ?? []) as unknown as OrgRow[]
  console.log(`  found ${rows.length} orgs\n`)

  for (const row of rows) {
    await migrateOrg(row, stats)
  }

  console.log('\n── Summary ────────────────────────────')
  console.log(`Copied:              ${stats.copied}`)
  console.log(`Skipped (existing):  ${stats.skipped_existing}`)
  console.log(`Skipped (no tokens): ${stats.skipped_no_tokens}`)
  console.log(`Skipped (no admin):  ${stats.skipped_no_admin}`)
  console.log(`Failed:              ${stats.failed}`)

  if (stats.failed > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
