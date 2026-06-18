import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const scanRoots = ['src/app', 'src/lib', 'src/components']

// `--check` (CI mode): exit non-zero if any caller file is `legacy`/`mixed` and
// NOT in the allowlist below. Default (no flag): print the report and exit 0.
const CHECK_MODE = process.argv.includes('--check')

// Files permitted to remain `legacy`/`mixed`: explicit, frozen-by-decision
// compatibility bridges (see docs/canonical-ownership-matrix.md). Net-new core
// work must NOT add to this list — it must use canonical services / domain
// facades. A new legacy/mixed file outside this set fails `--check`.
const LEGACY_ALLOWLIST = new Set([
  // Phase 3 / C6: the legacy hiring_requests CRUD routes and the intake →
  // hiring_requests flow have been retired. Intake now writes canonical `jobs`
  // via domain facades, so no allowlisted compatibility bridges remain. Net-new
  // core work must NOT add to this list — use canonical services / domain facades.
])
const trackedTables = [
  'hiring_requests',
  'jobs',
  'openings',
  'job_openings',
  'job_postings',
  'roles',
  'candidates',
  'applications',
  'interviews',
  'offers',
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue
      out.push(...walk(full))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

function classifyTables(tables, file) {
  if (file === 'src/lib/domain/reporting.ts') return 'adapter'
  if (file === 'src/lib/domain/role-profiles.ts') return 'adapter'
  if (tables.includes('hiring_requests') && tables.includes('jobs')) return 'adapter'
  const hasLegacyWork = tables.some(t => ['hiring_requests', 'roles'].includes(t))
  const hasCanonicalWork = tables.some(t => ['jobs', 'openings', 'job_openings', 'job_postings'].includes(t))
  if (hasLegacyWork && hasCanonicalWork) return 'mixed'
  if (hasCanonicalWork) return 'canonical'
  if (hasLegacyWork) return 'legacy'
  if (tables.some(t => ['applications', 'candidates', 'interviews', 'offers'].includes(t))) return 'compatibility'
  return 'unclassified'
}

function ownerForTables(tables) {
  if (tables.includes('openings')) return 'Opening'
  if (tables.includes('jobs') || tables.includes('job_openings')) return 'Job Pipeline'
  if (tables.includes('job_postings')) return 'Posting'
  if (tables.includes('applications')) return 'Application'
  if (tables.includes('candidates')) return 'Person + Candidate Profile'
  if (tables.includes('interviews')) return 'Interview'
  if (tables.includes('offers')) return 'Offer'
  if (tables.includes('roles')) return 'Role Profile'
  if (tables.includes('hiring_requests')) return 'Opening / Job Pipeline compatibility'
  return 'Unknown'
}

function recommendation(status, tables, file) {
  if (status === 'mixed') return 'Split behind canonical domain helpers before adding behavior.'
  if (status === 'legacy') return 'Freeze for net-new behavior; migrate callers to canonical services.'
  if (status === 'canonical') return 'Keep aligned; ensure writes set org_id explicitly.'
  if (status === 'compatibility') {
    if (tables.includes('candidates')) return 'Keep stable; design new fields for future people/profile split.'
    if (tables.includes('applications')) return 'Keep application-centric; avoid direct legacy job assumptions.'
    return 'Keep stable while upstream canonical links are introduced.'
  }
  if (file.includes('/api/')) return 'No tracked model table found; review manually if it writes business data.'
  return 'No action.'
}

const files = scanRoots.flatMap(dir => walk(join(root, dir)))
const rows = []

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const tables = trackedTables.filter(table => {
    const pattern = new RegExp(`\\.from\\(['"\`]${table}['"\`]\\)`)
    return pattern.test(text)
  })
  if (tables.length === 0) continue

  const rel = relative(root, file)
  const status = classifyTables(tables, rel)
  rows.push({
    file: rel,
    status,
    owner: ownerForTables(tables),
    tables,
    recommendation: recommendation(status, tables, rel),
  })
}

rows.sort((a, b) => {
  const rank = { mixed: 0, legacy: 1, adapter: 2, compatibility: 3, canonical: 4, unclassified: 5 }
  return (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.file.localeCompare(b.file)
})

const counts = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] ?? 0) + 1
  return acc
}, {})

console.log('# Canonical Model Audit')
console.log('')
console.log(`Scanned ${files.length} TypeScript files.`)
console.log('')
console.log('## Summary')
console.log('')
for (const key of ['mixed', 'legacy', 'adapter', 'compatibility', 'canonical']) {
  console.log(`- ${key}: ${counts[key] ?? 0}`)
}
console.log('')
console.log('## Findings')
console.log('')
console.log('| File | Status | Owner | Tables | Recommendation |')
console.log('| --- | --- | --- | --- | --- |')
for (const row of rows) {
  console.log(`| \`${row.file}\` | ${row.status} | ${row.owner} | ${row.tables.map(t => `\`${t}\``).join(', ') || '-'} | ${row.recommendation} |`)
}

// ── Drift guard (--check) ──────────────────────────────────────────────────
if (CHECK_MODE) {
  console.log('')
  const violations = rows.filter(
    r => (r.status === 'legacy' || r.status === 'mixed') && !LEGACY_ALLOWLIST.has(r.file),
  )
  if (violations.length > 0) {
    console.error(`## Drift guard FAILED — ${violations.length} unapproved legacy/mixed file(s)`)
    for (const v of violations) {
      console.error(`  ✗ ${v.file}  (${v.status}; tables: ${v.tables.join(', ')})`)
    }
    console.error('')
    console.error('Net-new core work must go through canonical services / domain facades')
    console.error('(src/modules/*/domain), not raw legacy tables. If this is a deliberate,')
    console.error('justified compatibility bridge, add it to LEGACY_ALLOWLIST in')
    console.error('scripts/audit-canonical-model.mjs.')
    process.exit(1)
  }
  // Allowlist hygiene: warn (do not fail) on entries that are no longer legacy/mixed.
  const stale = [...LEGACY_ALLOWLIST].filter(
    f => !rows.some(r => r.file === f && (r.status === 'legacy' || r.status === 'mixed')),
  )
  if (stale.length > 0) {
    console.log(`Drift guard passed. Stale allowlist entr(ies) (no longer legacy/mixed — safe to remove):`)
    for (const s of stale) console.log(`  - ${s}`)
  } else {
    console.log('Drift guard passed — no unapproved legacy/mixed files.')
  }
  process.exit(0)
}
