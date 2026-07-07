#!/usr/bin/env node
/**
 * migration-checklist.mjs — Backend-consolidation safety net.
 *
 * Reconciles three sources of truth so no Django route can be silently missed
 * when we retire the Django API layer:
 *
 *   1. Every route Django can serve   (parsed from  ../recruiterstack-api/<app>/urls.py)
 *   2. Every route currently proxied  (parsed from  next.config.mjs rewrites)
 *   3. Every route Next.js can serve  (walked from  src/app/api/**​/route.ts)
 *
 * It classifies each Django route group and writes a checklist to
 * migration/route-status.md. Re-run it anytime — it always reflects reality,
 * so the list can never go stale.
 *
 * READ-ONLY: reads files only, writes one markdown report. Touches nothing else.
 *
 * USAGE
 *   node scripts/migration-checklist.mjs
 *   DJANGO_ROOT=/path/to/recruiterstack-api node scripts/migration-checklist.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const NEXT_ROOT = process.cwd();
const DJANGO_ROOT = process.env.DJANGO_ROOT || path.resolve(NEXT_ROOT, '..', 'recruiterstack-api');
const OUT_DIR = path.resolve(NEXT_ROOT, 'migration');
const OUT_FILE = path.join(OUT_DIR, 'route-status.md');

// Routes we intentionally KEEP on a standalone service (not migrating to Next.js).
const KEEP_STANDALONE = ['voice'];
// Route groups known to be legacy (retired canonical table) — expected to drop, not port.
const LEGACY = ['hiring-requests'];

const groupOf = (p) => p.replace(/^\/?api\//, '').replace(/^\//, '').split('/')[0];

// ── 1. Django routes ─────────────────────────────────────────────────────────
function djangoRouteGroups() {
  const groups = new Set();
  if (!fs.existsSync(DJANGO_ROOT)) return { groups, ok: false };
  const appDirs = fs.readdirSync(DJANGO_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(DJANGO_ROOT, d.name, 'urls.py'))
    .filter((f) => fs.existsSync(f));
  for (const f of appDirs) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/path\(\s*"([^"]*)"/g)) {
      const pat = m[1];
      if (!pat || pat === 'api/') continue;
      groups.add(groupOf(pat));
    }
  }
  return { groups, ok: true };
}

// ── 2. Proxied routes (next.config.mjs) ──────────────────────────────────────
function proxiedGroups() {
  const groups = new Set();
  const src = fs.readFileSync(path.join(NEXT_ROOT, 'next.config.mjs'), 'utf8');
  for (const m of src.matchAll(/source:\s*'(\/api\/[^']*)'/g)) {
    groups.add(groupOf(m[1]));
  }
  return groups;
}

// ── 3. Next.js handlers (src/app/api) ────────────────────────────────────────
function nextHandlerCounts() {
  const base = path.join(NEXT_ROOT, 'src', 'app', 'api');
  const counts = {};
  if (!fs.existsSync(base)) return counts;
  for (const d of fs.readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    counts[d.name] = countRouteFiles(path.join(base, d.name));
  }
  return counts;
}
function countRouteFiles(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) n += countRouteFiles(full);
    else if (e.name === 'route.ts' || e.name === 'route.tsx') n += 1;
  }
  return n;
}

// ── Reconcile ────────────────────────────────────────────────────────────────
const { groups: dj, ok: djangoOk } = djangoRouteGroups();
const proxied = proxiedGroups();
const handlers = nextHandlerCounts();

const rows = [...dj].sort().map((g) => {
  const isProxied = proxied.has(g);
  const nHandlers = handlers[g] || 0;
  let status, action;
  if (KEEP_STANDALONE.includes(g)) {
    status = '🟣 KEEP'; action = 'Stays on standalone service — do not migrate.';
  } else if (LEGACY.includes(g)) {
    status = '⚪ LEGACY'; action = 'Retired canonical table — confirm unused, then drop.';
  } else if (nHandlers > 0) {
    status = '🟢 READY'; action = `Next.js handler exists (${nHandlers}). Safe to cut over.`;
  } else {
    status = '🔴 GAP'; action = 'DJANGO-ONLY, no Next.js handler — PORT before cutover.';
  }
  return { group: g, status, proxied: isProxied ? 'yes' : 'no', handlers: nHandlers, action };
});

const counts = rows.reduce((a, r) => { const k = r.status.split(' ')[1]; a[k] = (a[k] || 0) + 1; return a; }, {});
const gaps = rows.filter((r) => r.status.includes('GAP'));

// ── Write report ─────────────────────────────────────────────────────────────
const now = new Date().toISOString();
let md = `# Migration checklist — Django → Next.js\n\n`;
md += `_Generated ${now} · re-run \`node scripts/migration-checklist.mjs\` anytime._\n\n`;
if (!djangoOk) {
  md += `> ⚠️ Django repo not found at \`${DJANGO_ROOT}\`. Set \`DJANGO_ROOT\` to reconcile against Django's own routes.\n\n`;
}
md += `**Summary:** `;
md += Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ') + `\n\n`;
md += gaps.length
  ? `**⚠️ ${gaps.length} route group(s) need porting before they can be cut over:** ${gaps.map((g) => '`' + g.group + '`').join(', ')}\n\n`
  : `**✅ No un-portable gaps.** Every route to migrate already has a Next.js handler.\n\n`;
md += `| Route group | Status | Proxied today | Next.js handlers | Action |\n`;
md += `|---|---|---|---|---|\n`;
for (const r of rows) md += `| \`${r.group}\` | ${r.status} | ${r.proxied} | ${r.handlers} | ${r.action} |\n`;
md += `\n---\n`;
md += `Legend — 🟢 READY: cut over safely · 🔴 GAP: build Next.js handler first · `;
md += `🟣 KEEP: standalone (voice) · ⚪ LEGACY: confirm unused then drop.\n`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, md);

// ── Console summary ──────────────────────────────────────────────────────────
console.log(`\n  Migration checklist  (Django ${djangoOk ? '✓ found' : '✗ NOT found — set DJANGO_ROOT'})\n`);
console.log('  group                status      proxied  handlers');
console.log('  ' + '─'.repeat(52));
for (const r of rows) {
  console.log(`  ${r.group.padEnd(20)} ${r.status.padEnd(11)} ${r.proxied.padEnd(8)} ${r.handlers}`);
}
console.log('\n  Summary: ' + Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · '));
console.log(gaps.length
  ? `  ⚠️  Port first: ${gaps.map((g) => g.group).join(', ')}`
  : `  ✅  No un-portable gaps — everything to migrate has a Next.js handler.`);
console.log(`\n  ✓ Wrote ${path.relative(NEXT_ROOT, OUT_FILE)}\n`);
