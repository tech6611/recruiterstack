import type { MatchWithRelations, MatchRecommendation } from '@/lib/types/database'
import { CheckCircle, XCircle, AlertCircle, TrendingUp, Mail } from 'lucide-react'

const REC_CONFIG: Record<
  MatchRecommendation,
  { label: string; color: string; bg: string; icon: typeof CheckCircle }
> = {
  strong_yes: { label: 'Strong Yes', color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle },
  yes:        { label: 'Yes',        color: 'text-blue-700',    bg: 'bg-blue-100',    icon: TrendingUp },
  maybe:      { label: 'Maybe',      color: 'text-amber-700',   bg: 'bg-amber-100',   icon: AlertCircle },
  no:         { label: 'No',         color: 'text-red-700',     bg: 'bg-red-100',     icon: XCircle },
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-bold text-slate-900 w-9 text-right">{score}</span>
    </div>
  )
}

interface MatchCardProps {
  match: MatchWithRelations
  showCandidate?: boolean  // true on role detail page
  showRole?: boolean       // true on candidate profile page
  onDraftEmail?: (match: MatchWithRelations) => void
}

export function MatchCard({ match, showCandidate = true, showRole = false, onDraftEmail }: MatchCardProps) {
  const rec = REC_CONFIG[match.recommendation as MatchRecommendation] ?? REC_CONFIG.maybe
  const Icon = rec.icon

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {showCandidate && (
            <p className="font-semibold text-slate-900 truncate">
              {match.candidates.name}
            </p>
          )}
          {showRole && (
            <p className="font-semibold text-slate-900 truncate">
              {match.roles.job_title}
            </p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            {showCandidate && (match.candidates.current_title ?? 'No title')}
            {showRole && (match.roles.location ?? 'Remote')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${rec.bg} ${rec.color}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {rec.label}
          </span>
          {onDraftEmail && (
            <button
              onClick={() => onDraftEmail(match)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              title="Draft outreach email"
            >
              <Mail className="h-3.5 w-3.5" />
              Draft Email
            </button>
          )}
        </div>
      </div>

      {/* Score bar */}
      <ScoreBar score={match.score} />

      {/* Reasoning */}
      <p className="text-sm text-slate-500 leading-relaxed">{match.reasoning}</p>

      {/* Strengths + Gaps */}
      <div className="grid grid-cols-2 gap-3">
        {match.strengths.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-emerald-700 mb-1.5">Strengths</p>
            <ul className="space-y-1">
              {match.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                  <span className="mt-0.5 text-emerald-500">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {match.gaps.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-600 mb-1.5">Gaps</p>
            <ul className="space-y-1">
              {match.gaps.map((g, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                  <span className="mt-0.5 text-red-400">✗</span>
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
