'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, Plus, Link2, Users, Pencil, Check, X,
  UserPlus, Search, ChevronDown, MoreHorizontal,
  Loader2, AlertCircle, ExternalLink, ClipboardList, Star, Trash2,
  Settings2, LayoutList, Kanban, SlidersHorizontal,
  ArrowUp, ArrowDown, ArrowDownUp, GripVertical, FileUp,
} from 'lucide-react'
import type {
  JobWithPipeline, PipelineStage, Application, Candidate, StageColor,
  Scorecard, ScorecardRecommendation, ScorecardScore, AiRecommendation,
  ScoringCriterion,
} from '@/lib/types/database'
import { useSettings } from '@/lib/hooks/useSettings'
import { RichTextEditor, stripHtml, isHtmlEmpty } from '@/components/RichTextEditor'

// ── Scorecard config (shared) ─────────────────────────────────────────────────

const DEFAULT_CRITERIA = ['Technical Skills', 'Communication', 'Problem Solving', 'Culture Fit']

const DEFAULT_SCORING_CRITERIA_OBJ: ScoringCriterion[] = [
  { id: 'technical',     name: 'Technical Skills',  weight: 35, description: 'Relevant technical expertise and depth' },
  { id: 'experience',    name: 'Domain Experience', weight: 25, description: 'Industry or role-specific background' },
  { id: 'communication', name: 'Communication',     weight: 20, description: 'Clarity, articulation, professional presence' },
  { id: 'culture',       name: 'Culture Fit',       weight: 20, description: 'Alignment with team values and ways of working' },
]

const RECOMMENDATION_CONFIG: Record<ScorecardRecommendation, { label: string; badge: string; active: string; btn: string }> = {
  strong_yes: { label: 'Strong Yes', badge: 'bg-emerald-100 text-emerald-700', active: 'bg-emerald-600 text-white border-emerald-600', btn: 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50' },
  yes:        { label: 'Yes',        badge: 'bg-blue-100 text-blue-700',       active: 'bg-blue-600 text-white border-blue-600',       btn: 'border border-blue-200 text-blue-700 hover:bg-blue-50'       },
  maybe:      { label: 'Maybe',      badge: 'bg-amber-100 text-amber-700',     active: 'bg-amber-500 text-white border-amber-500',     btn: 'border border-amber-200 text-amber-700 hover:bg-amber-50'   },
  no:         { label: 'No',         badge: 'bg-red-100 text-red-700',         active: 'bg-red-600 text-white border-red-600',         btn: 'border border-red-200 text-red-700 hover:bg-red-50'         },
}

const RATING_CONFIG = [
  { value: 1 as const, label: 'Poor',      dot: 'bg-red-400',     active: 'bg-red-500 text-white border-red-500',         btn: 'border border-red-200 text-red-600 hover:bg-red-50'         },
  { value: 2 as const, label: 'Fair',      dot: 'bg-amber-400',   active: 'bg-amber-500 text-white border-amber-500',     btn: 'border border-amber-200 text-amber-600 hover:bg-amber-50'   },
  { value: 3 as const, label: 'Good',      dot: 'bg-blue-400',    active: 'bg-blue-500 text-white border-blue-500',       btn: 'border border-blue-200 text-blue-600 hover:bg-blue-50'       },
  { value: 4 as const, label: 'Excellent', dot: 'bg-emerald-400', active: 'bg-emerald-500 text-white border-emerald-500', btn: 'border border-emerald-200 text-emerald-600 hover:bg-emerald-50' },
]

function RatingDots({ rating }: { rating: number }) {
  const cfg = RATING_CONFIG[rating - 1]
  return (
    <div className="flex gap-0.5 items-center">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`h-2 w-2 rounded-full ${i <= rating ? (cfg?.dot ?? 'bg-slate-400') : 'bg-slate-200'}`} />
      ))}
    </div>
  )
}

function fmtRelative(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Stage colours ─────────────────────────────────────────────────────────────

const STAGE_STYLES: Record<StageColor, { header: string; dot: string; border: string; bar: string; barTop: string; barBottom: string }> = {
  slate:   { header: 'bg-slate-100',   dot: 'bg-slate-400',   border: 'border-slate-300',   bar: 'border-y-4 border-slate-300',   barTop: 'border-t-4 border-slate-300',   barBottom: 'border-b-4 border-slate-300'   },
  blue:    { header: 'bg-blue-50',     dot: 'bg-blue-500',    border: 'border-blue-300',    bar: 'border-y-4 border-blue-300',    barTop: 'border-t-4 border-blue-300',    barBottom: 'border-b-4 border-blue-300'    },
  violet:  { header: 'bg-violet-50',   dot: 'bg-violet-500',  border: 'border-violet-300',  bar: 'border-y-4 border-violet-300',  barTop: 'border-t-4 border-violet-300',  barBottom: 'border-b-4 border-violet-300'  },
  amber:   { header: 'bg-amber-50',    dot: 'bg-amber-500',   border: 'border-amber-300',   bar: 'border-y-4 border-amber-300',   barTop: 'border-t-4 border-amber-300',   barBottom: 'border-b-4 border-amber-300'   },
  emerald: { header: 'bg-emerald-50',  dot: 'bg-emerald-500', border: 'border-emerald-300', bar: 'border-y-4 border-emerald-300', barTop: 'border-t-4 border-emerald-300', barBottom: 'border-b-4 border-emerald-300' },
  green:   { header: 'bg-green-50',    dot: 'bg-green-500',   border: 'border-green-300',   bar: 'border-y-4 border-green-300',   barTop: 'border-t-4 border-green-300',   barBottom: 'border-b-4 border-green-300'   },
  red:     { header: 'bg-red-50',      dot: 'bg-red-500',     border: 'border-red-300',     bar: 'border-y-4 border-red-300',     barTop: 'border-t-4 border-red-300',     barBottom: 'border-b-4 border-red-300'     },
  pink:    { header: 'bg-pink-50',     dot: 'bg-pink-500',    border: 'border-pink-300',    bar: 'border-y-4 border-pink-300',    barTop: 'border-t-4 border-pink-300',    barBottom: 'border-b-4 border-pink-300'    },
}

const COLOR_OPTIONS: { value: StageColor; label: string; dot: string }[] = [
  { value: 'slate',   label: 'Grey',    dot: 'bg-slate-400'   },
  { value: 'blue',    label: 'Blue',    dot: 'bg-blue-500'    },
  { value: 'violet',  label: 'Purple',  dot: 'bg-violet-500'  },
  { value: 'amber',   label: 'Amber',   dot: 'bg-amber-500'   },
  { value: 'emerald', label: 'Teal',    dot: 'bg-emerald-500' },
  { value: 'green',   label: 'Green',   dot: 'bg-green-500'   },
  { value: 'red',     label: 'Red',     dot: 'bg-red-500'     },
  { value: 'pink',    label: 'Pink',    dot: 'bg-pink-500'    },
]

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Added', applied: 'Applied', imported: 'Imported',
  sourced: 'Sourced', referral: 'Referral',
}

const SOURCE_COLORS: Record<string, string> = {
  manual: 'bg-slate-100 text-slate-600',
  applied: 'bg-blue-50 text-blue-700',
  imported: 'bg-violet-50 text-violet-700',
  sourced: 'bg-amber-50 text-amber-700',
  referral: 'bg-emerald-50 text-emerald-700',
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700', 'bg-emerald-100 text-emerald-700',
  'bg-pink-100 text-pink-700', 'bg-indigo-100 text-indigo-700',
]

function avatarColor(name: string) {
  const h = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

// Suggested-action sort priority (module-level so RankedView can reference it)
function actionSortKey(a: { ai_score: number | null; ai_recommendation: string | null }): number {
  if (a.ai_score === null) return 4
  if (a.ai_recommendation === 'strong_yes') return 0
  if (a.ai_recommendation === 'yes')        return 1
  if (a.ai_recommendation === 'maybe')      return 2
  if (a.ai_recommendation === 'no')         return 3
  return 4
}

// ── AI Score pill ─────────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number | null }) {
  if (score === null) return null
  const color =
    score >= 75 ? 'bg-emerald-100 text-emerald-700' :
    score >= 60 ? 'bg-amber-100 text-amber-700'     :
                  'bg-red-100 text-red-700'
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${color}`}>
      {score}
    </span>
  )
}

const AI_REC_CONFIG: Record<AiRecommendation, { label: string; cls: string }> = {
  strong_yes: { label: 'Strong Yes', cls: 'bg-emerald-100 text-emerald-700' },
  yes:        { label: 'Yes',        cls: 'bg-blue-100 text-blue-700'       },
  maybe:      { label: 'Maybe',      cls: 'bg-amber-100 text-amber-700'     },
  no:         { label: 'No',         cls: 'bg-red-100 text-red-700'         },
}

// ── Candidate card ────────────────────────────────────────────────────────────

const SIGNAL_ACCENT: Record<string, string> = {
  strong_yes: '#10b981', yes: '#3b82f6', maybe: '#f59e0b', no: '#ef4444',
}
const SIGNAL_BADGE: Record<string, { label: string; cls: string }> = {
  strong_yes: { label: 'Strong Yes', cls: 'bg-emerald-100 text-emerald-700' },
  yes:        { label: 'Yes',        cls: 'bg-blue-100 text-blue-700'       },
  maybe:      { label: 'Maybe',      cls: 'bg-amber-100 text-amber-700'     },
  no:         { label: 'No',         cls: 'bg-red-100 text-red-700'         },
}

// ── Builds a plain-text note summarising Claude's analysis at rejection time ──
function buildAiAnalysisNote(app: Application): string {
  const recMap: Record<string, string> = { strong_yes: 'Strong Yes', yes: 'Yes', maybe: 'Maybe', no: 'No' }
  const rec = app.ai_recommendation ? recMap[app.ai_recommendation] : null
  const lines = [
    `🤖 AI Analysis at time of rejection:`,
    `Score: ${app.ai_score}/100${rec ? ` · Recommendation: ${rec}` : ''}`,
  ]
  if ((app.ai_strengths ?? []).length) {
    lines.push(`\n✅ Strengths:\n${(app.ai_strengths ?? []).map(s => `  • ${s}`).join('\n')}`)
  }
  if ((app.ai_gaps ?? []).length) {
    lines.push(`\n⚠️ Gaps:\n${(app.ai_gaps ?? []).map(g => `  • ${g}`).join('\n')}`)
  }
  return lines.join('\n')
}

function CandidateCard({
  app, onDragStart, onClick, isSelected, onToggleSelect, cardFields, suggestedAction,
}: {
  app: Application
  onDragStart: (id: string) => void
  onClick: (app: Application) => void
  isSelected: boolean
  onToggleSelect: (id: string) => void
  cardFields: string[]
  suggestedAction?: { label: string; variant: 'score' | 'reject' | 'move' | 'final'; onClick: (e: React.MouseEvent) => void }
}) {
  const c = app.candidate!
  const [showAnalysis, setShowAnalysis] = useState(false)
  const show = (field: string) => cardFields.includes(field)

  const signalBadge = show('ai_signal') && app.ai_recommendation
    ? SIGNAL_BADGE[app.ai_recommendation] : null
  const accentColor = show('ai_signal') && app.ai_score !== null && app.ai_recommendation
    ? SIGNAL_ACCENT[app.ai_recommendation] : undefined

  // Whether any footer-row field is active
  const hasFooter = show('source') || signalBadge || (show('ai_score') && app.ai_score !== null) || show('days')

  return (
    <div
      draggable
      onDragStart={() => onDragStart(app.id)}
      onClick={() => onClick(app)}
      style={accentColor ? { borderLeftColor: accentColor, borderLeftWidth: '3px' } : undefined}
      className={`cursor-pointer rounded-xl border bg-white px-3 py-2 shadow-sm hover:shadow-md transition-all select-none ${
        isSelected ? 'border-blue-400 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-200'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Checkbox */}
        <div
          onClick={e => { e.stopPropagation(); onToggleSelect(app.id) }}
          className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-all ${
            isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 hover:border-blue-400 bg-white'
          }`}
        >
          {isSelected && <Check className="h-2 w-2 text-white" />}
        </div>
        {/* Name + company */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 truncate leading-snug">{c.name}</p>
          {show('company') && c.current_title && (
            <p className="text-[10px] text-slate-400 truncate leading-tight">{c.current_title}</p>
          )}
          {show('location') && c.location && (
            <p className="text-[10px] text-slate-400 truncate leading-tight">{c.location}</p>
          )}
        </div>
      </div>

      {/* Footer row: optional fields */}
      {hasFooter && (
        <div className="flex items-center justify-between mt-1.5 gap-1 flex-wrap">
          {show('source') && (
            <span className={`rounded-full px-1.5 py-px text-[9px] font-medium ${SOURCE_COLORS[app.source] ?? SOURCE_COLORS.manual}`}>
              {SOURCE_LABELS[app.source] ?? app.source}
            </span>
          )}
          <div className="flex items-center gap-1 flex-wrap justify-end ml-auto">
            {signalBadge && (
              <span className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${signalBadge.cls}`}>
                {signalBadge.label}
              </span>
            )}
            {show('ai_score') && app.ai_score !== null && <ScorePill score={app.ai_score} />}
            {show('days') && (
              <span className="text-[9px] text-slate-400">{daysSince(app.applied_at)}d</span>
            )}
          </div>
        </div>
      )}

      {/* Suggested action button */}
      {suggestedAction && (() => {
        const actionCls = {
          score:  'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
          reject: 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100',
          final:  'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
          move:   'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
        }[suggestedAction.variant]
        return (
          <button
            onClick={suggestedAction.onClick}
            className={`mt-1.5 w-full rounded-lg border px-2 py-0.5 text-[9px] font-semibold text-center transition-colors truncate ${actionCls}`}
          >
            {suggestedAction.label}
          </button>
        )
      })()}

      {/* AI Analysis panel — any scored candidate */}
      {app.ai_score !== null && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setShowAnalysis(v => !v) }}
            className="w-full flex items-center justify-center gap-1 text-[9px] text-slate-400 hover:text-slate-600 py-0.5 rounded border border-transparent hover:border-slate-200 transition-colors"
          >
            <ChevronDown className={`h-2.5 w-2.5 transition-transform ${showAnalysis ? '' : '-rotate-90'}`} />
            AI Analysis
          </button>
          {showAnalysis && (
            <div
              onClick={e => e.stopPropagation()}
              className="mt-1 rounded-lg bg-slate-50 border border-slate-100 p-2 space-y-1.5"
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <ScorePill score={app.ai_score} />
                {app.ai_recommendation && signalBadge && (
                  <span className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${signalBadge.cls}`}>
                    {signalBadge.label}
                  </span>
                )}
              </div>
              {(app.ai_strengths ?? []).length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-emerald-600 mb-0.5">✅ Strengths</p>
                  {(app.ai_strengths ?? []).map((s, i) => (
                    <p key={i} className="text-[9px] text-slate-600 leading-snug">• {s}</p>
                  ))}
                </div>
              )}
              {(app.ai_gaps ?? []).length > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-red-500 mb-0.5">⚠️ Gaps</p>
                  {(app.ai_gaps ?? []).map((g, i) => (
                    <p key={i} className="text-[9px] text-slate-600 leading-snug">• {g}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Stage column ──────────────────────────────────────────────────────────────

const STAGE_ACTIONS = [
  { id: 'score',              label: 'Score this stage',           icon: '⚡' },
  { id: 'divider1',           label: '',                           icon: '' },
  { id: 'schedule_interview', label: 'Schedule new interview',     icon: '📅' },
  { id: 'self_schedule',      label: 'Create self-schedule invite',icon: '🔗' },
  { id: 'send_message',       label: 'Send message to all',        icon: '✉️' },
  { id: 'send_assessment',    label: 'Send assessment',            icon: '📋' },
  { id: 'divider2',           label: '',                           icon: '' },
  { id: 'move_next',          label: 'Move all to next stage',     icon: '→' },
  { id: 'reject_all',         label: 'Reject all in stage',        icon: '✕' },
] as const

type StageActionId = typeof STAGE_ACTIONS[number]['id']

function StageColumn({
  stage,
  apps,
  editMode,
  isMenuOpen,
  onMenuOpen,
  onMenuClose,
  onScoreStage,
  onMoveAllNext,
  onDragStart,
  onDrop,
  onCardClick,
  onRename,
  onRecolor,
  onDelete,
  selectedApps,
  onToggleSelect,
  onScheduleInterview,
  onRejectAll,
  selectedInStage,
  onSelectAllInStage,
  showDragHandle = false,
  cardFields,
  nextStage,
  isLastStage = false,
  onScoreApp,
  onRejectApp,
  onMoveApp,
}: {
  stage: PipelineStage
  apps: Application[]
  editMode: boolean
  isMenuOpen: boolean
  onMenuOpen: () => void
  onMenuClose: () => void
  onScoreStage: () => void
  onMoveAllNext: () => void
  onDragStart: (id: string) => void
  onDrop: (stageId: string) => void
  onCardClick: (app: Application) => void
  onRename: (id: string, name: string) => void
  onRecolor: (id: string, color: StageColor) => void
  onDelete: (id: string) => void
  selectedApps: Set<string>
  onToggleSelect: (id: string) => void
  onScheduleInterview: () => void
  /** Reject all (or selected) candidates in this stage */
  onRejectAll: () => void
  selectedInStage: number
  /** Select or deselect all apps in this stage (add/remove from global selection) */
  onSelectAllInStage: (ids: string[], select: boolean) => void
  /** Show drag handle in the column header (edit mode) */
  showDragHandle?: boolean
  /** Which fields to render on each candidate card */
  cardFields: string[]
  /** Next pipeline stage (null if last) */
  nextStage?: PipelineStage | null
  /** True when this is the final stage */
  isLastStage?: boolean
  /** Card suggested-action callbacks */
  onScoreApp: (app: Application) => void
  onRejectApp: (app: Application) => void
  onMoveApp: (app: Application, stageId: string) => void
}) {
  const [over, setOver] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nameVal, setNameVal] = useState(stage.name)
  const [showColors, setShowColors] = useState(false)
  const [comingSoonMsg, setComingSoonMsg] = useState<string | null>(null)
  const style = STAGE_STYLES[stage.color] ?? STAGE_STYLES.slate

  const allInStageSelected  = apps.length > 0 && apps.every(a => selectedApps.has(a.id))
  const someInStageSelected = !allInStageSelected && apps.some(a => selectedApps.has(a.id))

  const saveRename = () => {
    if (nameVal.trim() && nameVal !== stage.name) onRename(stage.id, nameVal.trim())
    setEditing(false)
  }

  const handleAction = (actionId: StageActionId) => {
    onMenuClose()
    if (actionId === 'score')              { onScoreStage();       return }
    if (actionId === 'move_next')          { onMoveAllNext();      return }
    if (actionId === 'schedule_interview') { onScheduleInterview(); return }
    if (actionId === 'reject_all')         { onRejectAll();        return }
    // Unimplemented actions — show a brief "coming soon" banner
    const action = STAGE_ACTIONS.find(a => a.id === actionId)
    if (action && action.label) {
      setComingSoonMsg(action.label)
      setTimeout(() => setComingSoonMsg(null), 3000)
    }
  }

  return (
    <div
      className={`flex flex-col rounded-2xl border-2 transition-colors ${
        over ? `${style.border} shadow-md` : 'border-transparent'
      }`}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(stage.id) }}
    >
      {/* Column header */}
      <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${style.header} border-2 ${style.border}`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showDragHandle && (
            <GripVertical className="h-4 w-4 text-slate-300 shrink-0 cursor-grab" />
          )}
          {/* Select-all toggle — visible only in edit mode */}
          {editMode && (
            <button
              onClick={() => onSelectAllInStage(apps.map(a => a.id), !allInStageSelected)}
              title={allInStageSelected ? 'Deselect all in this stage' : 'Select all in this stage'}
              className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-all ${
                allInStageSelected
                  ? 'bg-blue-500 border-blue-500'
                  : someInStageSelected
                    ? 'bg-blue-100 border-blue-400'
                    : 'border-slate-300 bg-white/70 hover:border-blue-400'
              }`}
            >
              {allInStageSelected  && <Check className="h-2.5 w-2.5 text-white" />}
              {someInStageSelected && <div className="h-0.5 w-2 bg-blue-500 rounded-full" />}
            </button>
          )}
          <button
            onClick={() => editMode && setShowColors(!showColors)}
            className={`h-2.5 w-2.5 rounded-full shrink-0 ${style.dot} ${editMode ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-slate-400' : ''}`}
          />
          {editing ? (
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={saveRename}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(false) }}
              className="text-sm font-semibold text-slate-700 bg-transparent border-b border-slate-400 outline-none w-full"
            />
          ) : (
            <span className={`${editMode ? 'text-xs text-slate-600' : 'text-sm font-semibold text-slate-700'} flex-1 min-w-0 truncate`}>
              {stage.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Count — compact, hidden in edit mode */}
          {!editMode && (
            <span className="text-[11px] font-bold text-slate-400 tabular-nums shrink-0 leading-none">
              {apps.length}
            </span>
          )}

          {/* Edit-mode controls */}
          {editMode && !editing && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-colors"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={() => onDelete(stage.id)}
                className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}

          {/* ⋯ stage actions menu — hidden in edit mode */}
          {!editing && !editMode && (
            <div className="relative">
              <button
                onClick={() => isMenuOpen ? onMenuClose() : onMenuOpen()}
                className={`p-1 rounded-lg transition-colors ${
                  isMenuOpen
                    ? 'bg-slate-200 text-slate-700'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-white/70'
                }`}
                title="Stage actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>

              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={onMenuClose} />
                  <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1 overflow-hidden">
                    <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                      {stage.name}
                    </div>
                    {STAGE_ACTIONS.map((action, i) => {
                      if (action.id === 'divider1' || action.id === 'divider2') {
                        return <div key={i} className="my-1 border-t border-slate-100" />
                      }
                      const isDestructive = action.id === 'reject_all'
                      let label: string = action.label
                      if (action.id === 'schedule_interview') {
                        label = selectedInStage > 0 ? `Schedule interview (${selectedInStage} selected)` : action.label
                      } else if (action.id === 'move_next') {
                        label = selectedInStage > 0 ? `Move to next stage (${selectedInStage} selected)` : action.label
                      } else if (action.id === 'reject_all') {
                        label = selectedInStage > 0 ? `Reject (${selectedInStage} selected)` : action.label
                      }
                      return (
                        <button
                          key={action.id}
                          onClick={() => handleAction(action.id as StageActionId)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left ${
                            isDestructive
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="text-base leading-none w-4 text-center">{action.icon}</span>
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Color picker */}
      {showColors && editMode && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl mx-1 mt-1 shadow-sm z-10">
          {COLOR_OPTIONS.map(c => (
            <button
              key={c.value}
              onClick={() => { onRecolor(stage.id, c.value); setShowColors(false) }}
              className={`h-5 w-5 rounded-full ${c.dot} ${stage.color === c.value ? 'ring-2 ring-offset-1 ring-slate-500' : 'hover:scale-110'} transition-transform`}
              title={c.label}
            />
          ))}
        </div>
      )}

      {/* Coming-soon banner (3-second auto-dismiss) */}
      {comingSoonMsg && (
        <div className="mx-1 mt-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11px] text-amber-700 text-center">
          ⏳ <span className="font-medium">{comingSoonMsg}</span> — coming soon
        </div>
      )}

      {/* Cards — no horizontal padding so cards span full column width like the header */}
      <div className={`flex flex-col gap-1.5 pt-1 pb-2 min-h-[100px] ${over ? 'bg-slate-50/60 rounded-xl' : ''}`}>
        {apps.map(app => {
          // Compute suggested action for this card
          let sa: { label: string; variant: 'score' | 'reject' | 'move' | 'final'; onClick: (e: React.MouseEvent) => void } | undefined
          if (app.ai_score === null) {
            sa = { label: '⚡ Score', variant: 'score', onClick: e => { e.stopPropagation(); onScoreApp(app) } }
          } else if (app.ai_recommendation === 'no') {
            sa = { label: '✕ Reject', variant: 'reject', onClick: e => { e.stopPropagation(); onRejectApp(app) } }
          } else if (isLastStage || !nextStage) {
            sa = { label: '🏁 Final Stage', variant: 'final', onClick: e => { e.stopPropagation() } }
          } else {
            sa = { label: `→ ${nextStage.name}`, variant: 'move', onClick: e => { e.stopPropagation(); onMoveApp(app, nextStage.id) } }
          }
          return (
            <CandidateCard
              key={app.id}
              app={app}
              onDragStart={onDragStart}
              onClick={onCardClick}
              isSelected={selectedApps.has(app.id)}
              onToggleSelect={onToggleSelect}
              cardFields={cardFields}
              suggestedAction={sa}
            />
          )
        })}
        {apps.length === 0 && (
          <div className={`flex-1 rounded-xl border-2 border-dashed min-h-[80px] transition-colors ${
            over ? style.border : 'border-slate-100'
          }`} />
        )}
      </div>
    </div>
  )
}

// ── Add Candidate Modal ───────────────────────────────────────────────────────

function AddCandidateModal({
  jobId,
  stages,
  onClose,
  onAdded,
}: {
  jobId: string
  stages: PipelineStage[]
  onClose: () => void
  onAdded: () => void
}) {
  const [tab, setTab] = useState<'new' | 'search'>('new')
  const [stageId, setStageId] = useState(stages[0]?.id ?? '')
  const [source, setSource] = useState('manual')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // New candidate
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  // CV / LinkedIn / Drive import
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError]     = useState('')
  const [showLinkedIn, setShowLinkedIn]   = useState(false)
  const [linkedInText, setLinkedInText]   = useState('')
  const [showDriveUrl, setShowDriveUrl]   = useState(false)
  const [driveUrl, setDriveUrl]           = useState('')
  const cvInputRef = useRef<HTMLInputElement>(null)

  // Extended profile fields — auto-filled from any import, always editable
  const [currentTitle,      setCurrentTitle]      = useState('')
  const [candidateLocation, setCandidateLocation] = useState('')
  const [expYears,          setExpYears]          = useState('')
  const [skillsRaw,         setSkillsRaw]         = useState('')   // comma-separated
  const [linkedinUrl,       setLinkedinUrl]       = useState('')
  const [showImportedFields, setShowImportedFields] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fillFromParsed = (c: Record<string, any>) => {
    if (c.name)             setName(c.name)
    if (c.email)            setEmail(c.email)
    if (c.phone)            setPhone(c.phone)
    if (c.current_title)    setCurrentTitle(c.current_title)
    if (c.location)         setCandidateLocation(c.location)
    if (c.experience_years) setExpYears(String(c.experience_years))
    if (Array.isArray(c.skills) && c.skills.length)
      setSkillsRaw((c.skills as string[]).join(', '))
    if (c.linkedin_url)     setLinkedinUrl(c.linkedin_url)
    // Reveal the extended fields section when any rich field is present
    if (c.current_title || c.location || c.experience_years ||
        (Array.isArray(c.skills) && c.skills.length) || c.linkedin_url) {
      setShowImportedFields(true)
    }
  }

  const handleCvImport = async (file: File) => {
    setImportLoading(true); setImportError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/sourcing/parse-cv', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to parse CV')
      fillFromParsed(json.candidate ?? {})
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'Failed to parse CV')
    } finally { setImportLoading(false) }
  }

  const handleLinkedInImport = async () => {
    if (!linkedInText.trim()) return
    setImportLoading(true); setImportError('')
    try {
      const res = await fetch('/api/sourcing/parse-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: linkedInText }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to parse profile')
      fillFromParsed(json.candidate ?? {})
      setShowLinkedIn(false)
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'Failed to parse profile')
    } finally { setImportLoading(false) }
  }

  const handleDriveImport = async () => {
    if (!driveUrl.trim()) return
    setImportLoading(true); setImportError('')
    try {
      const res = await fetch('/api/sourcing/parse-drive-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: driveUrl }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to parse Drive file')
      fillFromParsed(json.candidate ?? {})
      setShowDriveUrl(false)
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'Failed to parse Drive file')
    } finally { setImportLoading(false) }
  }

  // Search existing
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [searching, setSearching] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const res = await fetch(`/api/candidates?search=${encodeURIComponent(q)}&limit=10`)
    const json = await res.json()
    setResults(json.data ?? [])
    setSearching(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  const addNew = async () => {
    if (!name.trim() || !email.trim()) { setError('Name and email are required'); return }
    setSaving(true); setError('')
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiring_request_id: jobId,
        stage_id: stageId || undefined,
        source,
        candidate_data: {
            name:             name.trim(),
            email:            email.trim(),
            phone:            phone.trim()            || undefined,
            current_title:    currentTitle.trim()     || undefined,
            location:         candidateLocation.trim()|| undefined,
            experience_years: expYears ? Number(expYears) : undefined,
            skills:           skillsRaw.trim()
              ? skillsRaw.split(',').map(s => s.trim()).filter(Boolean)
              : undefined,
            linkedin_url:     linkedinUrl.trim()      || undefined,
          },
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Failed to add'); setSaving(false); return }
    onAdded()
  }

  const addExisting = async (candidateId: string) => {
    setSaving(true); setError('')
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiring_request_id: jobId,
        stage_id: stageId || undefined,
        source: 'sourced',
        candidate_id: candidateId,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Failed to add'); setSaving(false); return }
    onAdded()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Add Candidate</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {[{ key: 'new', label: 'New Candidate' }, { key: 'search', label: 'Search Existing' }].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as 'new' | 'search')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'text-blue-700 border-b-2 border-blue-600'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Stage picker (both tabs) */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Add to Stage</label>
            <select
              value={stageId}
              onChange={e => setStageId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {tab === 'new' && (
            <>
              {/* ── Auto-fill from CV or LinkedIn ── */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Auto-fill from</label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => cvInputRef.current?.click()}
                    disabled={importLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {importLoading && !showLinkedIn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                    Resume / CV
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowLinkedIn(v => !v); setShowDriveUrl(false) }}
                    disabled={importLoading}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                      showLinkedIn ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    LinkedIn / Bio
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDriveUrl(v => !v); setShowLinkedIn(false) }}
                    disabled={importLoading}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                      showDriveUrl ? 'border-green-300 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Google Drive
                  </button>
                  <input
                    ref={cvInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleCvImport(f) }}
                  />
                </div>

                {/* LinkedIn / Bio textarea */}
                {showLinkedIn && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={linkedInText}
                      onChange={e => setLinkedInText(e.target.value)}
                      placeholder="Paste LinkedIn profile text, bio, or resume text here…"
                      rows={4}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <button
                      type="button"
                      onClick={handleLinkedInImport}
                      disabled={importLoading || !linkedInText.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {importLoading && showLinkedIn && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Extract Details
                    </button>
                  </div>
                )}

                {/* Google Drive URL input */}
                {showDriveUrl && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-slate-400">Paste a publicly shared Google Drive link to a PDF resume.</p>
                    <input
                      value={driveUrl}
                      onChange={e => setDriveUrl(e.target.value)}
                      placeholder="https://drive.google.com/file/d/…/view"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button
                      type="button"
                      onClick={handleDriveImport}
                      disabled={importLoading || !driveUrl.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      {importLoading && showDriveUrl && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Import from Drive
                    </button>
                  </div>
                )}

                {importError && <p className="mt-1.5 text-xs text-red-600">{importError}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Name *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Phone</label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Source</label>
                <select
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="manual">Manual Add</option>
                  <option value="sourced">Sourced</option>
                  <option value="referral">Referral</option>
                  <option value="imported">Imported</option>
                </select>
              </div>

              {/* ── Imported / Extended Details ── */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowImportedFields(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showImportedFields ? 'rotate-0' : '-rotate-90'}`} />
                  Additional Details
                  {showImportedFields && <span className="ml-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">auto-filled</span>}
                </button>

                {showImportedFields && (
                  <div className="mt-2 space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Current Title</label>
                        <input
                          value={currentTitle}
                          onChange={e => setCurrentTitle(e.target.value)}
                          placeholder="e.g. Senior Engineer"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Location</label>
                        <input
                          value={candidateLocation}
                          onChange={e => setCandidateLocation(e.target.value)}
                          placeholder="e.g. New York, US"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Years of Exp.</label>
                        <input
                          type="number"
                          min={0}
                          max={50}
                          value={expYears}
                          onChange={e => setExpYears(e.target.value)}
                          placeholder="e.g. 5"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">LinkedIn URL</label>
                        <input
                          value={linkedinUrl}
                          onChange={e => setLinkedinUrl(e.target.value)}
                          placeholder="linkedin.com/in/…"
                          className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Skills <span className="font-normal text-slate-400">(comma-separated)</span></label>
                      <input
                        value={skillsRaw}
                        onChange={e => setSkillsRaw(e.target.value)}
                        placeholder="e.g. React, TypeScript, Node.js"
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'search' && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by name, email, phone, title…"
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 animate-spin" />}
              </div>
              {results.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {results.map(c => (
                    <button
                      key={c.id}
                      onClick={() => addExisting(c.id)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors disabled:opacity-50"
                    >
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${avatarColor(c.name)}`}>
                        {initials(c.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {c.email}
                          {c.current_title && <span className="ml-1.5 text-slate-300">·</span>}
                          {c.current_title && <span className="ml-1.5">{c.current_title}</span>}
                        </p>
                        {c.phone && <p className="text-xs text-slate-400 truncate">{c.phone}</p>}
                      </div>
                      {saving && <Loader2 className="h-4 w-4 text-slate-400 animate-spin ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
              {query && !searching && results.length === 0 && (
                <p className="text-sm text-center text-slate-400 py-4">No candidates found</p>
              )}
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {tab === 'new' && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
            <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={addNew}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add to Pipeline
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Scoring Criteria Edit Modal ───────────────────────────────────────────────

function ScoringCriteriaModal({
  criteria,
  jobId,
  candidateName,
  latestScorecard,
  aiScore,
  onClose,
  onSaved,
}: {
  criteria: ScoringCriterion[] | null | undefined
  jobId: string
  candidateName?: string
  latestScorecard?: ScorecardScore[] | null
  aiScore?: number | null
  aiRecommendation?: AiRecommendation | null
  onClose: () => void
  onSaved: (updated: ScoringCriterion[]) => void
}) {
  const initial = criteria && criteria.length > 0 ? criteria : DEFAULT_SCORING_CRITERIA_OBJ
  const [items, setItems]     = useState<ScoringCriterion[]>(initial)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  const total = items.reduce((s, c) => s + c.weight, 0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSave = async () => {
    if (total !== 100) { setError(`Weights must sum to 100% (currently ${total}%)`); return }
    const valid = items.filter(c => c.name.trim())
    if (valid.length === 0) { setError('Add at least one criterion'); return }
    setSaving(true); setError('')
    const res = await fetch(`/api/hiring-requests/${jobId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ scoring_criteria: valid }),
    })
    setSaving(false)
    if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Save failed'); return }
    onSaved(valid)
  }


  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">Scoring Criteria</h2>
            <p className="text-xs text-slate-400 mt-0.5">Drag to reorder · weights must sum to 100%</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 pb-2 space-y-3">

          {/* Criteria rows */}
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {items.map((c, i) => (
              <div
                key={c.id}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx === null || dragIdx === i) return
                  const next = [...items]
                  const [moved] = next.splice(dragIdx, 1)
                  next.splice(i, 0, moved)
                  setItems(next)
                  setDragIdx(null)
                }}
                className="flex items-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-50 transition-colors group"
              >
                <GripVertical className="h-4 w-4 text-slate-300 cursor-grab shrink-0" />
                <input
                  value={c.name}
                  onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  placeholder="Criterion name"
                  className="flex-1 text-sm text-slate-800 bg-transparent focus:outline-none min-w-0"
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setItems(prev => prev.map((x, j) => j === i ? { ...x, weight: Math.max(0, x.weight - 5) } : x))}
                    className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 text-sm font-bold transition-colors"
                  >−</button>
                  <div className="flex items-center">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={c.weight}
                      onChange={e => {
                        const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0))
                        setItems(prev => prev.map((x, j) => j === i ? { ...x, weight: v } : x))
                      }}
                      className={`w-9 text-xs font-semibold text-center rounded border bg-transparent focus:outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-300 border-transparent hover:border-slate-200 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${total === 100 ? 'text-slate-700' : 'text-amber-600'}`}
                    />
                    <span className={`text-xs font-semibold ${total === 100 ? 'text-slate-700' : 'text-amber-600'}`}>%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setItems(prev => prev.map((x, j) => j === i ? { ...x, weight: Math.min(100, x.weight + 5) } : x))}
                    className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 text-sm font-bold transition-colors"
                  >+</button>
                </div>
                <button
                  type="button"
                  onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add criterion */}
          <button
            type="button"
            onClick={() => setItems(prev => [...prev, { id: `c_${Date.now()}`, name: 'New Criterion', weight: 0, description: null }])}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add criterion
          </button>

          {/* Candidate scoring section — live-updates as weights change */}
          {latestScorecard && latestScorecard.length > 0 ? (
            // ── Manual scorecard: show actual per-criterion breakdown ──────────
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                📋 {candidateName ? `${candidateName}'s` : 'Latest'} scorecard — live breakdown
              </p>
              <div className="rounded-lg overflow-hidden border border-slate-200">
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="text-left px-2 py-1.5 text-slate-500 font-semibold">Criterion</th>
                      <th className="px-2 py-1.5 text-slate-500 font-semibold text-center">Weight</th>
                      <th className="px-2 py-1.5 text-slate-500 font-semibold text-center">Rating</th>
                      <th className="px-2 py-1.5 text-slate-500 font-semibold text-center">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {latestScorecard.map(s => {
                      const crit = items.find(c => c.name === s.criterion)
                      const pts  = crit && s.rating > 0 ? (s.rating / 4) * crit.weight : null
                      const rLabel = s.rating > 0 ? RATING_CONFIG[s.rating - 1]?.label : '—'
                      return (
                        <tr key={s.criterion} className="bg-white">
                          <td className="px-2 py-1.5 text-slate-600 font-medium">{s.criterion}</td>
                          <td className="px-2 py-1.5 text-center text-slate-400">{crit?.weight ?? '—'}%</td>
                          <td className={`px-2 py-1.5 text-center font-medium ${s.rating === 1 ? 'text-red-500' : s.rating === 2 ? 'text-amber-500' : s.rating === 3 ? 'text-blue-500' : s.rating === 4 ? 'text-emerald-500' : 'text-slate-300'}`}>{rLabel}</td>
                          <td className="px-2 py-1.5 text-center font-semibold text-slate-600">{pts?.toFixed(1) ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 border-t-2 border-slate-200">
                      <td colSpan={3} className="px-2 py-1.5 font-bold text-slate-600">Weighted Score</td>
                      <td className="px-2 py-1.5 text-center font-bold text-violet-600">
                        {latestScorecard.reduce((sum, s) => {
                          const crit = items.find(c => c.name === s.criterion)
                          return sum + (crit && s.rating > 0 ? (s.rating / 4) * crit.weight : 0)
                        }, 0).toFixed(1)} / 100
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[9px] text-slate-400">Pts = Rating ÷ 4 × Weight. Updates live as you adjust weights above.</p>
            </div>
          ) : aiScore !== null && aiScore !== undefined ? (
            // ── AI score only — show per-criterion max pts reference + score note ──
            <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">🤖 AI Analysis</p>
                <ScorePill score={aiScore} />
              </div>
              <div className="rounded-lg overflow-hidden border border-blue-100">
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="bg-blue-50">
                      <th className="text-left px-2 py-1.5 text-blue-500 font-semibold">Criterion</th>
                      <th className="px-2 py-1.5 text-blue-500 font-semibold text-center">Weight</th>
                      <th className="px-2 py-1.5 text-blue-500 font-semibold text-center">Max pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {items.map(c => (
                      <tr key={c.id} className="bg-white">
                        <td className="px-2 py-1.5 text-slate-600 font-medium">{c.name || '—'}</td>
                        <td className="px-2 py-1.5 text-center text-slate-400">{c.weight}%</td>
                        <td className="px-2 py-1.5 text-center font-semibold text-slate-600">{c.weight}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 border-t-2 border-blue-100">
                      <td className="px-2 py-1.5 font-bold text-slate-600">Total</td>
                      <td className={`px-2 py-1.5 text-center font-bold ${total === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>{total}%</td>
                      <td className={`px-2 py-1.5 text-center font-bold ${total === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>{total}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[9px] text-blue-400">
                AI gives a holistic score — per-criterion breakdown isn&apos;t available. Save new criteria to re-score {candidateName ?? 'this candidate'} automatically.
              </p>
            </div>
          ) : (
            // ── No scoring data yet — show weight reference only ──────────────
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">📐 Weight reference</p>
              <div className="rounded-lg overflow-hidden border border-slate-200">
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="text-left px-2 py-1.5 text-slate-500 font-semibold">Criterion</th>
                      <th className="px-2 py-1.5 text-slate-500 font-semibold text-center">Weight</th>
                      <th className="px-2 py-1.5 text-slate-500 font-semibold text-center">Max pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(c => (
                      <tr key={c.id} className="bg-white">
                        <td className="px-2 py-1.5 text-slate-600 font-medium">{c.name || '—'}</td>
                        <td className="px-2 py-1.5 text-center text-slate-400">{c.weight}%</td>
                        <td className="px-2 py-1.5 text-center font-semibold text-slate-600">{c.weight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[9px] text-slate-400">Score a candidate or add a scorecard to see their breakdown here.</p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 shrink-0 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500">Total weight</span>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
              total === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-600'
            }`}>
              {total}% {total === 100 ? '✓' : `(${100 - total > 0 ? '+' : ''}${100 - total} needed)`}
            </span>
          </div>
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || total !== 100}
              className="flex-1 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Candidate Slide-Over ──────────────────────────────────────────────────────

function CandidateSlideOver({
  app,
  stages,
  scoringCriteria,
  onClose,
  onStageChange,
  onStatusChange,
  onCriteriaUpdated,
  onAppUpdated,
}: {
  app: Application
  stages: PipelineStage[]
  scoringCriteria?: ScoringCriterion[] | null
  onClose: () => void
  onStageChange: (appId: string, stageId: string) => void
  onStatusChange: (appId: string, status: string) => void
  onCriteriaUpdated?: (c: ScoringCriterion[]) => void
  onAppUpdated?: (updates: Partial<Application>) => void
}) {
  const c = app.candidate!
  const [tab, setTab]   = useState<'details' | 'scorecards'>('details')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  // Re-scoring state (triggered after criteria are edited)
  const [rescoring, setRescoring] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Scorecards tab state
  const [scorecards, setScorecards]         = useState<Scorecard[]>([])
  const [scLoading, setScLoading]           = useState(false)
  const [showAddForm, setShowAddForm]       = useState(false)
  const [scInterviewer, setScInterviewer]   = useState('')
  const [scRound, setScRound]               = useState('')
  const [scRec, setScRec]                   = useState<ScorecardRecommendation | ''>('')
  // Local copy of criteria — updated optimistically when the edit modal saves
  const [localCriteria, setLocalCriteria]   = useState<ScoringCriterion[] | null | undefined>(scoringCriteria)
  const [editCriteriaOpen, setEditCriteriaOpen] = useState(false)
  // Use job's weighted criteria if available, fall back to defaults
  const activeCriteria = localCriteria?.length
    ? localCriteria.map(c => c.name)
    : DEFAULT_CRITERIA

  const [scScores, setScScores]             = useState(
    activeCriteria.map(c => ({ criterion: c, rating: 0 as 0 | 1 | 2 | 3 | 4 }))
  )
  const [scNotes, setScNotes]               = useState('')
  const [scSaving, setScSaving]             = useState(false)
  const [scError, setScError]               = useState('')

  const loadScorecards = useCallback(async () => {
    setScLoading(true)
    const res = await fetch(`/api/scorecards?application_id=${app.id}`)
    const json = await res.json()
    setScorecards(json.data ?? [])
    setScLoading(false)
  }, [app.id])

  // Re-score this application via SSE stream (triggered after criteria change)
  const handleRescore = useCallback(async () => {
    setRescoring(true)
    try {
      const res = await fetch(`/api/jobs/${app.hiring_request_id}/score`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ application_id: app.id }),
      })
      if (!res.ok || !res.body) return
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'progress' && event.application_id === app.id) {
              onAppUpdated?.({
                ai_score:          event.score,
                ai_recommendation: event.recommendation,
                ai_strengths:      event.strengths ?? [],
                ai_gaps:           event.gaps ?? [],
                ai_scored_at:      new Date().toISOString(),
              })
            }
          } catch { /* skip malformed SSE line */ }
        }
      }
    } catch { /* non-fatal — scoring may still have succeeded */ }
    finally { setRescoring(false) }
  }, [app.hiring_request_id, app.id, onAppUpdated])

  useEffect(() => {
    if (tab === 'scorecards') loadScorecards()
  }, [tab, loadScorecards])

  const addNote = async () => {
    if (!note.trim()) return
    setSaving(true)
    await fetch(`/api/applications/${app.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note.trim() }),
    })
    setNote('')
    setSaving(false)
  }

  const submitScorecard = async () => {
    if (!scInterviewer.trim()) { setScError('Interviewer name is required'); return }
    if (!scRec)                 { setScError('Please select a recommendation'); return }
    const unrated = scScores.filter(s => s.rating === 0)
    if (unrated.length > 0)    { setScError(`Please rate: ${unrated.map(s => s.criterion).join(', ')}`); return }

    setScSaving(true); setScError('')
    const res = await fetch('/api/scorecards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id:   app.id,
        interviewer_name: scInterviewer.trim(),
        stage_name:       scRound.trim() || null,
        recommendation:   scRec,
        scores:           scScores.map(s => ({ criterion: s.criterion, rating: s.rating, notes: '' })) as ScorecardScore[],
        overall_notes:    scNotes.trim() || null,
      }),
    })
    setScSaving(false)
    if (!res.ok) { const j = await res.json(); setScError(j.error ?? 'Failed'); return }
    // Reset form
    setScInterviewer(''); setScRound(''); setScRec(''); setScNotes('')
    setScScores(activeCriteria.map(c => ({ criterion: c, rating: 0 as 0 | 1 | 2 | 3 | 4 })))
    setShowAddForm(false)
    await loadScorecards()
  }

  const deleteScorecard = async (id: string) => {
    if (!confirm('Delete this scorecard?')) return
    await fetch(`/api/scorecards/${id}`, { method: 'DELETE' })
    setScorecards(prev => prev.filter(s => s.id !== id))
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1" onClick={onClose} />
      <div className="w-[420px] bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${avatarColor(c.name)}`}>
              {initials(c.name)}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{c.name}</h2>
              {c.current_title && <p className="text-sm text-slate-500">{c.current_title}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 shrink-0">
          {[
            { key: 'details',    label: 'Details'    },
            { key: 'scorecards', label: 'Scorecards', count: tab === 'scorecards' ? scorecards.length : null },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as 'details' | 'scorecards')}
              className={`flex items-center gap-1.5 flex-1 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'text-blue-700 border-b-2 border-blue-600'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-xs font-bold text-violet-700">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'details' && (
            <div className="px-6 py-5 space-y-5">
              {/* Contact */}
              <div className="space-y-1.5 text-sm">
                <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-blue-600 hover:text-blue-800 transition-colors">
                  {c.email}
                </a>
                {c.phone && <p className="text-slate-600">{c.phone}</p>}
                {c.location && <p className="text-slate-400">{c.location}</p>}
              </div>

              {/* Stage */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Stage</label>
                <div className="relative">
                  <select
                    value={app.stage_id ?? ''}
                    onChange={e => onStageChange(app.id, e.target.value)}
                    className="w-full appearance-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white pr-8"
                  >
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => onStatusChange(app.id, 'rejected')}
                  className="flex-1 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Reject
                </button>
                <button
                  onClick={() => onStatusChange(app.id, 'withdrawn')}
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Withdraw
                </button>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Add Note</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="Leave a note about this candidate…"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <button
                  onClick={addNote}
                  disabled={saving || !note.trim()}
                  className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Note'}
                </button>
              </div>
            </div>
          )}

          {tab === 'scorecards' && (
            <div className="px-6 py-5 space-y-4">

              {/* ── Scoring criteria header with edit pencil ── */}
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {(localCriteria ?? DEFAULT_SCORING_CRITERIA_OBJ).map(c => (
                    <span key={c.id} className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                      {c.name} {c.weight}%
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setEditCriteriaOpen(true)}
                  title="Edit scoring criteria"
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-violet-600 transition-colors ml-2 shrink-0"
                >
                  <Pencil className="h-2.5 w-2.5" />
                  Edit
                </button>
              </div>

              {/* ── AI Analysis (stored, no extra API call) ── */}
              {(app.ai_score !== null || rescoring) && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-2.5">
                  {/* Rescoring banner */}
                  {rescoring && (
                    <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-100 rounded-lg px-3 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      <span>Rescoring with new criteria…</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-blue-700">🤖 AI Analysis</span>
                      {app.ai_scored_at && !rescoring && (
                        <span className="text-[10px] text-blue-400">{fmtRelative(app.ai_scored_at)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {app.ai_score !== null && <ScorePill score={app.ai_score} />}
                      {!rescoring && app.ai_recommendation && (() => {
                        const badge = SIGNAL_BADGE[app.ai_recommendation as keyof typeof SIGNAL_BADGE]
                        return badge ? (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        ) : null
                      })()}
                    </div>
                  </div>

                  {(app.ai_strengths ?? []).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-emerald-600 mb-1">✅ Strengths</p>
                      <ul className="space-y-0.5">
                        {(app.ai_strengths ?? []).map((s, i) => (
                          <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                            <span className="text-emerald-400 shrink-0">•</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(app.ai_gaps ?? []).length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-red-500 mb-1">⚠️ Gaps</p>
                      <ul className="space-y-0.5">
                        {(app.ai_gaps ?? []).map((g, i) => (
                          <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                            <span className="text-red-400 shrink-0">•</span>{g}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Scored-on basis */}
                  {localCriteria && localCriteria.length > 0 && (
                    <div className="pt-2 border-t border-blue-100">
                      <p className="text-[9px] font-semibold text-blue-400 uppercase tracking-wide mb-1.5">📊 Scored on</p>
                      <div className="flex flex-wrap gap-1">
                        {localCriteria.map(c => (
                          <span key={c.id} className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">
                            {c.name} {c.weight}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Add Scorecard button / form toggle */}
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-2 w-full rounded-xl border-2 border-dashed border-violet-200 px-4 py-3 text-sm font-medium text-violet-600 hover:bg-violet-50 hover:border-violet-300 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Add Scorecard
                </button>
              )}

              {/* Inline scorecard form */}
              {showAddForm && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">New Scorecard</p>
                    <button onClick={() => { setShowAddForm(false); setScError('') }} className="p-1 text-slate-400 hover:text-slate-700">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Interviewer *</label>
                      <input
                        value={scInterviewer}
                        onChange={e => setScInterviewer(e.target.value)}
                        placeholder="Jane Smith"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">Round</label>
                      <input
                        value={scRound}
                        onChange={e => setScRound(e.target.value)}
                        placeholder="Phone Screen"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                    </div>
                  </div>

                  {/* Criteria */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-500">Criteria *</p>
                      <button
                        type="button"
                        onClick={() => setEditCriteriaOpen(true)}
                        title="Edit scoring criteria"
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-violet-600 transition-colors"
                      >
                        <Pencil className="h-2.5 w-2.5" /> Edit criteria
                      </button>
                    </div>
                    {scScores.map((s, idx) => (
                      <div key={s.criterion}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-600">
                            {s.criterion}
                            {(() => {
                              const w = scoringCriteria?.find(c => c.name === s.criterion)?.weight
                              return w != null ? <span className="ml-1 text-[10px] text-slate-400">({w}%)</span> : null
                            })()}
                          </span>
                          {s.rating > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${RATING_CONFIG[s.rating - 1].active}`}>
                              {RATING_CONFIG[s.rating - 1].label}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          {RATING_CONFIG.map(r => (
                            <button
                              key={r.value}
                              onClick={() => setScScores(prev => prev.map((sc, i) => i === idx ? { ...sc, rating: r.value } : sc))}
                              className={`flex-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold border transition-all ${
                                s.rating === r.value ? r.active : r.btn
                              }`}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Recommendation */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">Recommendation *</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.entries(RECOMMENDATION_CONFIG) as [ScorecardRecommendation, typeof RECOMMENDATION_CONFIG[ScorecardRecommendation]][]).map(([key, cfg]) => (
                        <button
                          key={key}
                          onClick={() => setScRec(key)}
                          className={`rounded-lg px-2 py-2 text-xs font-semibold border transition-all ${
                            scRec === key ? cfg.active : cfg.btn
                          }`}
                        >
                          {cfg.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <textarea
                    value={scNotes}
                    onChange={e => setScNotes(e.target.value)}
                    rows={2}
                    placeholder="Overall notes (optional)…"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                  />

                  {scError && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <p className="text-xs text-red-700">{scError}</p>
                    </div>
                  )}

                  <button
                    onClick={submitScorecard}
                    disabled={scSaving}
                    className="flex items-center justify-center gap-2 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-60"
                  >
                    {scSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                    Submit Scorecard
                  </button>
                </div>
              )}

              {/* Scorecards list */}
              {scLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                </div>
              ) : scorecards.length === 0 && !showAddForm ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-300 mb-3">
                    <Star className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">No scorecards yet</p>
                  <p className="text-xs text-slate-400 mt-1">Add feedback after the interview</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {scorecards.map(sc => {
                    const rec = RECOMMENDATION_CONFIG[sc.recommendation]
                    return (
                      <div key={sc.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${rec.badge}`}>{rec.label}</span>
                            <span className="text-xs font-semibold text-slate-700">{sc.interviewer_name}</span>
                            {sc.stage_name && <span className="text-xs text-slate-400">· {sc.stage_name}</span>}
                            <span className="text-xs text-slate-300">· {fmtRelative(sc.created_at)}</span>
                          </div>
                          <button
                            onClick={() => deleteScorecard(sc.id)}
                            className="p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {sc.scores.length > 0 && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              {sc.scores.map(s => (
                                <div key={s.criterion} className="flex items-center justify-between gap-1">
                                  <span className="text-xs text-slate-500 truncate">{s.criterion}</span>
                                  <RatingDots rating={s.rating} />
                                </div>
                              ))}
                            </div>
                            {/* Weighted score math breakdown */}
                            {(() => {
                              const criteria = localCriteria ?? []
                              const rows = sc.scores
                                .map(s => {
                                  const crit = criteria.find(c => c.name === s.criterion)
                                  return crit && s.rating > 0
                                    ? { name: s.criterion, weight: crit.weight, rating: s.rating, pts: (s.rating / 4) * crit.weight }
                                    : null
                                })
                                .filter(Boolean) as { name: string; weight: number; rating: number; pts: number }[]
                              if (rows.length === 0) return null
                              const total = rows.reduce((s, r) => s + r.pts, 0)
                              return (
                                <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 space-y-1">
                                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">Weighted breakdown</p>
                                  {rows.map(r => (
                                    <div key={r.name} className="flex items-center justify-between text-[10px] text-slate-400">
                                      <span className="truncate">
                                        {r.name} <span className="text-slate-300">({r.weight}%)</span>
                                        {' · '}{RATING_CONFIG[r.rating - 1]?.label}
                                      </span>
                                      <span className="font-semibold text-slate-500 shrink-0 ml-2">{r.pts.toFixed(1)} pts</span>
                                    </div>
                                  ))}
                                  <div className="border-t border-slate-100 pt-1 flex items-center justify-between text-[10px] font-bold text-slate-600">
                                    <span>Weighted Score</span>
                                    <span>{Math.round(total)} / 100</span>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        )}
                        {sc.overall_notes && (
                          <p className="text-xs text-slate-500 bg-white rounded-lg border border-slate-100 px-2.5 py-1.5">
                            {sc.overall_notes}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 shrink-0">
          <a
            href={`/candidates/${c.id}`}
            className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            View Full Profile
            <ExternalLink className="h-4 w-4 text-slate-400" />
          </a>
        </div>
      </div>

      {/* Scoring criteria edit modal */}
      {editCriteriaOpen && (
        <ScoringCriteriaModal
          criteria={localCriteria}
          jobId={app.hiring_request_id}
          candidateName={c.name}
          latestScorecard={scorecards[0]?.scores ?? null}
          aiScore={app.ai_score}
          aiRecommendation={app.ai_recommendation}
          onClose={() => setEditCriteriaOpen(false)}
          onSaved={newCriteria => {
            setLocalCriteria(newCriteria)
            setScScores(newCriteria.map(cr => ({ criterion: cr.name, rating: 0 as 0 | 1 | 2 | 3 | 4 })))
            setEditCriteriaOpen(false)
            onCriteriaUpdated?.(newCriteria)
            // Auto-rescore if candidate has an AI score (new criteria = new rubric)
            if (app.ai_score !== null && app.ai_score !== undefined) {
              void handleRescore()
            }
          }}
        />
      )}
    </div>
  )
}

// ── Ranked View ───────────────────────────────────────────────────────────────

function RankedView({
  apps,
  stages,
  onCardClick,
  onMoveToStage,
  selectedApps,
  onToggleSelect,
  onBulkSelect,
  isMultiStageSelection,
  onScoreApp,
  onScheduleApp,
  onRejectApp,
}: {
  apps: Application[]
  stages: PipelineStage[]
  onCardClick: (app: Application) => void
  onMoveToStage: (appId: string, stageId: string) => void
  selectedApps: Set<string>
  onToggleSelect: (id: string) => void
  onBulkSelect: (ids: string[]) => void
  /** True when selected apps span multiple pipeline stages — greys Suggested Action */
  isMultiStageSelection: boolean
  onScoreApp: (app: Application) => void
  onScheduleApp: (app: Application) => void
  onRejectApp: (appId: string) => void
}) {
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null)
  // Position of the open dropdown — stored from getBoundingClientRect() so we can
  // render via a portal outside the overflow-hidden table container
  const [rowMenuPos, setRowMenuPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)

  const openMenuForApp = (appId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (openRowMenu === appId) { setOpenRowMenu(null); setRowMenuPos(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    setRowMenuPos(
      spaceBelow >= 300
        ? { top: rect.bottom + 4,                       right: window.innerWidth - rect.right }
        : { bottom: window.innerHeight - rect.top + 4,  right: window.innerWidth - rect.right }
    )
    setOpenRowMenu(appId)
  }

  const closeMenu = () => { setOpenRowMenu(null); setRowMenuPos(null) }

  // Column sort state — null means default (score desc, unscored last)
  type SortCol = 'score' | 'name' | 'signal' | 'stage' | 'source' | 'days' | 'action'
  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(col === 'name' || col === 'stage' || col === 'source' || col === 'days' ? 'asc' : 'desc')
    }
  }

  const sortedApps = useMemo(() => {
    if (sortCol === null) {
      // Default: scored candidates first by score desc, unscored at end
      return [...apps].sort((a, b) => {
        if (a.ai_score === null && b.ai_score === null) return 0
        if (a.ai_score === null) return 1
        if (b.ai_score === null) return -1
        return b.ai_score - a.ai_score
      })
    }
    return [...apps].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'score') {
        if (a.ai_score === null && b.ai_score === null) cmp = 0
        else if (a.ai_score === null) cmp = 1
        else if (b.ai_score === null) cmp = -1
        else cmp = a.ai_score - b.ai_score
      } else if (sortCol === 'name') {
        cmp = (a.candidate?.name ?? '').localeCompare(b.candidate?.name ?? '')
      } else if (sortCol === 'signal') {
        const o: Record<string, number> = { strong_yes: 0, yes: 1, maybe: 2, no: 3 }
        cmp = (o[a.ai_recommendation ?? ''] ?? 4) - (o[b.ai_recommendation ?? ''] ?? 4)
      } else if (sortCol === 'stage') {
        cmp = stages.findIndex(s => s.id === a.stage_id) - stages.findIndex(s => s.id === b.stage_id)
      } else if (sortCol === 'source') {
        cmp = (a.source ?? '').localeCompare(b.source ?? '')
      } else if (sortCol === 'days') {
        cmp = daysSince(a.applied_at) - daysSince(b.applied_at)
      } else if (sortCol === 'action') {
        cmp = actionSortKey(a) - actionSortKey(b)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [apps, sortCol, sortDir, stages])

  // Reusable sortable header cell
  const SortTh = ({ col, children, className = '' }: { col: SortCol; children: React.ReactNode; className?: string }) => {
    const active = sortCol === col
    return (
      <th
        onClick={() => handleSort(col)}
        className={`text-left text-xs font-semibold px-4 py-3 cursor-pointer select-none group transition-colors ${
          active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
        } ${className}`}
      >
        <div className="flex items-center gap-1">
          {children}
          {active
            ? sortDir === 'asc'
              ? <ArrowUp className="h-3 w-3 text-blue-500 shrink-0" />
              : <ArrowDown className="h-3 w-3 text-blue-500 shrink-0" />
            : <ArrowDownUp className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          }
        </div>
      </th>
    )
  }

  // Select-all state for header checkbox (all visible rows)
  const allSelected  = sortedApps.length > 0 && sortedApps.every(a => selectedApps.has(a.id))
  const someSelected = !allSelected && sortedApps.some(a => selectedApps.has(a.id))

  let scoredRank = 0

  return (
    <div className="px-8 py-6 flex-1">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60">
              <th className="px-4 py-3 w-10">
                <div
                  onClick={() => onBulkSelect(allSelected || someSelected ? [] : sortedApps.map(a => a.id))}
                  title={allSelected || someSelected ? 'Deselect all' : 'Select all visible candidates'}
                  className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                    allSelected  ? 'bg-blue-500 border-blue-500' :
                    someSelected ? 'bg-blue-100 border-blue-400' :
                    'border-slate-300 hover:border-blue-400 bg-white'
                  }`}
                >
                  {allSelected  && <Check className="h-2.5 w-2.5 text-white" />}
                  {someSelected && <div className="h-0.5 w-2 bg-blue-500 rounded-full" />}
                </div>
              </th>
              <SortTh col="score" className="w-10">#</SortTh>
              <SortTh col="name">Candidate</SortTh>
              <SortTh col="score">Score</SortTh>
              <SortTh col="signal">AI Signal</SortTh>
              <SortTh col="stage">Stage</SortTh>
              <SortTh col="source">Source</SortTh>
              <SortTh col="days">Days</SortTh>
              <SortTh col="action" className="w-48">Suggested Action</SortTh>
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody>
            {sortedApps.map((app) => {
              const c = app.candidate!
              const stage = stages.find(s => s.id === app.stage_id)
              const rec = app.ai_recommendation ? AI_REC_CONFIG[app.ai_recommendation] : null
              if (app.ai_score !== null) scoredRank++
              const rank = app.ai_score !== null ? scoredRank : null
              const isSelected = selectedApps.has(app.id)

              const currentStageIdx = stages.findIndex(s => s.id === app.stage_id)
              const nextStage = currentStageIdx >= 0 && currentStageIdx < stages.length - 1
                ? stages[currentStageIdx + 1]
                : null
              const isLastStage = currentStageIdx === stages.length - 1

              return (
                <tr
                  key={app.id}
                  onClick={() => onCardClick(app)}
                  className={`border-b border-slate-50 cursor-pointer transition-colors last:border-0 ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div
                      onClick={e => { e.stopPropagation(); onToggleSelect(app.id) }}
                      className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 hover:border-blue-400 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-400 w-10">
                    {rank !== null ? rank : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${avatarColor(c.name)}`}>
                        {initials(c.name)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                        {c.current_title && (
                          <p className="text-xs text-slate-400">{c.current_title}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {app.ai_score !== null
                      ? <ScorePill score={app.ai_score} />
                      : <span className="text-xs text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {rec
                      ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rec.cls}`}>{rec.label}</span>
                      : <span className="text-xs text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {stage?.name ?? <span className="text-slate-300">Unstaged</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[app.source] ?? SOURCE_COLORS.manual}`}>
                      {SOURCE_LABELS[app.source] ?? app.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {daysSince(app.applied_at)}d
                  </td>
                  {/* Suggested Action column — copilot-driven; greyed when multi-stage selection active */}
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {isMultiStageSelection && isSelected ? (
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400 whitespace-nowrap">
                        — Mixed stages
                      </span>
                    ) : app.ai_score === null ? (
                      /* No score yet → prompt to score */
                      <button
                        onClick={() => onScoreApp(app)}
                        className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors whitespace-nowrap"
                      >
                        ⚡ Score candidate
                      </button>
                    ) : isLastStage ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        🏁 Final stage
                      </span>
                    ) : app.ai_recommendation === 'no' ? (
                      /* Copilot says no → suggest rejection */
                      <button
                        onClick={() => onRejectApp(app.id)}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors whitespace-nowrap"
                      >
                        ✕ Reject candidate
                      </button>
                    ) : nextStage ? (
                      /* Copilot says yes/maybe/strong_yes → advance */
                      <button
                        onClick={() => onMoveToStage(app.id, nextStage.id)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                          app.ai_recommendation === 'strong_yes' || app.ai_recommendation === 'yes'
                            ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        → Move to {nextStage.name}
                      </button>
                    ) : null}
                  </td>
                  {/* ⋯ row menu — rendered via portal to escape overflow-hidden */}
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => openMenuForApp(app.id, e)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        openRowMenu === app.id ? 'bg-slate-200 text-slate-700' : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {openRowMenu === app.id && rowMenuPos && createPortal(
                      <>
                        <div className="fixed inset-0 z-[9998]" onClick={closeMenu} />
                        <div
                          className="fixed z-[9999] w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1 overflow-hidden"
                          style={{ top: rowMenuPos.top, bottom: rowMenuPos.bottom, right: rowMenuPos.right }}
                        >
                          <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                            {c.name}
                          </div>
                          {/* 1. Score */}
                          <button
                            onClick={() => { closeMenu(); onScoreApp(app) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                          >
                            <span className="text-base leading-none w-3.5 text-center">⚡</span>
                            Score this candidate
                          </button>
                          <div className="my-1 border-t border-slate-100" />
                          {/* 2. Schedule interview */}
                          <button
                            onClick={() => { closeMenu(); onScheduleApp(app) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                          >
                            <span className="text-base leading-none w-3.5 text-center">📅</span>
                            Schedule interview
                          </button>
                          {/* 3. Self-schedule (stub) */}
                          <button
                            onClick={closeMenu}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                          >
                            <span className="text-base leading-none w-3.5 text-center">🔗</span>
                            Create self-schedule invite
                          </button>
                          {/* 4. Send message (stub) */}
                          <button
                            onClick={closeMenu}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                          >
                            <span className="text-base leading-none w-3.5 text-center">✉️</span>
                            Send message
                          </button>
                          {/* 5. Send assessment (stub) */}
                          <button
                            onClick={closeMenu}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                          >
                            <span className="text-base leading-none w-3.5 text-center">📋</span>
                            Send assessment
                          </button>
                          <div className="my-1 border-t border-slate-100" />
                          {/* 6. Move to next stage */}
                          {nextStage && (
                            <button
                              onClick={() => { closeMenu(); onMoveToStage(app.id, nextStage.id) }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                            >
                              <span className="text-base leading-none w-3.5 text-center">→</span>
                              Move to {nextStage.name}
                            </button>
                          )}
                          {/* 7. Reject */}
                          <button
                            onClick={() => { closeMenu(); onRejectApp(app.id) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                          >
                            <X className="h-3.5 w-3.5" />
                            Reject candidate
                          </button>
                        </div>
                      </>,
                      document.body
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sortedApps.length === 0 && (
          <div className="py-16 text-center text-sm text-slate-400">No active candidates</div>
        )}
      </div>
    </div>
  )
}

// ── Autopilot Drawer ──────────────────────────────────────────────────────────

function AutopilotDrawer({
  job,
  stages,
  onClose,
  onSaved,
}: {
  job: JobWithPipeline
  stages: PipelineStage[]
  onClose: () => void
  onSaved: () => void
}) {
  const [advanceScore,   setAdvanceScore]   = useState<number>(job.auto_advance_score   ?? 75)
  const [rejectScore,    setRejectScore]    = useState<number>(job.auto_reject_score    ?? 40)
  const [advanceStageId, setAdvanceStageId] = useState<string>(job.auto_advance_stage_id ?? (stages[1]?.id ?? stages[0]?.id ?? ''))
  const [autoEmail,      setAutoEmail]      = useState<boolean>(job.auto_email_rejection ?? false)
  const [recruiterName,  setRecruiterName]  = useState<string>(job.autopilot_recruiter_name ?? '')
  const [companyName,    setCompanyName]    = useState<string>(job.autopilot_company_name   ?? '')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const isActive = job.auto_advance_score !== null || job.auto_reject_score !== null

  const save = async () => {
    setSaving(true); setError('')
    const res = await fetch(`/api/jobs/${job.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auto_advance_score:       advanceScore,
        auto_reject_score:        rejectScore,
        auto_advance_stage_id:    advanceStageId || null,
        auto_email_rejection:     autoEmail,
        autopilot_recruiter_name: recruiterName.trim() || null,
        autopilot_company_name:   companyName.trim()   || null,
      }),
    })
    setSaving(false)
    if (!res.ok) { setError('Failed to save settings'); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1" onClick={onClose} />
      <div className="w-[380px] bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-slate-500" />
            <h2 className="text-base font-bold text-slate-900">Autopilot</h2>
            {isActive && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                ON
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Auto-advance */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Auto-Advance</p>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-700">Score ≥</span>
                <input
                  type="number" min={0} max={100}
                  value={advanceScore}
                  onChange={e => setAdvanceScore(Math.max(0, Math.min(100, +e.target.value)))}
                  className="w-16 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-sm text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="text-sm text-slate-700">→ Move to</span>
              </div>
              <select
                value={advanceStageId}
                onChange={e => setAdvanceStageId(e.target.value)}
                className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="">— Select stage —</option>
                {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Auto-reject */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Auto-Reject</p>
            <div className="rounded-xl bg-red-50 border border-red-200 p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-700">Score ≤</span>
                <input
                  type="number" min={0} max={100}
                  value={rejectScore}
                  onChange={e => setRejectScore(Math.max(0, Math.min(100, +e.target.value)))}
                  className="w-16 rounded-lg border border-red-300 bg-white px-2 py-1 text-sm text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                <span className="text-sm text-slate-700">→ Reject application</span>
              </div>
            </div>
          </div>

          {/* Rejection email */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Rejection Email</p>
            <div className="rounded-xl border border-slate-200 p-4 space-y-4">
              <label className="flex items-center justify-between cursor-pointer gap-3">
                <span className="text-sm text-slate-700">Send rejection email automatically</span>
                <button
                  type="button"
                  onClick={() => setAutoEmail(v => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${autoEmail ? 'bg-blue-600' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoEmail ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </label>
              {autoEmail && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Recruiter Name</label>
                    <input
                      value={recruiterName}
                      onChange={e => setRecruiterName(e.target.value)}
                      placeholder="e.g. Priya Sharma"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Company Name</label>
                    <input
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="e.g. TalentOS"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="text-xs text-slate-400 italic">
                    Emails will be signed: &quot;Best, {recruiterName || 'The Recruiting Team'}{companyName ? ` · ${companyName}` : ''}&quot;
                  </p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Schedule Interview Modal ───────────────────────────────────────────────────

const INTERVIEW_TYPES = [
  { value: 'video',      label: '🎥 Video call'     },
  { value: 'phone',      label: '📞 Phone screen'   },
  { value: 'in_person',  label: '🏢 In-person'      },
  { value: 'panel',      label: '👥 Panel'           },
  { value: 'technical',  label: '💻 Technical'       },
  { value: 'assessment', label: '📋 Assessment'      },
] as const

const DURATION_OPTIONS = [
  { value: 30,  label: '30 min' },
  { value: 45,  label: '45 min' },
  { value: 60,  label: '1 hour' },
  { value: 90,  label: '90 min' },
  { value: 120, label: '2 hours' },
]

function ScheduleInterviewModal({
  apps,
  job,
  onClose,
  onScheduled,
}: {
  apps: Application[]
  job: JobWithPipeline
  onClose: () => void
  onScheduled: () => void
}) {
  const today = new Date()
  // Local-time date string — avoids UTC shift (toISOString rolls back midnight IST dates to prev UTC day)
  const toLocalDateStr = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  // Default to tomorrow (local) — skip over weekend: Sat → Mon (+2), Sun → Mon (+1)
  const dateStr = (() => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const dow = d.getDay()
    if (dow === 0) d.setDate(d.getDate() + 1)       // Sun → Mon
    else if (dow === 6) d.setDate(d.getDate() + 2)  // Sat → Mon
    return toLocalDateStr(d)
  })()

  const [interviewType, setInterviewType] = useState<string>('video')
  const [date, setDate] = useState(dateStr)
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState(60)
  // ── Interview panel — list of interviewers for this session ─────────────────
  const _hmName  = (job as unknown as { hiring_manager_name?:  string }).hiring_manager_name  ?? ''
  const _hmEmail = (job as unknown as { hiring_manager_email?: string }).hiring_manager_email ?? ''
  type PanelMember = { name: string; email: string }
  const [panel, setPanel] = useState<PanelMember[]>([{ name: _hmName, email: _hmEmail }])
  const [addingMember,   setAddingMember]   = useState(false)
  const [newMemberName,  setNewMemberName]  = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')

  const [interviewer, setInterviewer] = useState(_hmName)
  const [interviewerEmail, setInterviewerEmail] = useState(_hmEmail)   // pre-fill from HM
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [googleConnected, setGoogleConnected] = useState(false)
  const [autoMeetLink,    setAutoMeetLink]    = useState<string | null>(null)
  const [googleMeetError, setGoogleMeetError] = useState<string | null>(null)

  // Availability grid state
  const [availWeekOffset,   setAvailWeekOffset]  = useState(0)
  const [busyRangesByEmail, setBusyRangesByEmail] = useState<Record<string, { start: string; end: string }[]>>({})
  const [availLoading,      setAvailLoading]      = useState(false)
  const [availNoData,       setAvailNoData]       = useState(false)
  const [gridExpanded,      setGridExpanded]      = useState(false)
  // Scroll refs — auto-scroll to 8 AM (slot index 16) when grid renders
  const inlineGridRef = useRef<HTMLDivElement>(null)
  const popupGridRef  = useRef<HTMLDivElement>(null)

  // ── Availability helpers ────────────────────────────────────────────────────

  // Return Mon–Sun (7 days) for the ISO week containing anchorDate, shifted by offset weeks.
  // Always anchors BACK to Monday so weekends are visible (e.g. selecting Sat shows Mon–Sun of same week).
  const getWeekDays = (anchorDate: string, offset: number): Date[] => {
    const base = new Date(anchorDate + 'T00:00:00')
    const dow = base.getDay() // 0=Sun 1=Mon … 6=Sat
    const daysToMon = dow === 0 ? -6 : -(dow - 1) // always go back to Monday of this ISO week
    const monday = new Date(base)
    monday.setDate(base.getDate() + daysToMon + offset * 7)
    monday.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i); return d
    })
  }

  const weekDays = getWeekDays(date, availWeekOffset) // 7 days Mon–Sun

  // 8 AM–6 PM in 30-min slots  →  ["08:00","08:30",…,"17:30"]
  const HOUR_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2)
    const m = i % 2 === 0 ? '00' : '30'
    return `${String(h).padStart(2, '0')}:${m}`
  }) // 00:00 → 23:30 (full 24 h)

  // Build "YYYY-MM-DDTHH:MM" key for a day + slot (local date — avoids UTC shift)
  const slotKey = (day: Date, slot: string) =>
    `${toLocalDateStr(day)}T${slot}`

  // Format a 24h "HH:MM" slot to 12h label e.g. "08:00"→"8 AM", "13:30"→"1:30 PM"
  const fmtSlotLabel = (slot: string) => {
    const [hStr, mStr] = slot.split(':')
    const h = parseInt(hStr, 10)
    const m = parseInt(mStr, 10)
    const period = h < 12 ? 'AM' : 'PM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}${m > 0 ? ':' + String(m).padStart(2, '0') : ''} ${period}`
  }

  // Returns the list of panel member emails that are busy during the given 30-min slot.
  // key = "YYYY-MM-DDTHH:MM" in LOCAL time.
  // Returns an empty array when the slot is free.
  const getBusyEmails = (key: string): string[] => {
    const [datePart, timePart] = key.split('T')
    const [y, mo, d]           = datePart.split('-').map(Number)
    const [h, m]               = timePart.split(':').map(Number)
    const slotStart = new Date(y, mo - 1, d, h, m, 0, 0).getTime() // local time, unambiguous
    const slotEnd   = slotStart + 30 * 60 * 1000
    return Object.entries(busyRangesByEmail)
      .filter(([, ranges]) => ranges.some(r => {
        const bStart = new Date(r.start).getTime()
        const bEnd   = new Date(r.end).getTime()
        return bStart < slotEnd && bEnd > slotStart
      }))
      .map(([email]) => email)
  }
  const isBusy = (key: string) => getBusyEmails(key).length > 0

  // Fetch Google Calendar connection status
  useEffect(() => {
    fetch('/api/org-settings')
      .then(r => r.json())
      .then(({ data }) => setGoogleConnected(!!data?.google_connected))
      .catch(() => {})
  }, [])

  // Fetch free/busy for ALL panel members when panel or week offset changes
  useEffect(() => {
    const emails = panel.map(m => m.email.trim().toLowerCase()).filter(Boolean)
    if (!emails.length || !googleConnected) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setAvailLoading(true)
      setAvailNoData(false)
      try {
        const days  = getWeekDays(date, availWeekOffset)
        const minDt = new Date(days[0]); minDt.setHours(0, 0, 0, 0)
        const maxDt = new Date(days[6]); maxDt.setHours(23, 59, 59, 999) // full 7-day window
        const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone
        const res   = await fetch(
          `/api/google/availability?emails=${encodeURIComponent(emails.join(','))}&time_min=${minDt.toISOString()}&time_max=${maxDt.toISOString()}&timezone=${encodeURIComponent(tz)}`,
          { cache: 'no-store' }   // always fetch fresh — stale GCal events must not linger
        )
        if (!res.ok) { if (!cancelled) { setBusyRangesByEmail({}); setAvailNoData(true) }; return }
        const json = await res.json()
        if (!cancelled) {
          // Store per-email busy ranges — keeps attribution so tooltips can show which person is busy
          setBusyRangesByEmail(json.data ?? {})
          setAvailNoData(!json.data || Object.keys(json.data).length === 0)
        }
      } catch { if (!cancelled) { setBusyRangesByEmail({}); setAvailNoData(true) } }
      finally  { if (!cancelled) setAvailLoading(false) }
    }, 600)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [panel, date, availWeekOffset, googleConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close the popup overlay when Escape is pressed
  useEffect(() => {
    if (!gridExpanded) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setGridExpanded(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [gridExpanded])

  // Escape dismisses the success screen too
  useEffect(() => {
    if (!saved) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { onScheduled(); onClose() } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saved]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes the main modal when no sub-view (popup / success screen) is active
  useEffect(() => {
    if (saved || gridExpanded) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saved, gridExpanded, onClose])

  // Auto-scroll inline grid to 8 AM (slot index 16, each slot 20px tall)
  useEffect(() => {
    if (!availLoading && !availNoData && inlineGridRef.current) {
      inlineGridRef.current.scrollTop = 16 * 20
    }
  }, [availLoading, availNoData])

  // Auto-scroll popup grid to 8 AM when opened
  useEffect(() => {
    if (gridExpanded && !availLoading && !availNoData && popupGridRef.current) {
      popupGridRef.current.scrollTop = 16 * 28  // popup cells are h-7 (28px)
    }
  }, [gridExpanded, availLoading, availNoData])

  const MEETING_INTEGRATIONS = [
    { id: 'gmeet',  label: 'Google Meet', color: 'hover:bg-blue-50 hover:border-blue-300',     url: 'https://meet.google.com/new',               placeholder: 'https://meet.google.com/xxx-yyy-zzz' },
    { id: 'zoom',   label: 'Zoom',        color: 'hover:bg-blue-50 hover:border-blue-300',     url: 'https://zoom.us/start/videomeeting',        placeholder: 'https://zoom.us/j/...' },
    { id: 'teams',  label: 'MS Teams',    color: 'hover:bg-violet-50 hover:border-violet-300', url: 'https://teams.microsoft.com/l/meeting/new', placeholder: 'https://teams.microsoft.com/l/...' },
  ] as const

  const [activePlatform, setActivePlatform] = useState<string | null>(null)

  const openIntegration = (platform: typeof MEETING_INTEGRATIONS[number]) => {
    setActivePlatform(platform.id)
    // Google Meet: when org has Calendar connected, link is auto-created on submit — no new tab
    if (platform.id === 'gmeet' && googleConnected) return
    window.open(platform.url, '_blank', 'noopener')
  }

  const buildGCalLink = () => {
    if (!scheduledAt) return '#'
    const start = new Date(scheduledAt)
    const end = new Date(start.getTime() + duration * 60000)
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const title = encodeURIComponent(`${interviewType === 'phone' ? 'Phone Screen' : 'Interview'}: ${apps.map(a => a.candidate?.name).join(', ')} — ${job.position_title}`)
    const details = encodeURIComponent([
      `Job: ${job.position_title}`,
      `Interviewer: ${interviewer}`,
      location ? `Link: ${location}` : '',
      !isHtmlEmpty(notes) ? `Notes: ${stripHtml(notes)}` : '',
    ].filter(Boolean).join('\n'))
    const add = interviewerEmail ? `&add=${encodeURIComponent(interviewerEmail)}` : ''
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}${add}`
  }

  const handleSubmit = async () => {
    if (!date || !time || !interviewer.trim()) {
      setError('Date, time and interviewer are required.')
      return
    }
    // Guard against booking a slot already marked busy in the availability grid
    if (isBusy(`${date}T${time}`)) {
      setError('This time slot is busy. Please pick a free slot from the calendar below.')
      return
    }
    setSaving(true)
    setError('')

    const scheduled = new Date(`${date}T${time}:00`).toISOString()

    try {
      const results = await Promise.all(apps.map(app =>
        fetch('/api/interviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            application_id:    app.id,
            candidate_id:      app.candidate_id,
            hiring_request_id: job.id,
            stage_id:          app.stage_id ?? null,
            interviewer_name:  interviewer.trim(),
            interviewer_email: interviewerEmail.trim() || null,
            interview_type:    interviewType,
            scheduled_at:      scheduled,
            duration_minutes:  duration,
            location:          location.trim() || null,
            notes:             isHtmlEmpty(notes) ? null : notes,
            timezone:          Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        }).then(r => r.json())
      ))

      const hasError = results.some(r => r.error)
      if (hasError) {
        setError(results.find(r => r.error)?.error ?? 'Failed to schedule some interviews')
        setSaving(false)
        return
      }

      setScheduledAt(scheduled)
      const firstMeetLink  = results[0]?.data?.meet_link        ?? null
      const firstMeetError = results[0]?.data?.google_meet_error ?? null
      if (firstMeetLink)  setAutoMeetLink(firstMeetLink)
      if (firstMeetError) setGoogleMeetError(firstMeetError)
      setSaved(true)
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  const fmtDate = (d: string) => d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : ''

  // ── Success screen ─────────────────────────────────────────────────────────
  if (saved && scheduledAt) {
    const fmtScheduled = new Date(scheduledAt).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-8 text-center">
          <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            {apps.length === 1 ? 'Interview scheduled!' : `${apps.length} interviews scheduled!`}
          </h2>
          <p className="text-sm text-slate-500 mb-1">{fmtScheduled}</p>
          {interviewerEmail && (
            <p className="text-xs text-slate-400 mb-6">Interviewer: {interviewer} ({interviewerEmail})</p>
          )}

          <div className="flex flex-col gap-2.5 mb-5">
            {/* Google Meet error banner — visible when Meet creation failed so user can act */}
            {googleMeetError && !autoMeetLink && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-left">
                <p className="text-xs font-semibold text-amber-700 mb-0.5">Calendar invite not sent automatically</p>
                <p className="text-[11px] text-amber-600 break-all">{googleMeetError}</p>
                <p className="text-[11px] text-amber-500 mt-1">Use the &ldquo;Add to Google Calendar&rdquo; button below to invite manually, or reconnect Google Calendar in Settings → Integrations.</p>
              </div>
            )}
            {/* Auto-created Meet link banner */}
            {autoMeetLink && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-green-500">✓</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-green-700">Google Meet created</p>
                    <p className="text-[11px] text-green-600 truncate">{autoMeetLink}</p>
                  </div>
                </div>
                <a
                  href={autoMeetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-green-700 underline hover:text-green-900"
                >
                  Join
                </a>
              </div>
            )}
            <a
              href={buildGCalLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <span>📅</span> {autoMeetLink ? 'View in Google Calendar' : 'Add to Google Calendar'}
            </a>
            {location && !autoMeetLink && (
              <a
                href={location}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <ExternalLink className="h-4 w-4" /> Open meeting link
              </a>
            )}
          </div>

          <button
            onClick={() => { onScheduled(); onClose() }}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (<>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Schedule Interview</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {apps.length === 1
                ? `Scheduling for ${apps[0].candidate?.name}`
                : `Scheduling for ${apps.length} candidates`}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Candidates list (multi) */}
          {apps.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {apps.map(app => (
                <span key={app.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  <div className={`h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold ${avatarColor(app.candidate?.name ?? '')}`}>
                    {initials(app.candidate?.name ?? '?')}
                  </div>
                  {app.candidate?.name}
                </span>
              ))}
            </div>
          )}

          {/* ── Interview Panel ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 overflow-visible">
            {/* Panel header */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-semibold text-slate-600">Interview Panel</span>
              <button
                onClick={() => { setAddingMember(true); setNewMemberName(''); setNewMemberEmail('') }}
                className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Plus className="h-3 w-3" /> Add interviewer
              </button>
            </div>

            {/* Panel members list */}
            {panel.map((member, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-100 last:border-b-0">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${avatarColor(member.name || '?')}`}>
                  {initials(member.name || '?')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 leading-snug">{member.name || <span className="text-slate-400 italic">No name</span>}</p>
                  {member.email && (
                    <p className="text-[11px] text-slate-400 truncate">{member.email}</p>
                  )}
                </div>
                {/* Role badge (HM only) + Invite pill */}
                <div className="flex items-center gap-1 shrink-0">
                  {i === 0 && (
                    <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">HM</span>
                  )}
                  <button
                    onClick={() => { if (member.email) { setInterviewer(member.name); setInterviewerEmail(member.email) } }}
                    disabled={!member.email}
                    className={`text-[10px] font-medium rounded-full px-2 py-0.5 border transition-colors ${
                      interviewer === member.name && interviewerEmail === member.email
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : member.email
                        ? 'text-slate-400 border-slate-200 hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50 bg-white'
                        : 'text-slate-300 border-slate-100 bg-white cursor-not-allowed'
                    }`}
                    title={member.email ? 'Set as primary interviewer (receives calendar invite)' : 'Add email to send invite'}
                  >
                    ✉ {interviewer === member.name && interviewerEmail === member.email ? 'Invite ✓' : 'Invite'}
                  </button>
                </div>
                {/* Remove — always enabled; tooltip explains for the HM row */}
                <button
                  onClick={() => {
                    const next = panel.filter((_, j) => j !== i)
                    setPanel(next)
                    // If the removed member was the selected interviewer, fall back to first remaining
                    if (interviewer === member.name && interviewerEmail === member.email) {
                      setInterviewer(next[0]?.name ?? '')
                      setInterviewerEmail(next[0]?.email ?? '')
                    }
                  }}
                  className="h-5 w-5 flex items-center justify-center rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                  title={i === 0 ? 'Remove hiring manager from panel' : 'Remove from panel'}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            {/* Add member inline form */}
            {addingMember && (
              <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-100 bg-slate-50">
                <input
                  autoFocus
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  placeholder="Name"
                  className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={e => setNewMemberEmail(e.target.value)}
                  placeholder="Email"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newMemberName.trim()) {
                      const nm = { name: newMemberName.trim(), email: newMemberEmail.trim() }
                      setPanel(p => [...p, nm])
                      // Auto-select as interviewer if no one is currently selected
                      if (!interviewer.trim()) { setInterviewer(nm.name); setInterviewerEmail(nm.email) }
                      setAddingMember(false)
                    }
                    if (e.key === 'Escape') setAddingMember(false)
                  }}
                  className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={() => {
                    if (!newMemberName.trim()) return
                    const nm = { name: newMemberName.trim(), email: newMemberEmail.trim() }
                    setPanel(p => [...p, nm])
                    // Auto-select as interviewer if no one is currently selected
                    if (!interviewer.trim()) { setInterviewer(nm.name); setInterviewerEmail(nm.email) }
                    setAddingMember(false)
                  }}
                  disabled={!newMemberName.trim()}
                  className="shrink-0 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => setAddingMember(false)}
                  className="shrink-0 h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Interview type */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Interview type</label>
            <div className="grid grid-cols-3 gap-1.5">
              {INTERVIEW_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setInterviewType(t.value)}
                  className={`px-2.5 py-2 rounded-xl border text-xs font-medium transition-colors text-left ${
                    interviewType === t.value
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Duration</label>
            <div className="flex gap-1.5">
              {DURATION_OPTIONS.map(d => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`flex-1 px-2 py-2 rounded-xl border text-xs font-medium transition-colors ${
                    duration === d.value
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                min={toLocalDateStr(new Date())}
                onChange={e => { setDate(e.target.value); setAvailWeekOffset(0) }}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {date && <p className="text-xs text-slate-400 mt-1">{fmtDate(date)}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Time</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* ── Availability grid ──────────────────────────────────────────── */}
          {googleConnected && panel.some(m => m.email.trim()) && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold text-slate-600 shrink-0">Panel Availability</span>
                  {/* Member avatar chips — shows whose calendars are being queried */}
                  <div className="flex items-center -space-x-1">
                    {panel.filter(m => m.email.trim()).map((m, i) => (
                      <div
                        key={i}
                        title={`${m.name}\n${m.email}`}
                        className={`h-4 w-4 rounded-full border border-white flex items-center justify-center text-[8px] font-bold shrink-0 ${avatarColor(m.name || '?')}`}
                      >
                        {initials(m.name || '?')}
                      </div>
                    ))}
                  </div>
                  {/* Queried emails — visible so users can verify the right account is checked */}
                  <span
                    className="text-[9px] text-slate-400 truncate max-w-[140px]"
                    title={panel.filter(m => m.email.trim()).map(m => m.email).join(', ')}
                  >
                    {panel.filter(m => m.email.trim()).map(m => m.email.split('@')[0]).join(', ')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setAvailWeekOffset(o => o - 1)}
                    className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors text-xs"
                  >‹</button>
                  <span className="text-[10px] text-slate-500 px-1 whitespace-nowrap">
                    {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <button
                    onClick={() => setAvailWeekOffset(o => o + 1)}
                    className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors text-xs"
                  >›</button>
                  {/* Open full-calendar popup */}
                  <button
                    onClick={() => setGridExpanded(true)}
                    title="Open full calendar"
                    className="h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors text-xs ml-0.5"
                  >
                    ⤢
                  </button>
                </div>
              </div>

              {availLoading ? (
                /* Skeleton */
                <div className="p-3 grid grid-cols-6 gap-1 animate-pulse">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className="rounded bg-slate-100 h-4" />
                  ))}
                </div>
              ) : availNoData ? (
                <div className="px-3 py-4 text-center text-xs text-slate-400">
                  No calendar data — {panel.filter(m => m.email.trim()).length > 1 ? 'panel members may be' : 'interviewer may be'} outside your Google Workspace domain
                </div>
              ) : (
                <div ref={inlineGridRef} className="overflow-x-auto overflow-y-auto max-h-[280px]">
                  <table className="w-full text-[10px]">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr>
                        <th className="w-10 px-1 py-1.5 text-left text-slate-400 font-normal border-b border-slate-100 bg-white" />
                        {weekDays.map(d => {
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6
                          return (
                            <th key={d.toISOString()} className={`px-0.5 py-1.5 text-center font-semibold border-b border-slate-100 whitespace-nowrap text-[10px] ${isWeekend ? 'bg-slate-50 text-slate-400' : 'bg-white text-slate-500'}`}>
                              {d.toLocaleDateString('en-US', { weekday: 'short' })} {d.getDate()}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {HOUR_SLOTS.map(slot => (
                        <tr key={slot} className={slot.endsWith(':00') ? 'border-t border-slate-200' : 'border-t border-slate-50'}>
                          <td className="px-1 py-0 text-slate-300 text-right whitespace-nowrap leading-none text-[10px]" style={{ height: 20 }}>
                            {slot.endsWith(':00') ? fmtSlotLabel(slot) : ''}
                          </td>
                          {weekDays.map(day => {
                            const key = slotKey(day, slot)
                            const busyEmails = getBusyEmails(key)
                            const busy = busyEmails.length > 0
                            const isSelected = date === toLocalDateStr(day) && time === slot
                            const isWeekend = day.getDay() === 0 || day.getDay() === 6
                            // Shade all 30-min cells that fall within [selectedTime, selectedTime + duration)
                            const isInBlock = (() => {
                              if (!date || !time || date !== toLocalDateStr(day)) return false
                              const [selH, selM] = time.split(':').map(Number)
                              const [slH, slM]   = slot.split(':').map(Number)
                              const selMin = selH * 60 + selM
                              const slMin  = slH * 60 + slM
                              return slMin >= selMin && slMin < selMin + duration
                            })()
                            // Last slot in the duration block (for bottom rounding)
                            const isLastOfBlock = isInBlock && (() => {
                              if (!date || !time || date !== toLocalDateStr(day)) return false
                              const [selH, selM] = time.split(':').map(Number)
                              const [slH, slM]   = slot.split(':').map(Number)
                              const selMin = selH * 60 + selM
                              const slMin  = slH * 60 + slM
                              return slMin + 30 >= selMin + duration
                            })()
                            // Google-Calendar-style connected block rounding
                            const blockRound = !isInBlock ? 'rounded'
                              : isSelected && isLastOfBlock ? 'rounded'
                              : isSelected  ? 'rounded-t'
                              : isLastOfBlock ? 'rounded-b'
                              : 'rounded-none'
                            return (
                              <td key={key} className={`px-0.5 ${isInBlock ? 'py-0' : 'py-px'} ${isWeekend ? 'bg-slate-50/60' : ''}`}>
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    setDate(toLocalDateStr(day))
                                    setTime(slot)
                                    setAvailWeekOffset(0)
                                  }}
                                  style={{ height: 20 }}
                                  className={`w-full transition-colors ${blockRound} ${
                                    busy
                                      ? (isSelected || isInBlock)
                                        ? 'bg-red-300 ring-1 ring-blue-400 cursor-not-allowed'
                                        : 'bg-red-100 cursor-not-allowed'
                                      : isSelected
                                      ? 'bg-blue-600'
                                      : isInBlock
                                      ? 'bg-blue-200 hover:bg-blue-300 cursor-pointer'
                                      : isWeekend
                                      ? 'bg-slate-100 hover:bg-slate-200 cursor-pointer'
                                      : 'bg-emerald-50 hover:bg-emerald-200 cursor-pointer'
                                  }`}
                                  title={busy ? `Busy: ${busyEmails.join(', ')}` : `${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${fmtSlotLabel(slot)}`}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex items-center gap-3 px-3 py-1.5 border-t border-slate-100 bg-slate-50 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="inline-block h-2.5 w-4 rounded bg-emerald-100 border border-emerald-200" /> Free</span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="inline-block h-2.5 w-4 rounded bg-red-100" /> Busy</span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="inline-block h-2.5 w-4 rounded bg-blue-600" /> Start</span>
                    <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="inline-block h-2.5 w-4 rounded bg-blue-200" /> Duration block</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Meeting platform + link */}
          {interviewType !== 'in_person' && interviewType !== 'phone' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Meeting platform</label>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {MEETING_INTEGRATIONS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => openIntegration(p)}
                    className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                      activePlatform === p.id
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : `border-slate-200 text-slate-600 ${p.color}`
                    }`}
                  >
                    <span className="text-base">
                      {p.id === 'gmeet' ? '🎥' : p.id === 'zoom' ? '💻' : '🟦'}
                    </span>
                    {p.label}
                    {p.id !== 'gmeet' && (
                      <span className="text-[9px] font-normal text-slate-400 leading-none">Coming soon</span>
                    )}
                  </button>
                ))}
              </div>
              {/* Google Meet + Calendar connected → auto-create banner */}
              {activePlatform === 'gmeet' && googleConnected ? (
                <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2.5">
                  <span className="text-green-500 text-base">✓</span>
                  <div>
                    <p className="text-xs font-semibold text-green-700">Google Meet link will be auto-created</p>
                    <p className="text-[11px] text-green-600">Calendar invites sent to candidate &amp; interviewer on schedule</p>
                  </div>
                </div>
              ) : (
                <>
                  {activePlatform && activePlatform !== 'gmeet' && (
                    <p className="text-xs text-slate-400 mb-1.5">
                      Copy the link from the new tab and paste it below
                    </p>
                  )}
                  {(!activePlatform || activePlatform !== 'gmeet') && (
                    <input
                      value={location}
                      onChange={e => setLocation(e.target.value)}
                      placeholder={
                        activePlatform
                          ? MEETING_INTEGRATIONS.find(p => p.id === activePlatform)?.placeholder ?? 'Paste meeting link...'
                          : 'Paste meeting link (Zoom, Meet, Teams…)'
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* Location (in-person / phone) */}
          {(interviewType === 'in_person' || interviewType === 'phone') && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {interviewType === 'in_person' ? 'Address / Room' : 'Phone number or dial-in'}
              </label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder={interviewType === 'in_person' ? 'e.g. 4th floor, Room B' : 'e.g. +1 (555) 000-0000'}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Notes <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <RichTextEditor
              value={notes}
              onChange={setNotes}
              placeholder="Topics to cover, prep instructions…"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Scheduling…</>
            ) : (
              `Schedule ${apps.length > 1 ? `${apps.length} interviews` : 'interview'}`
            )}
          </button>
        </div>
      </div>
    </div>

    {/* ── Full-screen Panel Availability Popup ─────────────────────────────── */}
    {gridExpanded && (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={() => setGridExpanded(false)}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-[800px] max-w-[95vw] max-h-[85vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Popup header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-slate-700">Panel Availability</span>
              <div className="flex items-center -space-x-1">
                {panel.filter(m => m.email.trim()).map((m, i) => (
                  <div
                    key={i}
                    title={`${m.name} (${m.email})`}
                    className={`h-5 w-5 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-bold shrink-0 ${avatarColor(m.name || '?')}`}
                  >
                    {initials(m.name || '?')}
                  </div>
                ))}
              </div>
              {panel.filter(m => m.email.trim()).length > 1 && (
                <span className="text-[10px] text-slate-400">combined</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setAvailWeekOffset(o => o - 1)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors"
              >‹</button>
              <span className="text-xs font-medium text-slate-600 px-2 whitespace-nowrap">
                {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <button
                onClick={() => setAvailWeekOffset(o => o + 1)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors"
              >›</button>
              <button
                onClick={() => setGridExpanded(false)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors ml-2"
                title="Close (Esc)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Popup grid body */}
          <div ref={popupGridRef} className="flex-1 overflow-y-auto">
            {availLoading ? (
              <div className="p-4 grid grid-cols-6 gap-1.5 animate-pulse">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div key={i} className="rounded bg-slate-100 h-7" />
                ))}
              </div>
            ) : availNoData ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
                <span className="text-2xl">📅</span>
                <span className="text-sm text-center px-8">
                  No calendar data — {panel.filter(m => m.email.trim()).length > 1 ? 'panel members may be' : 'interviewer may be'} outside your Google Workspace domain
                </span>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white z-10">
                  <tr>
                    <th className="w-16 px-3 py-2 text-left text-slate-400 font-normal border-b border-slate-100 bg-white" />
                    {weekDays.map(d => {
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6
                      return (
                        <th key={d.toISOString()} className={`px-2 py-2 text-center font-semibold border-b border-slate-100 whitespace-nowrap ${isWeekend ? 'bg-slate-50 text-slate-400' : 'bg-white text-slate-600'}`}>
                          {d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {HOUR_SLOTS.map(slot => (
                    <tr key={slot} className={slot.endsWith(':00') ? 'border-t border-slate-200' : 'border-t border-slate-50'}>
                      <td className="px-3 py-0 text-slate-300 text-right whitespace-nowrap leading-none text-[11px]" style={{ height: 28 }}>
                        {slot.endsWith(':00') ? fmtSlotLabel(slot) : ''}
                      </td>
                      {weekDays.map(day => {
                        const key = slotKey(day, slot)
                        const busyEmails = getBusyEmails(key)
                        const busy = busyEmails.length > 0
                        const isSelected = date === toLocalDateStr(day) && time === slot
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6
                        // Shade all 30-min cells that fall within [selectedTime, selectedTime + duration)
                        const isInBlock = (() => {
                          if (!date || !time || date !== toLocalDateStr(day)) return false
                          const [selH, selM] = time.split(':').map(Number)
                          const [slH, slM]   = slot.split(':').map(Number)
                          const selMin = selH * 60 + selM
                          const slMin  = slH * 60 + slM
                          return slMin >= selMin && slMin < selMin + duration
                        })()
                        // Last slot in the duration block (for bottom rounding)
                        const isLastOfBlock = isInBlock && (() => {
                          if (!date || !time || date !== toLocalDateStr(day)) return false
                          const [selH, selM] = time.split(':').map(Number)
                          const [slH, slM]   = slot.split(':').map(Number)
                          const selMin = selH * 60 + selM
                          const slMin  = slH * 60 + slM
                          return slMin + 30 >= selMin + duration
                        })()
                        const blockRound = !isInBlock ? 'rounded'
                          : isSelected && isLastOfBlock ? 'rounded'
                          : isSelected    ? 'rounded-t'
                          : isLastOfBlock ? 'rounded-b'
                          : 'rounded-none'
                        return (
                          <td key={key} className={`px-1 ${isInBlock ? 'py-0' : 'py-px'} ${isWeekend ? 'bg-slate-50/60' : ''}`}>
                            <button
                              disabled={busy}
                              onClick={() => {
                                setDate(toLocalDateStr(day))
                                setTime(slot)
                                setAvailWeekOffset(0)
                                setGridExpanded(false)
                              }}
                              style={{ height: 28 }}
                              className={`w-full transition-colors ${blockRound} ${
                                busy
                                  ? (isSelected || isInBlock)
                                    ? 'bg-red-300 ring-1 ring-blue-400 cursor-not-allowed'
                                    : 'bg-red-100 cursor-not-allowed'
                                  : isSelected
                                  ? 'bg-blue-600'
                                  : isInBlock
                                  ? 'bg-blue-200 hover:bg-blue-300 cursor-pointer'
                                  : isWeekend
                                  ? 'bg-slate-100 hover:bg-slate-200 cursor-pointer'
                                  : 'bg-emerald-50 hover:bg-emerald-200 cursor-pointer'
                              }`}
                              title={busy ? `Busy: ${busyEmails.join(', ')}` : `${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${fmtSlotLabel(slot)}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="inline-block h-3 w-5 rounded bg-emerald-100 border border-emerald-200" /> Free
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="inline-block h-3 w-5 rounded bg-red-100" /> Busy
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="inline-block h-3 w-5 rounded bg-blue-600" /> Start
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="inline-block h-3 w-5 rounded bg-blue-200" /> Duration block
            </span>
            <span className="ml-auto text-xs text-slate-400">Esc to close</span>
          </div>
        </div>
      </div>
    )}
  </>)
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function JobPipelinePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Card field preferences from settings
  const { settings } = useSettings()
  const cardFields = settings.kanban_card_fields ?? ['company']

  const [job, setJob] = useState<JobWithPipeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [addingStage, setAddingStage] = useState(false)
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [copied, setCopied] = useState(false)
  const dragId      = useRef<string | null>(null)
  const dragStageId = useRef<string | null>(null)

  // Split-pane: active (top) / rejected (bottom)
  const [splitHeight, setSplitHeight] = useState<number | null>(null)
  const splitDragRef  = useRef<{ startY: number; startH: number } | null>(null)
  const activeAreaRef = useRef<HTMLDivElement>(null)

  // Status column resizable width
  const [statusColWidth, setStatusColWidth] = useState(165)
  const statusDragRef = useRef<{ startX: number; startW: number } | null>(null)

  const handleStatusColMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    statusDragRef.current = { startX: e.clientX, startW: statusColWidth }
    const onMove = (me: MouseEvent) => {
      if (!statusDragRef.current) return
      const delta = me.clientX - statusDragRef.current.startX
      setStatusColWidth(Math.max(90, Math.min(280, statusDragRef.current.startW + delta)))
    }
    const onUp = () => {
      statusDragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleSplitMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const h = activeAreaRef.current?.getBoundingClientRect().height ?? 400
    splitDragRef.current = { startY: e.clientY, startH: h }
    const onMove = (me: MouseEvent) => {
      if (!splitDragRef.current) return
      const delta = me.clientY - splitDragRef.current.startY
      const next = Math.max(180, Math.min(window.innerHeight * 0.82, splitDragRef.current.startH + delta))
      setSplitHeight(next)
    }
    const onUp = () => {
      splitDragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
  // Prevents load() from overwriting scored state with stale server data.
  // Set to true at scoring start; cleared 5 s after scoring ends so that
  // the visibilitychange / switchView refetch guards don't live forever.
  const scoringRef = useRef(false)

  // View mode — initialised from URL ?view= so hard refresh preserves it
  const [viewMode, setViewMode] = useState<'kanban' | 'ranked'>(
    searchParams.get('view') === 'ranked' ? 'ranked' : 'kanban'
  )

  // Autopilot drawer
  const [showAutopilot, setShowAutopilot] = useState(false)

  // Kanban filter / sort state
  const [filterSearch,  setFilterSearch]  = useState('')
  const [filterSource,  setFilterSource]  = useState('all')
  const [filterStage,   setFilterStage]   = useState('all')
  const [filterScore,   setFilterScore]   = useState('all')   // 'all' | 'scored' | 'unscored'
  const [filterSignal,  setFilterSignal]  = useState('all')   // 'all' | 'strong_yes' | 'yes' | 'maybe' | 'no'
  const [filterAction,  setFilterAction]  = useState('all')   // 'all' | 'score_needed' | 'advance' | 'reject'
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const filterPanelRef = useRef<HTMLDivElement>(null)
  // Count of non-default filter dropdowns (not counting search)
  const activeFilterCount = [
    filterSource !== 'all', filterStage !== 'all', filterScore !== 'all',
    filterSignal !== 'all', filterAction !== 'all',
  ].filter(Boolean).length
  const [openStageMenu, setOpenStageMenu] = useState<string | null>(null)
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set())

  // Free cross-stage toggle — no stage restrictions
  const toggleSelect = (appId: string) => {
    setSelectedApps(prev => {
      const next = new Set(prev)
      if (next.has(appId)) next.delete(appId); else next.add(appId)
      return next
    })
  }
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showJobMenu,  setShowJobMenu]  = useState(false)
  const [scheduleModalApps, setScheduleModalApps] = useState<Application[] | null>(null)

  // Scoring state
  const [scoring, setScoring] = useState(false)
  const [scoreProgress, setScoreProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [scoreResult,   setScoreResult]   = useState<{ scored: number; errors: number; first_error: string | null; auto_advanced: number; auto_rejected: number; emails_sent: number } | null>(null)
  const [scoreError,    setScoreError]    = useState('')

  const load = useCallback(async () => {
    // Never stomp on live scoring state — scores are patched directly from SSE
    // events and a stale server response would wipe them.
    if (scoringRef.current) return
    const res = await fetch(`/api/jobs/${id}`, { cache: 'no-store' })
    const json = await res.json()
    setJob(json.data ?? null)
    setLoading(false)
  }, [id])

  const switchView = useCallback((mode: 'kanban' | 'ranked') => {
    setViewMode(mode)
    // No load() here — job data is already in state; scores come from SSE patches,
    // not from a server refetch, so fetching would risk overwriting them.
  }, [])

  useEffect(() => { load() }, [load])

  // Refetch when tab regains focus so drag-and-drop from another tab stays in sync
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  // ── URL state persistence: restore selectedApp once job is loaded ──────────
  // When a user hard-refreshes /jobs/[id]?app=<applicationId>, re-open that
  // application's panel automatically so the view is exactly as they left it.
  const restoredAppRef = useRef(false)
  useEffect(() => {
    if (!job || restoredAppRef.current) return
    restoredAppRef.current = true
    const appId = searchParams.get('app')
    if (appId) {
      const app = job.applications.find(a => a.id === appId)
      if (app) setSelectedApp(app)
    }
  }, [job, searchParams])

  // Sync selectedApp → URL ?app= param (replace so Back button still works)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (selectedApp) {
      params.set('app', selectedApp.id)
    } else {
      params.delete('app')
    }
    const next = params.toString() ? `?${params.toString()}` : ''
    router.replace(`/jobs/${id}${next}`, { scroll: false })
  }, [selectedApp, id, router]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync viewMode → URL ?view= param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (viewMode === 'ranked') {
      params.set('view', 'ranked')
    } else {
      params.delete('view')
    }
    const next = params.toString() ? `?${params.toString()}` : ''
    router.replace(`/jobs/${id}${next}`, { scroll: false })
  }, [viewMode, id, router]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close filter panel when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setFilterPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeApps = useMemo(
    () => job?.applications.filter(a => a.status === 'active') ?? [],
    [job]
  )

  // Determine if selection spans multiple stages (to grey Suggested Action column)
  const selectedStageIds = useMemo(() => {
    const ids = new Set<string>()
    Array.from(selectedApps).forEach(appId => {
      const app = activeApps.find(a => a.id === appId)
      if (app) ids.add(app.stage_id ?? '__unstaged__')
    })
    return ids
  }, [selectedApps, activeApps])
  const isMultiStageSelection = selectedApps.size > 0 && selectedStageIds.size > 1

  const grouped = (job?.pipeline_stages ?? []).reduce<Record<string, Application[]>>((acc, s) => {
    acc[s.id] = activeApps.filter(a => a.stage_id === s.id)
    return acc
  }, {})
  const unstaged = activeApps.filter(a => !a.stage_id)

  // Helper: apply all active filters to a flat array of applications
  const applyFilters = useCallback((apps: Application[]) => {
    let filtered = apps
    const q = filterSearch.trim().toLowerCase()
    if (q)                       filtered = filtered.filter(a => (a.candidate?.name ?? '').toLowerCase().includes(q))
    if (filterSource !== 'all')  filtered = filtered.filter(a => a.source === filterSource)
    if (filterStage  !== 'all')  filtered = filtered.filter(a => a.stage_id === filterStage)
    if (filterScore  === 'scored')   filtered = filtered.filter(a => a.ai_score !== null)
    if (filterScore  === 'unscored') filtered = filtered.filter(a => a.ai_score === null)
    if (filterSignal !== 'all')  filtered = filtered.filter(a => a.ai_recommendation === filterSignal)
    if (filterAction !== 'all') {
      const stages = job?.pipeline_stages ?? []
      filtered = filtered.filter(a => {
        const idx        = stages.findIndex(s => s.id === a.stage_id)
        const isLast     = idx === stages.length - 1
        const hasNext    = idx >= 0 && !isLast && stages.length > 1
        if (filterAction === 'score_needed') return a.ai_score === null
        if (filterAction === 'reject')       return a.ai_recommendation === 'no'
        if (filterAction === 'advance')      return a.ai_recommendation !== 'no' && hasNext && a.ai_score !== null
        return true
      })
    }
    return filtered
  }, [filterSearch, filterSource, filterStage, filterScore, filterSignal, filterAction, job])

  // Filtered flat list for Ranked view (sort happens inside RankedView via column headers)
  const filteredApps = useMemo(() => applyFilters(activeApps), [activeApps, applyFilters])

  // Filtered grouped for Kanban (no column-level sort — cards kept in natural order)
  const filteredGrouped = useMemo(() => {
    const result: Record<string, Application[]> = {}
    for (const [sid, apps] of Object.entries(grouped)) {
      result[sid] = applyFilters(apps)
    }
    return result
  }, [grouped, applyFilters])

  // Rejected apps grouped by stage (for the bottom rejected pane)
  const rejectedGrouped = useMemo(() =>
    (job?.pipeline_stages ?? []).reduce<Record<string, Application[]>>((acc, s) => {
      acc[s.id] = (job?.applications ?? []).filter(a => a.status === 'rejected' && a.stage_id === s.id)
      return acc
    }, {}),
  [job])
  const totalRejected = Object.values(rejectedGrouped).reduce((n, a) => n + a.length, 0)

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  const handleDrop = async (newStageId: string) => {
    const appId = dragId.current
    if (!appId) return
    const app = job?.applications.find(a => a.id === appId)
    const wasRejected = app?.status === 'rejected'
    // Allow drop if stage changes OR if a rejected card is being restored to active
    if (!app || (app.stage_id === newStageId && !wasRejected)) { dragId.current = null; return }

    const updates: Record<string, unknown> = { stage_id: newStageId }
    if (wasRejected) updates.status = 'active'

    // Optimistic update
    setJob(prev => prev ? {
      ...prev,
      applications: prev.applications.map(a =>
        a.id === appId
          ? { ...a, stage_id: newStageId, ...(wasRejected ? { status: 'active' as Application['status'] } : {}) }
          : a
      ),
    } : prev)

    await fetch(`/api/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })

    dragId.current = null
  }

  // ── Stage management ──────────────────────────────────────────────────────
  const callStagesApi = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/jobs/${id}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  }

  const handleAddStage = async () => {
    if (!newStageName.trim()) return
    setAddingStage(true)
    const res = await fetch(`/api/jobs/${id}/stages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name: newStageName.trim(), color: 'blue' }),
    })
    if (res.ok) {
      setNewStageName('')
      await load()
    }
    setAddingStage(false)
  }

  const handleRename = async (stageId: string, name: string) => {
    setJob(prev => prev ? {
      ...prev,
      pipeline_stages: prev.pipeline_stages.map(s => s.id === stageId ? { ...s, name } : s),
    } : prev)
    await callStagesApi({ action: 'update', id: stageId, name })
  }

  const handleRecolor = async (stageId: string, color: StageColor) => {
    setJob(prev => prev ? {
      ...prev,
      pipeline_stages: prev.pipeline_stages.map(s => s.id === stageId ? { ...s, color } : s),
    } : prev)
    await callStagesApi({ action: 'update', id: stageId, color })
  }

  const handleDeleteStage = async (stageId: string) => {
    if (!confirm('Delete this stage? Candidates in it will become unstaged.')) return
    setJob(prev => prev ? {
      ...prev,
      pipeline_stages: prev.pipeline_stages.filter(s => s.id !== stageId),
      applications: prev.applications.map(a => a.stage_id === stageId ? { ...a, stage_id: null } : a),
    } : prev)
    await callStagesApi({ action: 'delete', id: stageId })
  }

  const handleStageReorder = async (targetStageId: string) => {
    const srcId = dragStageId.current
    if (!srcId || srcId === targetStageId || !job) return
    const stages = [...job.pipeline_stages]
    const fromIdx = stages.findIndex(s => s.id === srcId)
    const toIdx   = stages.findIndex(s => s.id === targetStageId)
    if (fromIdx === -1 || toIdx === -1) return
    const [moved] = stages.splice(fromIdx, 1)
    stages.splice(toIdx, 0, moved)
    dragStageId.current = null
    setJob(prev => prev ? { ...prev, pipeline_stages: stages } : prev)
    await callStagesApi({ action: 'reorder', stages: stages.map((s, i) => ({ id: s.id, order_index: i })) })
  }

  // ── Stage change from slide-over ──────────────────────────────────────────
  const handleStageChange = async (appId: string, stageId: string) => {
    setJob(prev => prev ? {
      ...prev,
      applications: prev.applications.map(a => a.id === appId ? { ...a, stage_id: stageId } : a),
    } : prev)
    setSelectedApp(prev => prev && prev.id === appId ? { ...prev, stage_id: stageId } : prev)
    await fetch(`/api/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: stageId }),
    })
  }

  const handleStatusChange = async (appId: string, status: string) => {
    setJob(prev => prev ? {
      ...prev,
      applications: prev.applications.map(a =>
        a.id === appId ? { ...a, status: status as Application['status'] } : a
      ),
    } : prev)
    setSelectedApp(null)
    await fetch(`/api/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  const copyApplyLink = () => {
    if (!job?.apply_link_token) return
    const url = `${window.location.origin}/apply/${job.apply_link_token}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const startScoring = async (stageId?: string, applicationId?: string) => {
    if (scoring) return
    const appsToScore = applicationId
      ? activeApps.filter(a => a.id === applicationId)
      : stageId ? (grouped[stageId] ?? []) : activeApps
    const total = appsToScore.length
    if (total === 0) return

    scoringRef.current = true   // block load() for the duration of scoring
    setScoring(true)
    setScoreError('')
    setScoreResult(null)
    setScoreProgress({ done: 0, total })

    try {
      const body = applicationId ? { application_id: applicationId }
                 : stageId       ? { stage_id: stageId }
                 : {}
      const res = await fetch(`/api/jobs/${id}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}))
        setScoreError((j as { error?: string }).error ?? 'Scoring failed')
        setScoring(false)
        return
      }

      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let   buf    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })

        // SSE frames are separated by \n\n
        const frames = buf.split('\n\n')
        buf = frames.pop() ?? ''

        for (const frame of frames) {
          const line = frame.replace(/^data: /, '').trim()
          if (!line) continue
          try {
            const evt = JSON.parse(line) as Record<string, unknown>
            if (evt.type === 'progress') {
              setScoreProgress(prev => ({ ...prev, done: prev.done + 1 }))

              const appId  = evt.application_id as string
              const score  = evt.score          as number
              const rec    = evt.recommendation as Application['ai_recommendation']
              const action = evt.action         as 'advanced' | 'rejected' | 'none'
              const strengths = (evt.strengths as string[] | undefined) ?? []
              const gaps      = (evt.gaps      as string[] | undefined) ?? []

              // Patch everything directly into React state — no server refetch needed.
              // This is the only reliable approach: the SSE event IS the ground truth
              // (it fires right after the DB write succeeds), so we never need to
              // round-trip back to the server and risk stale-cache overwrites.
              setJob(prev => {
                if (!prev) return prev
                return {
                  ...prev,
                  applications: prev.applications.map(a => {
                    if (a.id !== appId) return a
                    const updated: Application = {
                      ...a,
                      ai_score:          score,
                      ai_recommendation: rec,
                      ai_strengths:      strengths,
                      ai_gaps:           gaps,
                      ai_scored_at:      new Date().toISOString(),
                    }
                    if (action === 'advanced' && prev.auto_advance_stage_id) {
                      updated.stage_id = prev.auto_advance_stage_id
                    }
                    if (action === 'rejected') {
                      updated.status = 'rejected'
                    }
                    return updated
                  }),
                }
              })
            } else if (evt.type === 'complete') {
              setScoreResult({
                scored:        (evt.scored        as number) ?? 0,
                errors:        (evt.errors        as number) ?? 0,
                first_error:   (evt.first_error   as string | null) ?? null,
                auto_advanced: (evt.auto_advanced as number) ?? 0,
                auto_rejected: (evt.auto_rejected as number) ?? 0,
                emails_sent:   (evt.emails_sent   as number) ?? 0,
              })
              // No load() here — all state was already patched per-candidate above.
              // Calling load() would risk a stale-cache overwrite that erases scores.
            }
          } catch { /* ignore malformed frames */ }
        }
      }
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : 'Scoring failed')
    } finally {
      setScoring(false)
      // Keep load() suppressed for 5 s so that a visibilitychange or tab-switch
      // that fires right after scoring can't fetch stale data and overwrite scores.
      setTimeout(() => { scoringRef.current = false }, 5000)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-slate-400 text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading pipeline…
      </div>
    )
  }

  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-slate-400 text-sm gap-2">
        <AlertCircle className="h-6 w-6" />
        Job not found.
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-slate-50 to-white sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/jobs')}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 transition-colors shadow-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Jobs
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{job.position_title}</h1>
            {(job.department || job.location) && (
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                {[job.department, job.location].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-white border border-slate-200 shadow-sm px-3 py-1 text-xs font-semibold text-slate-600">
              <Users className="h-3.5 w-3.5 text-violet-500" />
              {activeApps.length} in pipeline
            </span>
            {job.ticket_number && (
              <span className="font-mono text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1">
                {job.ticket_number}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* View toggle */}
          <div className="flex items-center rounded-xl border border-slate-200 p-0.5 bg-slate-50">
            <button
              onClick={() => switchView('kanban')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'kanban' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              Kanban
            </button>
            <button
              onClick={() => switchView('ranked')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'ranked' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Ranked
            </button>
          </div>

          <div className="h-5 w-px bg-slate-200 hidden xl:block" />

          {/* Autopilot — inline on xl+ */}
          <button
            onClick={() => setShowAutopilot(true)}
            className={`hidden xl:flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors border ${
              job.auto_advance_score !== null || job.auto_reject_score !== null
                ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Settings2 className="h-4 w-4" />
            Autopilot
            {(job.auto_advance_score !== null || job.auto_reject_score !== null) && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </button>

          {/* Job settings (Apply Link, etc.) — inline on xl+ */}
          <div className="relative hidden xl:block">
            <button
              onClick={() => setShowJobMenu(m => !m)}
              title="Copy apply link & more"
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                showJobMenu
                  ? 'border-slate-300 bg-slate-100 text-slate-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Link2 className="h-4 w-4" />
            </button>
            {showJobMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowJobMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-1">
                  <button
                    onClick={() => { copyApplyLink(); setShowJobMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Link2 className="h-4 w-4 text-slate-400" />
                    {copied ? 'Link Copied!' : 'Copy Apply Link'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ⋯ More — visible below xl, collapses Autopilot/Edit/Apply */}
          <div className="relative xl:hidden">
            <button
              onClick={() => setShowMoreMenu(m => !m)}
              className="flex items-center gap-1 rounded-xl border border-slate-200 px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1">
                  <button
                    onClick={() => { setShowAutopilot(true); setShowMoreMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Settings2 className="h-4 w-4 text-slate-400" />
                    Autopilot
                    {(job.auto_advance_score !== null || job.auto_reject_score !== null) && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
                    )}
                  </button>
                  <button
                    onClick={() => { copyApplyLink(); setShowMoreMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Link2 className="h-4 w-4 text-slate-400" />
                    {copied ? 'Copied!' : 'Copy Apply Link'}
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            <UserPlus className="h-4 w-4" />
            Add Candidate
          </button>
        </div>
      </div>

      {/* Score progress / result banner */}
      {(scoring || scoreResult || scoreError) && (
        <div className={`px-8 py-3 border-b flex items-center gap-3 text-sm ${
          scoreError                                          ? 'bg-red-50 border-red-200 text-red-700'         :
          scoreResult && scoreResult.errors > 0 && scoreResult.scored === 0 ? 'bg-red-50 border-red-200 text-red-700' :
          scoreResult && scoreResult.errors > 0              ? 'bg-amber-50 border-amber-200 text-amber-800'   :
          scoreResult                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                                                               'bg-violet-50 border-violet-200 text-violet-700'
        }`}>
          {scoring && (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Scoring {scoreProgress.done} of {scoreProgress.total} candidates…</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-violet-200 overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-300"
                    style={{ width: scoreProgress.total > 0 ? `${(scoreProgress.done / scoreProgress.total) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            </>
          )}
          {scoreResult && !scoring && (
            <>
              {scoreResult.errors > 0 && scoreResult.scored === 0
                ? <AlertCircle className="h-4 w-4 shrink-0" />
                : <Check className="h-4 w-4 shrink-0" />
              }
              <div className="flex-1">
                <p className="font-medium">
                  {scoreResult.scored > 0 && `✓ ${scoreResult.scored} scored`}
                  {scoreResult.scored > 0 && scoreResult.auto_advanced > 0 && ` · ${scoreResult.auto_advanced} advanced`}
                  {scoreResult.scored > 0 && scoreResult.auto_rejected > 0 && ` · ${scoreResult.auto_rejected} rejected`}
                  {scoreResult.scored > 0 && scoreResult.emails_sent   > 0 && ` · ${scoreResult.emails_sent} emails sent`}
                  {scoreResult.errors > 0 && (scoreResult.scored > 0 ? ` · ` : '') + `${scoreResult.errors} failed`}
                </p>
                {scoreResult.first_error && (
                  <p className="text-xs mt-0.5 opacity-80">{scoreResult.first_error}</p>
                )}
              </div>
              <button onClick={() => setScoreResult(null)} className="p-0.5 rounded hover:bg-emerald-200 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </>
          )}
          {scoreError && (
            <>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="flex-1">{scoreError}</p>
              <button onClick={() => setScoreError('')} className="p-0.5 rounded hover:bg-red-200 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Filter / sort bar */}
      <div className="flex items-center gap-2 px-8 py-2.5 border-b border-slate-100 bg-slate-50/70 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          <input
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder="Search candidates…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          />
        </div>

        {/* Unified Filters button + dropdown panel */}
        <div className="relative" ref={filterPanelRef}>
          <button
            onClick={() => setFilterPanelOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              activeFilterCount > 0
                ? 'border-violet-300 bg-violet-50 text-violet-700 font-medium'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {filterPanelOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-4 space-y-3">
              {/* Source */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">Source</label>
                <select
                  value={filterSource}
                  onChange={e => setFilterSource(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="all">All sources</option>
                  <option value="applied">Applied</option>
                  <option value="sourced">Sourced</option>
                  <option value="referral">Referral</option>
                  <option value="manual">Added</option>
                  <option value="imported">Imported</option>
                </select>
              </div>

              {/* Stage */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">Stage</label>
                <select
                  value={filterStage}
                  onChange={e => setFilterStage(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="all">All stages</option>
                  {job.pipeline_stages.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Score */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">Score</label>
                <select
                  value={filterScore}
                  onChange={e => setFilterScore(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="all">All scores</option>
                  <option value="scored">Scored</option>
                  <option value="unscored">Not scored</option>
                </select>
              </div>

              {/* AI Signal */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">AI Signal</label>
                <select
                  value={filterSignal}
                  onChange={e => setFilterSignal(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="all">All signals</option>
                  <option value="strong_yes">Strong Yes</option>
                  <option value="yes">Yes</option>
                  <option value="maybe">Maybe</option>
                  <option value="no">No</option>
                </select>
              </div>

              {/* Suggested Action */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide">Suggested Action</label>
                <select
                  value={filterAction}
                  onChange={e => setFilterAction(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  <option value="all">All actions</option>
                  <option value="score_needed">Score needed</option>
                  <option value="advance">Move forward</option>
                  <option value="reject">Reject</option>
                </select>
              </div>

              {/* Clear all filters */}
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setFilterSource('all'); setFilterStage('all'); setFilterScore('all')
                    setFilterSignal('all'); setFilterAction('all')
                    setFilterPanelOpen(false)
                  }}
                  className="w-full text-xs text-violet-600 hover:text-violet-800 font-medium py-1.5 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Selected-apps chip — explicit deselect all */}
        {selectedApps.size > 0 && (
          <button
            onClick={() => setSelectedApps(new Set())}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors font-medium"
          >
            {selectedApps.size} selected
            <X className="h-3 w-3" />
          </button>
        )}

        {(filterSearch || activeFilterCount > 0) && (
          <button
            onClick={() => {
              setFilterSearch(''); setFilterSource('all'); setFilterStage('all')
              setFilterScore('all'); setFilterSignal('all'); setFilterAction('all')
            }}
            className="text-xs text-violet-600 hover:text-violet-800 underline underline-offset-2 font-medium"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Ranked view */}
      {viewMode === 'ranked' && (
        <RankedView
          apps={filteredApps}
          stages={job.pipeline_stages}
          onCardClick={setSelectedApp}
          onMoveToStage={handleStageChange}
          selectedApps={selectedApps}
          onToggleSelect={toggleSelect}
          onBulkSelect={ids => setSelectedApps(new Set(ids))}
          isMultiStageSelection={isMultiStageSelection}
          onScoreApp={app => startScoring(undefined, app.id)}
          onScheduleApp={app => setScheduleModalApps([app])}
          onRejectApp={async appId => {
            const appData = (job?.applications ?? []).find(a => a.id === appId)
            await fetch(`/api/applications/${appId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'rejected' }),
            })
            if (appData && appData.ai_score !== null && appData.ai_score !== undefined) {
              void fetch(`/api/applications/${appId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ note: buildAiAnalysisNote(appData), created_by: '🤖 AI Analysis' }),
              })
            }
            load()
          }}
        />
      )}

      {/* Kanban */}
      {viewMode === 'kanban' && (
      <div className="flex flex-col flex-1 min-w-0">

      {/* ── Single horizontal scroll — Active + Rejected share same container ── */}
      <div className="flex flex-row flex-1 items-stretch min-h-0">
      <div className="flex flex-col flex-1 overflow-x-auto">

      {/* ── Active candidates ──────────────────────────────────────────── */}
      <div
        ref={activeAreaRef}
        style={splitHeight !== null ? { height: splitHeight, flexShrink: 0 } : { minHeight: '55vh', flexShrink: 0 }}
        className={`flex items-stretch shrink-0 divide-x transition-colors ${
          editMode ? 'divide-violet-100 bg-violet-50/20' : 'divide-slate-300 bg-transparent'
        }`}
      >
        {/* Status column — sticky, not tied to stages */}
        <div
          className="sticky left-0 z-10 shrink-0 flex flex-col border-t-4 border-slate-200 bg-white px-3 py-5 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.08)] relative"
          style={{ width: statusColWidth }}
        >
          <div className="rounded-xl bg-violet-50 border-2 border-violet-300 px-2.5 py-2.5 flex items-center gap-1.5 mb-1 min-w-0">
            <div className="h-2 w-2 rounded-full bg-violet-500 shrink-0" />
            <span className="text-xs font-bold text-violet-700 flex-1 min-w-0 truncate">Active</span>
            <span className="text-xs font-bold text-violet-600 bg-white rounded-full px-1.5 border border-violet-200 shrink-0">{activeApps.length}</span>
          </div>
          <p className="text-[10px] text-slate-400 px-0.5 mt-1 leading-tight truncate">Status from HM intake form</p>
          {/* Resize handle — right edge */}
          <div
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-violet-300 active:bg-violet-400 transition-colors z-20"
            onMouseDown={handleStatusColMouseDown}
            title="Drag to resize"
          />
        </div>

        {job.pipeline_stages.map((stage, stageIndex) => {
          const stColStyle = STAGE_STYLES[stage.color] ?? STAGE_STYLES.slate
          return (
          <div
            key={stage.id}
            className={`flex-1 min-w-[180px] max-w-[320px] px-3 pt-[18px] pb-5 transition-colors ${stColStyle.barTop} ${
              editMode ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
            draggable={editMode}
            onDragStart={e => {
              if (!editMode) return
              dragStageId.current = stage.id
              e.dataTransfer.effectAllowed = 'move'
              e.stopPropagation()
            }}
            onDragEnd={() => { dragStageId.current = null }}
            onDragOver={e => { if (editMode) e.preventDefault() }}
            onDrop={e => {
              if (editMode && dragStageId.current) {
                e.stopPropagation()
                handleStageReorder(stage.id)
              }
            }}
          >
            <StageColumn
              stage={stage}
              apps={filteredGrouped[stage.id] ?? []}
              editMode={editMode}
              showDragHandle={editMode}
              isMenuOpen={openStageMenu === stage.id}
              onMenuOpen={() => setOpenStageMenu(stage.id)}
              onMenuClose={() => setOpenStageMenu(null)}
              onScoreStage={() => startScoring(stage.id)}
              onMoveAllNext={async () => {
                const nextStage = job.pipeline_stages[stageIndex + 1]
                if (!nextStage) return
                const stageApps = grouped[stage.id] ?? []
                const selected  = stageApps.filter(a => selectedApps.has(a.id))
                const toMove    = selected.length > 0 ? selected : stageApps
                await Promise.all(toMove.map(app =>
                  fetch(`/api/applications/${app.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ stage_id: nextStage.id }),
                  })
                ))
                load()
              }}
              onRejectAll={async () => {
                const stageApps = grouped[stage.id] ?? []
                const selected  = stageApps.filter(a => selectedApps.has(a.id))
                const toReject  = selected.length > 0 ? selected : stageApps
                await Promise.all(toReject.map(app =>
                  fetch(`/api/applications/${app.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'rejected' }),
                  })
                ))
                // Fire-and-forget: save AI analysis notes for scored apps
                toReject.forEach(app => {
                  if (app.ai_score !== null && app.ai_score !== undefined) {
                    void fetch(`/api/applications/${app.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ note: buildAiAnalysisNote(app), created_by: '🤖 AI Analysis' }),
                    })
                  }
                })
                setSelectedApps(prev => {
                  const next = new Set(prev)
                  toReject.forEach(a => next.delete(a.id))
                  return next
                })
                load()
              }}
              onDragStart={id => { if (!editMode) dragId.current = id }}
              onDrop={handleDrop}
              onCardClick={setSelectedApp}
              onRename={handleRename}
              onRecolor={handleRecolor}
              onDelete={handleDeleteStage}
              selectedApps={selectedApps}
              onToggleSelect={toggleSelect}
              onScheduleInterview={() => {
                const stageApps = grouped[stage.id] ?? []
                const selected = stageApps.filter(a => selectedApps.has(a.id))
                setScheduleModalApps(selected.length > 0 ? selected : stageApps)
              }}
              selectedInStage={(grouped[stage.id] ?? []).filter(a => selectedApps.has(a.id)).length}
              onSelectAllInStage={(ids, select) => {
                setSelectedApps(prev => {
                  const next = new Set(prev)
                  ids.forEach(id => select ? next.add(id) : next.delete(id))
                  return next
                })
              }}
              cardFields={cardFields}
              nextStage={job.pipeline_stages[stageIndex + 1] ?? null}
              isLastStage={stageIndex === job.pipeline_stages.length - 1}
              onScoreApp={app => startScoring(undefined, app.id)}
              onRejectApp={async app => {
                setJob(prev => prev ? {
                  ...prev,
                  applications: prev.applications.map(a =>
                    a.id === app.id ? { ...a, status: 'rejected' as Application['status'] } : a
                  ),
                } : prev)
                await fetch(`/api/applications/${app.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'rejected' }),
                })
                // Auto-save AI analysis as a timeline comment if the app was scored
                if (app.ai_score !== null && app.ai_score !== undefined) {
                  void fetch(`/api/applications/${app.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note: buildAiAnalysisNote(app), created_by: '🤖 AI Analysis' }),
                  })
                }
              }}
              onMoveApp={async (app, stageId) => {
                setJob(prev => prev ? {
                  ...prev,
                  applications: prev.applications.map(a =>
                    a.id === app.id ? { ...a, stage_id: stageId } : a
                  ),
                } : prev)
                await fetch(`/api/applications/${app.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ stage_id: stageId }),
                })
              }}
            />
          </div>
        )})}

        {/* Add-stage panel — always visible in edit mode */}
        {editMode && (
          <div className="flex-1 min-w-[160px] max-w-[220px] px-3 flex flex-col">
            <div className="rounded-2xl border-2 border-dashed border-violet-200 bg-white p-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-violet-500">New stage</p>
              <input
                autoFocus
                value={newStageName}
                onChange={e => setNewStageName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddStage() }}
                placeholder="Stage name…"
                className="w-full rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
              <button
                onClick={handleAddStage}
                disabled={addingStage || !newStageName.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500 transition-colors disabled:opacity-50"
              >
                {addingStage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add Stage
              </button>
            </div>
          </div>
        )}

        {/* Unstaged bucket */}
        {unstaged.length > 0 && (
          <div className="flex-1 min-w-[180px] max-w-[260px] px-3">
            <div className="flex items-center justify-between rounded-xl px-4 py-3 bg-slate-50 border border-slate-100">
              <span className="text-sm font-semibold text-slate-400 italic">Unstaged</span>
              <span className="text-xs font-semibold text-slate-400 bg-white rounded-full px-2 py-0.5 border border-slate-200">
                {unstaged.length}
              </span>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {unstaged.map(app => (
                <CandidateCard
                  key={app.id}
                  app={app}
                  onDragStart={i => { dragId.current = i }}
                  onClick={setSelectedApp}
                  isSelected={selectedApps.has(app.id)}
                  onToggleSelect={toggleSelect}
                  cardFields={cardFields}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {/* ── end active candidates ── */}

      {/* Draggable fill-line divider — same visual language as column bar borders */}
      <div
        className="shrink-0 h-[4px] bg-slate-300 hover:bg-violet-400 cursor-row-resize transition-colors select-none"
        onMouseDown={handleSplitMouseDown}
        title="Drag to resize"
      />

      {/* ── Rejected candidates ────────────────────────────────────────── */}
      <div className="flex items-stretch divide-x divide-slate-300 min-h-[160px] bg-red-50/10 flex-1 overflow-y-auto">
        {/* Status column — sticky, mirrors active section */}
        <div
          className="sticky left-0 z-10 shrink-0 flex flex-col border-b-4 border-slate-200 bg-white px-3 py-5 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.08)] relative"
          style={{ width: statusColWidth }}
        >
          <div className="rounded-xl bg-red-50 border-2 border-red-300 px-2.5 py-2.5 flex items-center gap-1.5 min-w-0">
            <div className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-xs font-bold text-red-700 flex-1 min-w-0 truncate">Rejected</span>
            <span className="text-xs font-bold text-red-600 bg-white rounded-full px-1.5 border border-red-200 shrink-0">{totalRejected}</span>
          </div>
          {/* Resize handle — right edge */}
          <div
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-red-300 active:bg-red-400 transition-colors z-20"
            onMouseDown={handleStatusColMouseDown}
            title="Drag to resize"
          />
        </div>

        {job.pipeline_stages.map(stage => {
          const rejApps = rejectedGrouped[stage.id] ?? []
          const stColStyle = STAGE_STYLES[stage.color] ?? STAGE_STYLES.slate
          return (
            <div key={stage.id} className={`flex-1 min-w-[180px] max-w-[320px] px-3 py-4 ${stColStyle.barBottom}`}>
              {/* No column header — already shown in active section above */}
              <div className="flex flex-col gap-2">
                {rejApps.map(app => (
                  <CandidateCard
                    key={app.id}
                    app={app}
                    onDragStart={id => { dragId.current = id }}
                    onClick={setSelectedApp}
                    isSelected={false}
                    onToggleSelect={() => {}}
                    cardFields={cardFields}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {/* ── end rejected candidates ── */}

      </div>{/* end shared scroll container (flex flex-col flex-1 overflow-x-auto) */}

      {/* Edit Pipeline toggle — outside scroll, spans full height of Active + Rejected */}
      <div className={`shrink-0 flex flex-col gap-1.5 items-stretch px-3 pt-5 border-t-4 ${
        editMode ? 'border-violet-200 bg-violet-50/20' : 'border-slate-200 bg-transparent'
      }`}>
        <button
          onClick={() => setEditMode(e => !e)}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${
            editMode
              ? 'border-violet-300 bg-violet-600 text-white hover:bg-violet-500 shadow-sm'
              : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 bg-white'
          }`}
        >
          {editMode
            ? <><Check className="h-3.5 w-3.5" /> Done</>
            : <><Pencil className="h-3.5 w-3.5" /> Edit</>
          }
        </button>
        {editMode && (
          <button
            onClick={() => { setEditMode(false); setNewStageName(''); load() }}
            className="flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <X className="h-3 w-3" /> Discard
          </button>
        )}
      </div>

      </div>{/* end outer flex-row wrapper (flex flex-row flex-1 items-stretch min-h-0) */}

      </div>
      )} {/* end viewMode === 'kanban' */}

      {/* Modals & overlays */}
      {showAdd && (
        <AddCandidateModal
          jobId={id}
          stages={job.pipeline_stages}
          onClose={() => setShowAdd(false)}
          onAdded={async () => {
            setShowAdd(false)
            await load()
          }}
        />
      )}

      {selectedApp && (
        <CandidateSlideOver
          app={selectedApp}
          stages={job.pipeline_stages}
          scoringCriteria={job.scoring_criteria}
          onClose={() => setSelectedApp(null)}
          onStageChange={handleStageChange}
          onStatusChange={handleStatusChange}
          onCriteriaUpdated={c => setJob(j => j ? { ...j, scoring_criteria: c } : j)}
          onAppUpdated={updates => setSelectedApp(a => a ? { ...a, ...updates } : a)}
        />
      )}

      {showAutopilot && (
        <AutopilotDrawer
          job={job}
          stages={job.pipeline_stages}
          onClose={() => setShowAutopilot(false)}
          onSaved={load}
        />
      )}

      {/* Schedule Interview Modal */}
      {scheduleModalApps && scheduleModalApps.length > 0 && (
        <ScheduleInterviewModal
          apps={scheduleModalApps}
          job={job}
          onClose={() => setScheduleModalApps(null)}
          onScheduled={load}
        />
      )}
    </div>
  )
}
