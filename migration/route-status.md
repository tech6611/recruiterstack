# Migration checklist — Django → Next.js

_Generated 2026-07-07T10:58:14.411Z · re-run `node scripts/migration-checklist.mjs` anytime._

**Summary:** 29 READY · 1 LEGACY · 1 KEEP

**✅ No un-portable gaps.** Every route to migrate already has a Next.js handler.

| Route group | Status | Proxied today | Next.js handlers | Action |
|---|---|---|---|---|
| `agent` | 🟢 READY | yes | 1 | Next.js handler exists (1). Safe to cut over. |
| `analytics` | 🟢 READY | yes | 3 | Next.js handler exists (3). Safe to cut over. |
| `applications` | 🟢 READY | yes | 5 | Next.js handler exists (5). Safe to cut over. |
| `apply` | 🟢 READY | yes | 3 | Next.js handler exists (3). Safe to cut over. |
| `candidates` | 🟢 READY | yes | 11 | Next.js handler exists (11). Safe to cut over. |
| `copilot` | 🟢 READY | no | 1 | Next.js handler exists (1). Safe to cut over. |
| `dashboard` | 🟢 READY | yes | 1 | Next.js handler exists (1). Safe to cut over. |
| `debug-scores` | 🟢 READY | yes | 1 | Next.js handler exists (1). Safe to cut over. |
| `email` | 🟢 READY | yes | 2 | Next.js handler exists (2). Safe to cut over. |
| `email-templates` | 🟢 READY | yes | 2 | Next.js handler exists (2). Safe to cut over. |
| `enrollments` | 🟢 READY | no | 1 | Next.js handler exists (1). Safe to cut over. |
| `google` | 🟢 READY | yes | 4 | Next.js handler exists (4). Safe to cut over. |
| `hiring-requests` | ⚪ LEGACY | yes | 0 | Retired canonical table — confirm unused, then drop. |
| `inbox` | 🟢 READY | yes | 1 | Next.js handler exists (1). Safe to cut over. |
| `intake` | 🟢 READY | yes | 4 | Next.js handler exists (4). Safe to cut over. |
| `interviews` | 🟢 READY | yes | 2 | Next.js handler exists (2). Safe to cut over. |
| `jobs` | 🟢 READY | yes | 5 | Next.js handler exists (5). Safe to cut over. |
| `leads` | 🟢 READY | yes | 1 | Next.js handler exists (1). Safe to cut over. |
| `matches` | 🟢 READY | yes | 1 | Next.js handler exists (1). Safe to cut over. |
| `offers` | 🟢 READY | yes | 2 | Next.js handler exists (2). Safe to cut over. |
| `org-settings` | 🟢 READY | yes | 7 | Next.js handler exists (7). Safe to cut over. |
| `parse-document` | 🟢 READY | yes | 1 | Next.js handler exists (1). Safe to cut over. |
| `pipeline-stages` | 🟢 READY | yes | 1 | Next.js handler exists (1). Safe to cut over. |
| `resume` | 🟢 READY | yes | 1 | Next.js handler exists (1). Safe to cut over. |
| `roles` | 🟢 READY | yes | 2 | Next.js handler exists (2). Safe to cut over. |
| `scorecards` | 🟢 READY | yes | 2 | Next.js handler exists (2). Safe to cut over. |
| `sequences` | 🟢 READY | no | 8 | Next.js handler exists (8). Safe to cut over. |
| `slack` | 🟢 READY | yes | 4 | Next.js handler exists (4). Safe to cut over. |
| `sourcing` | 🟢 READY | yes | 5 | Next.js handler exists (5). Safe to cut over. |
| `voice` | 🟣 KEEP | yes | 0 | Stays on standalone service — do not migrate. |
| `webhooks` | 🟢 READY | yes | 2 | Next.js handler exists (2). Safe to cut over. |

---
Legend — 🟢 READY: cut over safely · 🔴 GAP: build Next.js handler first · 🟣 KEEP: standalone (voice) · ⚪ LEGACY: confirm unused then drop.
