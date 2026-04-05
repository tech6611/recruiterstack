/**
 * Debug script: traces every decision point in the sequence email flow.
 * Run: node scripts/debug-sequence.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function section(title) {
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  ${title}`)
  console.log('═'.repeat(70))
}

function check(label, pass) {
  console.log(`  ${pass ? '✓' : '✗'} ${label}`)
}

// ── 1. Find recent sequences with stages ─────────────────────────────────

section('1. SEQUENCES WITH STAGES')

const { data: sequences } = await supabase
  .from('sequences')
  .select('id, name, status, org_id')
  .order('created_at', { ascending: false })
  .limit(5)

if (!sequences?.length) { console.log('  No sequences found'); process.exit(0) }

for (const seq of sequences) {
  console.log(`  ${seq.id}  status=${seq.status}  name="${seq.name}"`)
}

const targetSeq = sequences[0]
console.log(`\n  → Using sequence: ${targetSeq.id} ("${targetSeq.name}")`)

// ── 2. Stages query: select(*) vs selective ──────────────────────────────

section('2A. STAGES — select(*)')

const { data: stagesStar, error: errStar } = await supabase
  .from('sequence_stages')
  .select('*')
  .eq('sequence_id', targetSeq.id)
  .order('order_index', { ascending: true })

check(`select('*') returned data: ${stagesStar?.length ?? 'null'} rows`, !!stagesStar?.length)
if (errStar) console.log(`  ERROR: ${errStar.message}`)

section('2B. STAGES — selective (migration 025 columns)')

const { data: stagesSelective, error: errSelective } = await supabase
  .from('sequence_stages')
  .select('id, order_index, delay_days, subject, body, send_on_behalf_of, send_on_behalf_email, created_at, updated_at')
  .eq('sequence_id', targetSeq.id)
  .order('order_index', { ascending: true })

check(`selective query returned data: ${stagesSelective?.length ?? 'null'} rows`, !!stagesSelective?.length)
if (errSelective) console.log(`  ERROR: ${errSelective.message}`)

// ── 3. Stage-by-stage data (the from email is key) ──────────────────────

section('3. STAGE DATA COMPARISON')

const stages = stagesStar ?? stagesSelective ?? []
for (const stage of stages) {
  console.log(`\n  ── Stage ${stage.order_index} (${stage.id}) ──`)
  console.log(`  subject:              "${stage.subject}"`)
  console.log(`  body length:          ${stage.body?.length ?? 'null'} chars`)
  console.log(`  send_on_behalf_email: ${JSON.stringify(stage.send_on_behalf_email)}`)
  console.log(`  send_on_behalf_of:    ${JSON.stringify(stage.send_on_behalf_of)}`)
  console.log(`  delay_days:           ${stage.delay_days}`)
  console.log(`  delay_minutes:        ${stage.delay_minutes ?? '(not in response)'}`)
  console.log(`  channel:              ${stage.channel ?? '(not in response)'}`)

  // Validate from email
  const fromEmail = stage.send_on_behalf_email
  if (fromEmail === null || fromEmail === undefined) {
    check('from email: null → will use SENDGRID_FROM_EMAIL fallback', true)
  } else if (typeof fromEmail === 'string' && fromEmail.trim() === '') {
    check('from email: EMPTY STRING — truthy but invalid! Will NOT fallback!', false)
  } else if (typeof fromEmail === 'string' && fromEmail.trim() !== fromEmail) {
    check(`from email: has leading/trailing whitespace "${fromEmail}"`, false)
  } else if (typeof fromEmail === 'string' && !fromEmail.includes('@')) {
    check(`from email: no @ sign — invalid: "${fromEmail}"`, false)
  } else {
    check(`from email: "${fromEmail}"`, true)
  }
}

// ── 4. Recent enrollments ────────────────────────────────────────────────

section('4. RECENT ENROLLMENTS')

const { data: enrollments } = await supabase
  .from('sequence_enrollments')
  .select('id, sequence_id, candidate_id, status, current_stage_index, next_send_at, started_at, completed_at')
  .eq('sequence_id', targetSeq.id)
  .order('created_at', { ascending: false })
  .limit(5)

if (!enrollments?.length) {
  console.log('  No enrollments found for this sequence')
} else {
  for (const e of enrollments) {
    console.log(`\n  ${e.id}`)
    console.log(`    status:              ${e.status}`)
    console.log(`    current_stage_index: ${e.current_stage_index}`)
    console.log(`    next_send_at:        ${e.next_send_at}`)
    console.log(`    candidate_id:        ${e.candidate_id}`)
    console.log(`    completed_at:        ${e.completed_at}`)
  }
}

// ── 5. Recent sequence_emails (the evidence) ─────────────────────────────

section('5. SEQUENCE EMAILS (failed vs sent)')

const { data: emails } = await supabase
  .from('sequence_emails')
  .select('id, enrollment_id, stage_id, to_email, subject, body, status, sent_at, created_at')
  .eq('org_id', targetSeq.org_id)
  .order('created_at', { ascending: false })
  .limit(10)

if (!emails?.length) {
  console.log('  No sequence emails found')
} else {
  for (const em of emails) {
    const bodyPreview = em.body?.substring(0, 200)?.replace(/\n/g, '\\n') ?? 'null'
    const stageMatch = stages.find(s => s.id === em.stage_id)

    console.log(`\n  ${em.id}`)
    console.log(`    status:     ${em.status}`)
    console.log(`    stage:      order_index=${stageMatch?.order_index ?? '?'} (${em.stage_id})`)
    console.log(`    subject:    "${em.subject}"`)
    console.log(`    to:         ${em.to_email}`)
    console.log(`    sent_at:    ${em.sent_at}`)
    console.log(`    body[0:200]: ${bodyPreview}`)

    // Check if body contains error from debug deploy
    if (em.status === 'failed' && em.body?.startsWith('ERROR:')) {
      console.log(`\n    *** CAPTURED ERROR ***`)
      console.log(`    ${em.body.split('---ORIGINAL BODY---')[0].trim()}`)
    }
  }
}

// ── 6. Recent job_queue entries ──────────────────────────────────────────

section('6. JOB QUEUE (sequence_email jobs)')

const { data: jobs } = await supabase
  .from('job_queue')
  .select('id, job_type, payload, status, attempts, error, scheduled_at, started_at, completed_at')
  .eq('job_type', 'sequence_email')
  .order('created_at', { ascending: false })
  .limit(10)

if (!jobs?.length) {
  console.log('  No sequence_email jobs found')
} else {
  for (const job of jobs) {
    const payload = job.payload
    console.log(`\n  ${job.id}`)
    console.log(`    status:     ${job.status} (attempts: ${job.attempts})`)
    console.log(`    error:      ${job.error ?? 'null'}`)
    console.log(`    payload:    enrollmentId=${payload?.enrollmentId}`)
    console.log(`                sequenceId=${payload?.sequenceId}`)
    console.log(`                stageId=${payload?.stageId ?? 'NONE (legacy)'}`)
    console.log(`                stageIndex=${payload?.stageIndex ?? 'NONE (legacy)'}`)
    console.log(`    scheduled:  ${job.scheduled_at}`)
    console.log(`    started:    ${job.started_at}`)
    console.log(`    completed:  ${job.completed_at}`)
  }
}

// ── 7. Summary ───────────────────────────────────────────────────────────

section('DECISION TREE SUMMARY')

const failedEmails = (emails ?? []).filter(e => e.status === 'failed')
const sentEmails = (emails ?? []).filter(e => e.status === 'sent')
const legacyJobs = (jobs ?? []).filter(j => !j.payload?.stageId)
const perStageJobs = (jobs ?? []).filter(j => !!j.payload?.stageId)

console.log(`  Stages found (select *):     ${stagesStar?.length ?? 'null'}`)
console.log(`  Stages found (selective):     ${stagesSelective?.length ?? 'null'}`)
console.log(`  Legacy jobs (no stageId):     ${legacyJobs.length}`)
console.log(`  Per-stage jobs (has stageId): ${perStageJobs.length}`)
console.log(`  Failed emails:                ${failedEmails.length}`)
console.log(`  Sent emails:                  ${sentEmails.length}`)
console.log(`  Errors captured in body:      ${failedEmails.filter(e => e.body?.startsWith('ERROR:')).length}`)

const enrollmentStatuses = {}
for (const e of enrollments ?? []) {
  enrollmentStatuses[e.status] = (enrollmentStatuses[e.status] ?? 0) + 1
}
console.log(`  Enrollment statuses:          ${JSON.stringify(enrollmentStatuses)}`)

console.log('\n  Done.\n')
