'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Lock, Unlock, Loader2 } from 'lucide-react'
import { useCandidate } from '@/lib/hooks/useCandidate'
import { useTasks } from '@/lib/hooks/useTasks'
import NotesTab from '@/components/candidates/right/NotesTab'
import FeedTab from '@/components/candidates/right/FeedTab'
import TaskScheduler from '@/components/candidates/TaskScheduler'

/**
 * The third pane beside a pool profile — Juicebox's Notes / Sequences / Activity /
 * Tasks column.
 *
 * IT USED TO BE A PARAGRAPH POINTING SOMEWHERE ELSE. For a person already in your ATS
 * it said "notes and the activity feed live on their profile", which is true and
 * useless: you are looking at the person, and being told to go look at the person
 * somewhere else. Everything below is data we already serve; it just had no route to
 * this surface. Now the pane mounts the SAME tab components the candidate profile uses,
 * so a note written here is the note that shows up there.
 *
 * NO "PROJECTS" TAB. Juicebox has one; we have no such object, and an always-empty tab
 * is a promise rather than a feature. It is left out until there is something to put
 * in it.
 *
 * WHAT THE POOL'S SHAPE STILL DICTATES. A locked profile is not in your workspace at
 * all — those tables are shared across orgs and carry no org_id, so there is nowhere
 * for your note to live. That case keeps the unlock call to action rather than showing
 * five empty tabs. And notes attach to an APPLICATION, so an unlocked person who is not
 * on a job yet gets the reason, not a dead text box.
 */

const TABS = ['Notes', 'Sequences', 'Activity', 'Tasks'] as const
type Tab = typeof TABS[number]

interface EnrollmentRow {
  id: string
  sequence_id: string
  sequence_name: string
  status: string
  current_stage_index: number
  next_send_at: string | null
  started_at: string
}

/** Sent, replied, bounced — the words a recruiter judges an outreach thread by. */
const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  replied: 'bg-sky-50 text-sky-700',
  completed: 'bg-slate-100 text-slate-600',
  paused: 'bg-amber-50 text-amber-700',
  bounced: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function SequencesTab({ candidateId }: { candidateId: string }) {
  const [rows, setRows] = useState<EnrollmentRow[] | null>(null)

  useEffect(() => {
    let live = true
    fetch(`/api/candidates/${candidateId}/sequences`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => { if (live) setRows(j.data ?? []) })
      .catch(() => { if (live) setRows([]) })
    return () => { live = false }
  }, [candidateId])

  if (rows === null) return <p className="text-xs text-slate-400">Loading…</p>
  if (!rows.length) {
    return <p className="text-xs leading-relaxed text-slate-500">Not in any outreach sequence yet.</p>
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/sequences/${r.sequence_id}`}
              className="min-w-0 truncate text-xs font-semibold text-slate-800 hover:underline"
            >
              {r.sequence_name}
            </Link>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_TONE[r.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {r.status}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Step {r.current_stage_index + 1} · started {fmtDate(r.started_at)}
            {r.status === 'active' && r.next_send_at ? ` · next ${fmtDate(r.next_send_at)}` : ''}
          </p>
        </li>
      ))}
    </ul>
  )
}

/** The tabs, for someone who is already a candidate of yours. */
function UnlockedPanes({ candidateId }: { candidateId: string }) {
  const [tab, setTab] = useState<Tab>('Notes')
  const { candidate, loading, activeApps, reload } = useCandidate(candidateId)
  const { tasks, addTask, updateTask, deleteTask } = useTasks(candidateId)

  const events = candidate?.events ?? []
  const notes = events.filter((e) => e.event_type === 'note_added')
  const applicationId = activeApps?.[0]?.id ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-3 border-b border-slate-200 px-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            onClick={() => setTab(t)}
            className={`-mb-px whitespace-nowrap border-b-2 pb-2 text-xs transition-colors ${
              t === tab
                ? 'border-slate-900 font-semibold text-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        {loading && !candidate ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : tab === 'Notes' ? (
          applicationId ? (
            <NotesTab applicationId={applicationId} notes={notes} onNoteAdded={reload} />
          ) : (
            <p className="text-xs leading-relaxed text-slate-500">
              Notes attach to a job, so add this candidate to one and the thread opens here.
            </p>
          )
        ) : tab === 'Sequences' ? (
          <SequencesTab candidateId={candidateId} />
        ) : tab === 'Activity' ? (
          <FeedTab events={events} />
        ) : (
          <TaskScheduler
            candidateId={candidateId}
            tasks={tasks}
            onTaskAdded={addTask}
            onTaskUpdated={updateTask}
            onTaskDeleted={deleteTask}
          />
        )}
      </div>

      <Link
        href={`/candidates/${candidateId}`}
        className="mt-3 inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        Open full profile <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

export function PoolSidePane({
  unlocked,
  candidateId,
  unlocksLeft,
  unlocking,
  onUnlock,
}: {
  unlocked: boolean
  candidateId: string | null
  /** Null means an unlimited plan. */
  unlocksLeft: number | null
  unlocking: boolean
  onUnlock: () => void
}) {
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 border-l border-slate-200 bg-slate-50/60 p-4">
      {unlocked && candidateId ? (
        <UnlockedPanes candidateId={candidateId} />
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Notes &amp; outreach
          </h3>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>
              This person isn&rsquo;t in your workspace yet. Unlocking copies them into your
              candidates with their contact details, history and education — then notes,
              sequences, activity and tasks all open here.
            </span>
          </p>
          <button
            type="button"
            onClick={onUnlock}
            disabled={unlocking}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            {unlocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
            {unlocking ? 'Unlocking…' : 'Unlock profile'}
          </button>
          <p className="text-[11px] text-slate-400">
            {unlocksLeft == null
              ? 'Unlimited unlocks on your plan.'
              : `${unlocksLeft} unlock${unlocksLeft === 1 ? '' : 's'} left on your plan.`}
          </p>
        </div>
      )}
    </aside>
  )
}
