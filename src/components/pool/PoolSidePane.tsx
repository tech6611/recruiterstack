'use client'

import Link from 'next/link'
import { ArrowUpRight, Lock, NotebookPen, Unlock, Loader2 } from 'lucide-react'

/**
 * The third pane beside a pool profile — Juicebox's notes-and-sequences column.
 *
 * WHAT IT CAN HONESTLY OFFER DEPENDS ON THE RECORD, and the pool's shape decides that.
 * A pool profile is not in your workspace: those tables are shared across orgs and
 * deliberately carry no org_id, so there is nowhere for your note to live until the
 * profile is unlocked into a candidate of your own. And notes attach to an
 * APPLICATION, not a candidate — so even an unlocked person needs to be on a job
 * before there is a thread to write in.
 *
 * Rather than show a disabled text box, the pane names the next real step at each
 * stage. A control that looks available and does nothing is worse than an explanation.
 */
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
    <aside className="flex w-72 shrink-0 flex-col gap-4 border-l border-slate-200 bg-slate-50/60 p-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <NotebookPen className="h-3.5 w-3.5" /> Notes &amp; outreach
        </h3>

        {!unlocked ? (
          <div className="mt-3 space-y-3">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                This person isn&rsquo;t in your workspace yet. Unlocking copies them into your
                candidates with their contact details, history and education — then you can
                add them to a job, write notes and start a sequence.
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
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-xs leading-relaxed text-slate-600">
              Already in your candidates. Notes, emails and the activity feed live on their
              profile — and notes attach to a job, so add them to one first if you haven&rsquo;t.
            </p>
            {candidateId && (
              <Link
                href={`/candidates/${candidateId}`}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Open candidate <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
