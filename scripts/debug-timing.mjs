/**
 * Deep dive: correlate exact timestamps between enrollments, emails, and jobs.
 * Also check actual current_stage_index values in the DB.
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

// Get ALL enrollments with their sequence info
const { data: enrollments } = await supabase
  .from('sequence_enrollments')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(15)

const { data: allEmails } = await supabase
  .from('sequence_emails')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(30)

const { data: allJobs } = await supabase
  .from('job_queue')
  .select('*')
  .eq('job_type', 'sequence_email')
  .order('created_at', { ascending: false })
  .limit(20)

section('ENROLLMENT → EMAILS → JOBS CORRELATION')

for (const en of enrollments ?? []) {
  const emails = (allEmails ?? []).filter(e => e.enrollment_id === en.id)
  const jobs = (allJobs ?? []).filter(j => j.payload?.enrollmentId === en.id)

  console.log(`\n┌─ Enrollment ${en.id}`)
  console.log(`│  sequence_id:        ${en.sequence_id}`)
  console.log(`│  status:             ${en.status}`)
  console.log(`│  current_stage_index: ${en.current_stage_index}  ← KEY VALUE`)
  console.log(`│  created_at:         ${en.created_at}`)
  console.log(`│  next_send_at:       ${en.next_send_at}`)
  console.log(`│  started_at:         ${en.started_at}`)
  console.log(`│  completed_at:       ${en.completed_at}`)

  // Sort everything by timestamp
  const events = []

  events.push({
    time: en.created_at,
    source: 'ENROLLMENT',
    detail: `created (current_stage_index=${en.current_stage_index}, status=${en.status})`,
  })

  for (const em of emails) {
    events.push({
      time: em.created_at,
      source: `EMAIL:${em.status}`,
      detail: `stage_id=${em.stage_id} subject="${em.subject?.substring(0, 40)}"`,
    })
  }

  for (const job of jobs) {
    events.push({
      time: job.scheduled_at,
      source: 'JOB:scheduled',
      detail: `id=${job.id} stageId=${job.payload?.stageId ?? 'LEGACY'}`,
    })
    if (job.started_at) {
      events.push({
        time: job.started_at,
        source: 'JOB:started',
        detail: `id=${job.id}`,
      })
    }
    if (job.completed_at) {
      events.push({
        time: job.completed_at,
        source: 'JOB:completed',
        detail: `id=${job.id} status=${job.status} error=${job.error ?? 'null'}`,
      })
    }
  }

  events.sort((a, b) => a.time.localeCompare(b.time))

  console.log(`│`)
  console.log(`│  Timeline (${events.length} events):`)
  for (const ev of events) {
    const ms = ev.time.split('T')[1]
    console.log(`│    ${ms}  ${ev.source.padEnd(18)} ${ev.detail}`)
  }

  console.log(`└──`)
}

// Also: check what current_stage_index is for ALL enrollments
section('ALL current_stage_index VALUES')

for (const en of enrollments ?? []) {
  console.log(`  ${en.id}  idx=${en.current_stage_index}  status=${en.status}`)
}

// Check: insert a test row with current_stage_index=0 and read it back
section('VALIDATION: Does current_stage_index=0 persist?')

const testId = '00000000-0000-0000-0000-debug_test_01'
// Clean up any previous test
await supabase.from('sequence_enrollments').delete().eq('id', testId)

const firstSeq = enrollments?.[0]
if (firstSeq) {
  const { error: insertErr } = await supabase
    .from('sequence_enrollments')
    .insert({
      id: testId,
      org_id: firstSeq.org_id,
      sequence_id: firstSeq.sequence_id,
      candidate_id: firstSeq.candidate_id,
      status: 'paused', // won't be picked up by cron
      current_stage_index: 0,
      next_send_at: null,
      started_at: new Date().toISOString(),
    })

  if (insertErr) {
    console.log(`  INSERT failed: ${insertErr.message}`)
  } else {
    const { data: readBack } = await supabase
      .from('sequence_enrollments')
      .select('id, current_stage_index, status')
      .eq('id', testId)
      .single()

    console.log(`  Inserted with current_stage_index=0`)
    console.log(`  Read back:  current_stage_index=${readBack?.current_stage_index}`)
    console.log(`  ${readBack?.current_stage_index === 0 ? '✓ Value 0 persisted correctly' : '✗ VALUE CHANGED! DB default (1) took over!'}`)

    // Clean up
    await supabase.from('sequence_enrollments').delete().eq('id', testId)
    console.log(`  (test row cleaned up)`)
  }
}

console.log('\n  Done.\n')
