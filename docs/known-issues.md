# Known issues & operational gotchas

A running log of problems we've hit that are non-obvious and likely to recur.
Each entry: the **symptom** you'll actually see, the **root cause**, how to
**confirm** it, and the **fix**. Add new entries at the top.

---

## Pipeline Automations Cron fails with HTTP 401 "Unauthorized"

**First hit:** 2026-09-16 (had been silently failing since at least 2026-09-13).

### Symptom
- Email from GitHub: `[tech6611/recruiterstack] Run failed: Pipeline Automations Cron`,
  body says **"Pipeline Automations Cron: All jobs have failed"**.
- In the run log, the `tick` job fails in ~15s with:
  ```
  HTTP 401
  {"error":"Unauthorized"}
  ##[error]pipeline scan returned 401
  ```
- The workflow is `.github/workflows/pipeline-automations-cron.yml`. It runs every
  5 minutes and just does a `curl -X POST` to
  `https://www.recruiterstack.in/api/cron/pipeline-automations`.

### Root cause
The request sends `Authorization: Bearer ${{ secrets.CRON_SECRET }}`. If the
**GitHub repo secret `CRON_SECRET` is missing or empty**, the header goes out as
a blank `Bearer ` (you can see `Authorization: Bearer ` with nothing after it in
the log). The Vercel app *does* have a `CRON_SECRET` env var set, so the two
don't match and the endpoint rejects the call with 401.

In short: **`CRON_SECRET` must be set to the SAME value in two places** —
1. GitHub → repo **Settings → Secrets and variables → Actions** (`CRON_SECRET`)
2. Vercel → project **Settings → Environment Variables** (`CRON_SECRET`)

If they drift apart (or one is cleared), every run 401s.

### How to confirm it's this
```sh
# Look at the most recent failed run's log:
gh run list --repo tech6611/recruiterstack --workflow "Pipeline Automations Cron" --limit 5
gh run view <run-id> --repo tech6611/recruiterstack --log-failed
# If you see `Authorization: Bearer ` (blank) and `HTTP 401`, it's this issue.
```

### Fix
1. Get the `CRON_SECRET` value from Vercel (project → Settings → Environment
   Variables → reveal `CRON_SECRET`).
2. Set the **same** value as a GitHub repo secret named `CRON_SECRET`
   (Settings → Secrets and variables → Actions → New repository secret), or via
   CLI: `gh secret set CRON_SECRET --repo tech6611/recruiterstack`.
3. Re-run to verify: `gh workflow run "Pipeline Automations Cron" --repo tech6611/recruiterstack`
   then check the log shows `HTTP 200` and `{"ok":true,...}`.
   Watch out for an invisible trailing space/newline when copy-pasting the value.

### Important context / prevention
- This cron is **live**, not a dry run. The endpoint response includes
  `"live":true`, meaning it actually acts on candidates in production. The code
  comment in the workflow claiming it's a dry-run-until-`PIPELINE_AUTOMATIONS_MODE`
  is **out of date** — while this was broken, pipeline automations were fully
  dead in production and no candidates were auto-progressed.
- **Alerting gap (unresolved):** GitHub only emails on the *first* failure of a
  repeating scheduled job, then goes quiet — which is why this hid for days. A
  proper alert (open/close a GitHub Issue on failure/recovery, or an external
  heartbeat monitor) was discussed but **not yet implemented**. Worth adding.
- Any time `CRON_SECRET` is rotated, remember it lives in **both** GitHub and
  Vercel — change both together.
