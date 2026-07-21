# LinkedIn "Add to Sequence" extension — project status & handoff

**Status: PAUSED (2026-07-21).** Fully built and tested end-to-end. Paused before
public launch on purpose — see the blocker in "What's left" below.

This file is the single place to understand what exists and what remains if we
ever pick this back up.

---

## What this is
A Chrome extension that lets a recruiter, while viewing a LinkedIn profile, click
one button to add that person into a RecruiterStack outreach sequence — the same
"sequence" feature already in the platform. Scope is deliberately "human clicks a
button on a profile they're viewing" (no background scraping/automation), to stay
within LinkedIn's terms.

## What we have (all built, committed to `main`, and tested)

### On the platform (RecruiterStack app)
- **API-key system** so an outside tool can talk to the platform without a browser
  login. Keys are per-workspace, stored only as SHA-256 hashes, rate-limited,
  revocable.
  - `api_keys` table (migration `supabase/migrations/094_api_keys.sql`) — **already
    applied to the live Supabase database.**
  - Auth helper `src/lib/api/api-keys.ts` (`withApiKey`, key generate/hash).
  - Endpoints the extension calls: `GET /api/ext/sequences`, `POST /api/ext/enroll`
    (reuse the same domain functions the UI uses to create + enrol candidates).
  - Settings screen at **Settings → API Keys** (`/settings/api-keys`) to
    generate / copy-once / revoke keys. Requires the `settings:edit` permission.
  - `/api/ext` is Clerk-bypassed in `src/middleware.ts` (auth handled in-route).

### The extension itself (`extension/` folder — plain files, no build step)
- `manifest.json` — runs on `linkedin.com/in/*`, talks to `recruiterstack.in`.
- `background.js` — the only part that calls the API (holds the key, bypasses CORS).
- `content.js` / `content.css` — the green "Add to sequence" button + form on the
  profile; auto-captures the name + profile URL.
- `options.html/js` — one-time setup: paste platform URL + API key, "Test connection".
- `popup.html/js` — toolbar status.
- `icons/` — brand icon (white person on emerald) + `generate-icon.mjs` generator.
- Docs: `README.md` (install/use), `STORE-LISTING.md` (store copy), `PUBLISH.md`
  (publish steps), this file.
- `package.sh` — builds the store-ready zip.

### Tested
Verified end-to-end on 2026-07-18 against a local dev server: generated a key,
loaded the extension, connected it (listed the 4 active sequences), added a
LinkedIn profile, and confirmed the candidate appeared in that sequence's
enrolments. Name auto-fill confirmed after a fix.

## Decisions already made
- **Email:** the recruiter types it into the panel (LinkedIn hides emails). An
  auto-finder (Apollo/Hunter/RocketReach) is a deferred Phase 2.
- **Distribution:** public Chrome Web Store.

---

## What's left, to let others access it

### 🚧 BLOCKER (why we paused)
The live site's login (Clerk) is running in **development mode**. Users can't log
into recruiterstack.in reliably, so they can't reach Settings → API Keys to
generate the key the extension needs. **This must move to a production Clerk
instance before rolling the extension out to anyone.** (This is a broader platform
issue, not extension-specific.)

### Then, to publish (details in `PUBLISH.md`)
1. Create a Chrome Web Store developer account (one-time US$5).
2. Upload the package: run `bash extension/package.sh`, then upload
   `extension/recruiterstack-extension.zip`.
3. Paste the listing text from `extension/STORE-LISTING.md`.
4. Add 1–3 screenshots (1280×800).
5. Add the extension privacy paragraph to the `/privacy` page (text in `PUBLISH.md`).
6. Set visibility Public, submit. Review ~1–3 days.
7. After approval: share the install link; add an "Install the LinkedIn extension"
   link inside the app near Settings → API Keys.

### Nice-to-haves (optional, later)
- Phase 2: auto-find the email so users don't type it.
- A one-click "Connect" flow instead of paste-the-key.
- More robust LinkedIn name capture if LinkedIn changes its page layout.

---

## Key commits (branch `main`)
- `620dd2f` — API-key auth + `/api/ext` endpoints (Stage 1)
- `959b6df` — the Chrome extension (Stage 2)
- `3505371` — post-test fixes (name capture, host permissions)
- `16cd613` — extension icon
- `9d36be1` — Chrome Web Store submission prep
