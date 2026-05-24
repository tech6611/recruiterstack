# Changelog

A running log of notable changes to RecruiterStack — new features, fixes, schema
changes, UI/visual changes, and anything else worth knowing at a glance. Newest
entries on top.

> **How to use this file:** add an entry under the current date whenever you make a
> meaningful change. Group entries by type — `Added`, `Changed`, `Fixed`,
> `Removed`, `Schema` (migrations), `Docs`. Keep each line short and concrete.
> This file is part of the workflow — see the "Changelog" note in `CLAUDE.md`.

## 2026-05-24

### Docs
- Rewrote `README.md` into a real first-look entry point with a "Start here"
  reading path to `CLAUDE.md` and the canonical data-model docs.
- Refreshed `CLAUDE.md`: corrected stale counts (migrations 27→48+, API routes
  60+→130+, copilot tools 20+→~38, tests 13→37), added a Canonical Data Model
  section linking the `docs/` files and documenting the `src/lib/domain/*` facade
  convention, and surfaced `npm run audit:canonical`.
- Added this `CHANGELOG.md` as the running progress log.

### Removed
- Deleted `AGENTS.md` — it was a corrupted duplicate of `CLAUDE.md`
  (`Claude`→`Codex` text swap from another tool). `CLAUDE.md` is the single
  source of truth.
</content>
