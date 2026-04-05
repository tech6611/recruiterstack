/**
 * Compare failing sequences (old) vs working sequence (new).
 * Run: node scripts/debug-sequence-compare.mjs
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function section(title) {
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  ${title}`)
  console.log('═'.repeat(70))
}

// Get all sequences
const { data: sequences } = await supabase
  .from('sequences')
  .select('id, name, status, org_id, created_at')
  .order('created_at', { ascending: false })
  .limit(10)

section('ALL SEQUENCES')
for (const s of sequences) {
  console.log(`  ${s.name.padEnd(25)} status=${s.status.padEnd(10)} created=${s.created_at}  id=${s.id}`)
}

// For each sequence that has emails, compare stage data
const seqIds = sequences.map(s => s.id)

const { data: allStages } = await supabase
  .from('sequence_stages')
  .select('*')
  .in('sequence_id', seqIds)
  .order('sequence_id')
  .order('order_index', { ascending: true })

const { data: allEmails } = await supabase
  .from('sequence_emails')
  .select('id, enrollment_id, stage_id, status, subject, body, sent_at, created_at')
  .order('created_at', { ascending: false })
  .limit(30)

const { data: allEnrollments } = await supabase
  .from('sequence_enrollments')
  .select('id, sequence_id, candidate_id, status, current_stage_index, next_send_at, started_at, completed_at, created_at')
  .in('sequence_id', seqIds)
  .order('created_at', { ascending: false })
  .limit(20)

// Group stages by sequence
const stagesBySeq = {}
for (const st of allStages ?? []) {
  if (!stagesBySeq[st.sequence_id]) stagesBySeq[st.sequence_id] = []
  stagesBySeq[st.sequence_id].push(st)
}

// Group emails by stage_id for lookup
const emailsByStage = {}
for (const em of allEmails ?? []) {
  if (!emailsByStage[em.stage_id]) emailsByStage[em.stage_id] = []
  emailsByStage[em.stage_id].push(em)
}

// Group enrollments by sequence
const enrollBySeq = {}
for (const en of allEnrollments ?? []) {
  if (!enrollBySeq[en.sequence_id]) enrollBySeq[en.sequence_id] = []
  enrollBySeq[en.sequence_id].push(en)
}

section('PER-SEQUENCE STAGE COMPARISON')

for (const seq of sequences) {
  const stages = stagesBySeq[seq.id] ?? []
  const enrollments = enrollBySeq[seq.id] ?? []
  if (!stages.length) continue

  console.log(`\n  ┌─ ${seq.name} (${seq.status}) ──────────────────────────────`)
  console.log(`  │  Enrollments: ${enrollments.length}`)

  for (const en of enrollments) {
    console.log(`  │    ${en.id}  status=${en.status}  stage_idx=${en.current_stage_index}  completed=${en.completed_at ?? 'null'}`)
  }

  for (const stage of stages) {
    const emails = emailsByStage[stage.id] ?? []
    const failed = emails.filter(e => e.status === 'failed')
    const sent = emails.filter(e => e.status === 'sent')

    console.log(`  │`)
    console.log(`  │  Stage ${stage.order_index}:  ${stage.id}`)
    console.log(`  │    subject:              "${stage.subject}"`)
    console.log(`  │    send_on_behalf_email: ${JSON.stringify(stage.send_on_behalf_email)} (type: ${typeof stage.send_on_behalf_email}, len: ${stage.send_on_behalf_email?.length ?? 'n/a'})`)
    console.log(`  │    send_on_behalf_of:    ${JSON.stringify(stage.send_on_behalf_of)} (type: ${typeof stage.send_on_behalf_of}, len: ${stage.send_on_behalf_of?.length ?? 'n/a'})`)
    console.log(`  │    delay_days:           ${stage.delay_days}`)
    console.log(`  │    channel:              ${stage.channel}`)
    console.log(`  │    body length:          ${stage.body?.length ?? 0}`)
    console.log(`  │    emails:               ${sent.length} sent, ${failed.length} failed`)

    // Show failed email body (might contain error from debug deploy)
    for (const f of failed) {
      const bodySnippet = f.body?.substring(0, 300)?.replace(/\n/g, '\\n')
      console.log(`  │      FAILED: subject="${f.subject}"`)
      console.log(`  │              body[0:300]="${bodySnippet}"`)
    }
  }
  console.log(`  └──────────────────────────────────────────────────────`)
}

// Now check: what changed between failing and working?
section('KEY DIFFERENCE ANALYSIS')

const workingSeq = sequences.find(s => s.name === 'Sequence10')
const failingSeqs = sequences.filter(s => s.name !== 'Sequence10' && (stagesBySeq[s.id]?.length ?? 0) > 0)

if (workingSeq && failingSeqs.length) {
  const workingStages = stagesBySeq[workingSeq.id] ?? []

  console.log(`\n  Working: "${workingSeq.name}" (${workingStages.length} stages)`)
  for (const s of workingStages) {
    console.log(`    Stage ${s.order_index}: send_on_behalf_email=${JSON.stringify(s.send_on_behalf_email)} send_on_behalf_of=${JSON.stringify(s.send_on_behalf_of)}`)
  }

  for (const fseq of failingSeqs) {
    const fstages = stagesBySeq[fseq.id] ?? []
    console.log(`\n  Failing: "${fseq.name}" (${fstages.length} stages)`)
    for (const s of fstages) {
      console.log(`    Stage ${s.order_index}: send_on_behalf_email=${JSON.stringify(s.send_on_behalf_email)} send_on_behalf_of=${JSON.stringify(s.send_on_behalf_of)}`)
    }
  }
}

// Check: did the handler code change between the failing and working runs?
section('TIMELINE')
console.log('  All emails chronologically:')
for (const em of [...(allEmails ?? [])].reverse()) {
  const stageInfo = allStages?.find(s => s.id === em.stage_id)
  console.log(`  ${em.created_at}  ${em.status.padEnd(7)}  stage_idx=${stageInfo?.order_index ?? '?'}  subject="${em.subject?.substring(0, 50)}"`)
}

console.log('\n  Done.\n')
