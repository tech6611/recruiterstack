#!/usr/bin/env node
/**
 * measure-perf.mjs — Page/endpoint load-time baseline recorder.
 *
 * Measures TTFB ("time to first byte" = the "Waiting for server response" phase
 * you saw in Chrome DevTools) for a set of pages and API routes, repeats each a
 * few times, and APPENDS a timestamped run to perf/perf-log.json so history
 * accumulates and can be compared before/after the migration.
 *
 * This is READ-ONLY: it issues GET requests only. Safe to run against production.
 *
 * USAGE
 *   node scripts/measure-perf.mjs
 *   PERF_COOKIE="__session=eyJ..." node scripts/measure-perf.mjs   # logged-in routes
 *   BASE_URL=https://www.recruiterstack.in node scripts/measure-perf.mjs
 *
 * GETTING PERF_COOKIE (needed for logged-in pages like /jobs):
 *   1. Open www.recruiterstack.in in Chrome while logged in.
 *   2. DevTools (F12) → Application tab → Cookies → the www.recruiterstack.in entry
 *   3. Copy the VALUE of the "__session" cookie.
 *   4. Run:  PERF_COOKIE="__session=<paste>" node scripts/measure-perf.mjs
 *   (The token expires in ~1 min — copy and run promptly.)
 */

import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// Default to the canonical www host — the bare domain 307-redirects to it, and the
// Clerk session cookie is only authorized for www.
const BASE_URL = (process.env.BASE_URL || 'https://www.recruiterstack.in').replace(/\/$/, '');
const COOKIE = process.env.PERF_COOKIE || '';
// The raw JWT (strip the "__session=" prefix) — sent as a Bearer token so Clerk
// authenticates /api/* requests directly, skipping the browser sign-in handshake
// that a cookie-only request triggers.
const TOKEN = COOKIE.replace(/^\s*__session=/, '').trim();
const REPS = Number(process.env.PERF_REPS || 3);
const OUT_DIR = path.resolve(process.cwd(), 'perf');
const OUT_FILE = path.join(OUT_DIR, 'perf-log.json');

// Routes to measure. `auth: true` ones return real data only with PERF_COOKIE set.
// The list vs detail split is deliberate: /api/jobs (static) is served by NEXT.JS,
// while /api/jobs/:id (dynamic) is forwarded to DJANGO — comparing them tells us
// which side owns the latency.
const TARGETS = [
  { label: 'landing page',              path: '/',               auth: false },
  { label: 'jobs page (browser)',       path: '/jobs',           auth: true },
  { label: 'API · jobs LIST →Next.js',  path: '/api/jobs',       auth: true },
  { label: 'API · dashboard →Next.js',  path: '/api/dashboard',  auth: true },
  { label: 'API · candidates →Next.js', path: '/api/candidates', auth: true },
  // 'API · job DETAIL →Django' is added dynamically below once we discover a real job id.
];

// One HTTP GET. Returns { status, location, ttfb, total, body } or { error }.
function once(url, wantBody) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = { 'User-Agent': 'recruiterstack-perf-probe' };
    if (COOKIE) headers['Cookie'] = COOKIE;
    if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
    const start = process.hrtime.bigint();
    const req = lib.request(u, { method: 'GET', headers }, (res) => {
      const ttfb = Number(process.hrtime.bigint() - start) / 1e6; // headers received
      let body = '';
      res.on('data', (c) => { if (wantBody) body += c; });
      res.on('end', () => {
        const total = Number(process.hrtime.bigint() - start) / 1e6;
        resolve({ status: res.statusCode, location: res.headers.location, ttfb, total, body });
      });
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ error: 'timeout (>15s)' }); });
    req.end();
  });
}

// Follow redirects (301/302/303/307/308) up to `max`, timing the FINAL hop.
async function follow(startUrl, wantBody = false, max = 5) {
  let url = startUrl, hops = 0, last;
  while (hops <= max) {
    last = await once(url, wantBody);
    if (last.error) return { ...last, hops };
    if ([301, 302, 303, 307, 308].includes(last.status) && last.location) {
      url = new URL(last.location, url).href;
      hops += 1;
      continue;
    }
    return { ...last, hops, finalUrl: url };
  }
  return { ...last, hops, finalUrl: url };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ms = (n) => (n == null ? '   —  ' : `${n.toFixed(0).padStart(5)}ms`);

async function main() {
  console.log(`\n  Measuring ${BASE_URL}  (${REPS} reps/route, authed=${COOKIE ? 'yes' : 'NO — set PERF_COOKIE for logged-in routes'})\n`);

  // Discover a real job id so we can measure the Django-served detail route.
  if (COOKIE) {
    const list = await follow(BASE_URL + '/api/jobs', true);
    let parsed = null;
    try { parsed = JSON.parse(list.body); } catch { /* not JSON */ }
    const firstId = Array.isArray(parsed?.data) && parsed.data[0]?.id;
    if (firstId) {
      TARGETS.push({ label: 'API · job DETAIL →Django', path: `/api/jobs/${firstId}`, auth: true });
    } else if (list.status && list.status !== 200) {
      console.log(`  (note: /api/jobs returned status ${list.status} — cookie may be expired; re-copy a fresh __session and retry)\n`);
    } else {
      console.log('  (note: no jobs found to measure the Django detail route — that\'s fine)\n');
    }
  }

  const run = { timestamp: new Date().toISOString(), base_url: BASE_URL, authed: !!COOKIE, reps: REPS, results: [] };

  console.log('  route                          TTFB (median)   min     max    status');
  console.log('  ' + '─'.repeat(70));

  for (const t of TARGETS) {
    const samples = [];
    let status = null, hops = 0, error = null;
    for (let i = 0; i < REPS; i++) {
      const r = await follow(BASE_URL + t.path);
      if (r.error) { error = r.error; break; }
      status = r.status; hops = r.hops;
      samples.push(r.ttfb);
    }
    const entry = error
      ? { label: t.label, path: t.path, error }
      : {
          label: t.label, path: t.path, status, redirects: hops,
          ttfb_median_ms: Math.round(median(samples)),
          ttfb_min_ms: Math.round(Math.min(...samples)),
          ttfb_max_ms: Math.round(Math.max(...samples)),
          needs_auth: t.auth && !COOKIE,
        };
    run.results.push(entry);

    const note = (t.auth && !COOKIE) ? ' (needs login)' : (hops > 0 ? ` (${hops} redirect${hops > 1 ? 's' : ''})` : '');
    if (error) {
      console.log(`  ${t.label.padEnd(29)}  ERROR: ${error}`);
    } else {
      console.log(`  ${t.label.padEnd(29)} ${ms(entry.ttfb_median_ms)}  ${ms(entry.ttfb_min_ms)} ${ms(entry.ttfb_max_ms)}   ${status}${note}`);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let log = [];
  if (fs.existsSync(OUT_FILE)) {
    try { log = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')); } catch { log = []; }
  }
  log.push(run);
  fs.writeFileSync(OUT_FILE, JSON.stringify(log, null, 2));
  console.log(`\n  ✓ Appended run to ${path.relative(process.cwd(), OUT_FILE)}  (${log.length} run${log.length > 1 ? 's' : ''} on record)\n`);
}

main();
