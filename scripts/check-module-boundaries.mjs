#!/usr/bin/env node
/**
 * Module boundary check (see docs/platform-modular-architecture.md).
 *
 * Rule: a file in src/modules/<mod>/ may import from its OWN module and from
 * `core` (the shared kernel) — never sideways from a sibling module. This keeps
 * the modular monolith honest and makes a future service extraction a refactor,
 * not a rewrite.
 *
 * `core` is the kernel: it may import only from itself (depends on no module).
 * Anything OUTSIDE src/modules (app/, lib/) is the composition layer and may
 * import any module freely — boundaries only constrain module-to-module.
 *
 * Mirrors the audit:canonical script style. Exits non-zero on any violation.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MODULES_DIR = 'src/modules'
const IMPORT_RE = /from\s+['"]@\/modules\/([a-z0-9-]+)\//g

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

function moduleOf(path) {
  // src/modules/<mod>/...
  const parts = path.split('/')
  const i = parts.indexOf('modules')
  return i >= 0 ? parts[i + 1] : null
}

const violations = []
let scanned = 0

for (const file of walk(MODULES_DIR)) {
  scanned++
  const owner = moduleOf(file)
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(IMPORT_RE)) {
    const target = m[1]
    const allowed = target === owner || target === 'core'
    if (!allowed) {
      violations.push({ file, owner, target })
    }
  }
}

if (violations.length === 0) {
  console.log(`✅ module boundaries clean — scanned ${scanned} file(s) in ${MODULES_DIR}`)
  process.exit(0)
}

console.error(`❌ ${violations.length} module boundary violation(s):\n`)
for (const v of violations) {
  console.error(`  ${v.file}`)
  console.error(`     module "${v.owner}" imports sibling "${v.target}" (allowed: own module or "core")`)
}
console.error('\nCross-module needs must go through `core` or a published interface — not a sibling module.')
process.exit(1)
