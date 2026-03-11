'use client'

/**
 * Phase 9: Sourcing
 * Tab A — Import CSV: drop/paste any CSV → AI maps columns → preview → bulk import
 * Tab B — Upload CVs: multi-PDF upload → Claude parses each → preview → bulk import
 * Tab C — Paste Profile: paste LinkedIn/resume text → AI extracts → save as candidate
 * Below tabs: Source Connectors (LinkedIn, Naukri, Indeed with export guides; SeekOut/JuiceBox Coming Soon)
 */

import { useState, useRef, useCallback } from 'react'
import {
  Upload, FileText, Users, CheckCircle, AlertCircle,
  Loader2, X, ChevronRight, Search, FileUp, ChevronDown, Lock,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type ParsedCandidate = {
  name?:             string
  email?:            string
  phone?:            string
  current_title?:    string
  location?:         string
  experience_years?: number
  skills?:           string[]
  linkedin_url?:     string
}

type ImportResult = {
  created: number
  skipped: number
  errors:  string[]
}

type CvFileResult = {
  file:       File
  status:     'idle' | 'parsing' | 'done' | 'error'
  candidate?: ParsedCandidate
  error?:     string
}

type Connector = {
  id:          string
  name:        string
  emoji:       string
  badge?:      string
  badgeColor?: 'green' | 'blue' | 'orange'
  steps?:      string[]
  comingSoon?: boolean
}

// ── Static connector data ─────────────────────────────────────────────────────

const CONNECTORS: Connector[] = [
  {
    id:         'linkedin-connections',
    name:       'LinkedIn Connections',
    emoji:      '💼',
    badge:      'Free export',
    badgeColor: 'green',
    steps: [
      'Go to linkedin.com → click your profile photo → Settings & Privacy',
      'Under "Data privacy" → click "Get a copy of your data"',
      'Select "Connections" → click "Request archive"',
      'Download the CSV from the email LinkedIn sends you',
      'Import the CSV using the Import CSV tab above',
    ],
  },
  {
    id:         'linkedin-recruiter',
    name:       'LinkedIn Recruiter',
    emoji:      '🔍',
    badge:      'Recruiter license',
    badgeColor: 'blue',
    steps: [
      'Open a search or project in LinkedIn Recruiter',
      'Select the candidates you want to export',
      'Click Export → Export to Spreadsheet',
      'Import the downloaded CSV using the Import CSV tab above',
    ],
  },
  {
    id:         'naukri',
    name:       'Naukri',
    emoji:      '🇮🇳',
    badge:      'Export guide',
    badgeColor: 'orange',
    steps: [
      'Log in to recruiter.naukri.com',
      'Go to Database → run your candidate search',
      'Shortlist candidates → click Download → select CSV format',
      'Import the CSV file using the Import CSV tab above',
    ],
  },
  {
    id:         'indeed',
    name:       'Indeed',
    emoji:      '🔎',
    badge:      'Export guide',
    badgeColor: 'blue',
    steps: [
      'Go to employers.indeed.com → Candidates',
      'Filter candidates by role or status',
      'Click the Export button in the top right',
      'Import the downloaded CSV using the Import CSV tab above',
    ],
  },
  { id: 'seekout',  name: 'SeekOut',  emoji: '🎯', comingSoon: true },
  { id: 'juicebox', name: 'JuiceBox', emoji: '🧃', comingSoon: true },
]

// ── DropZone (CSV) ─────────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (text: string, name: string) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const readFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => onFile(e.target?.result as string ?? '', file.name)
    reader.readAsText(file)
  }

  return (
    <div
      onDragOver={e  => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) readFile(file)
      }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors select-none ${
        dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.tsv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f) }}
      />
      <Upload className={`w-9 h-9 mx-auto mb-3 transition-colors ${dragging ? 'text-blue-400' : 'text-slate-300'}`} />
      <p className="text-sm font-semibold text-slate-600">Drop your CSV here, or click to browse</p>
      <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto">
        Works with LinkedIn exports, Indeed downloads, Greenhouse/Lever exports, or any spreadsheet saved as CSV
      </p>
    </div>
  )
}

// ── PdfDropZone ────────────────────────────────────────────────────────────────

function PdfDropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileList = (list: FileList) => {
    const pdfs = Array.from(list).filter(f => f.type === 'application/pdf').slice(0, 20)
    if (pdfs.length > 0) onFiles(pdfs)
  }

  return (
    <div
      onDragOver={e  => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        handleFileList(e.dataTransfer.files)
      }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors select-none ${
        dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files) handleFileList(e.target.files) }}
      />
      <FileUp className={`w-9 h-9 mx-auto mb-3 transition-colors ${dragging ? 'text-blue-400' : 'text-slate-300'}`} />
      <p className="text-sm font-semibold text-slate-600">Drop PDF CVs here, or click to browse</p>
      <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto">
        Upload multiple PDFs at once — up to 20 files, 10 MB each
      </p>
    </div>
  )
}

// ── SkillBadge ─────────────────────────────────────────────────────────────────

function SkillBadge({ skill }: { skill: string }) {
  return (
    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full whitespace-nowrap">
      {skill}
    </span>
  )
}

// ── ConnectorCard ──────────────────────────────────────────────────────────────

function ConnectorCard({
  connector,
  isOpen,
  onToggle,
  onUseCSV,
}: {
  connector: Connector
  isOpen:    boolean
  onToggle:  () => void
  onUseCSV:  () => void
}) {
  if (connector.comingSoon) {
    return (
      <div className="border border-slate-200 rounded-2xl p-5 opacity-50 cursor-not-allowed select-none">
        <div className="flex items-start justify-between mb-3">
          <span className="text-2xl">{connector.emoji}</span>
          <Lock className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
        </div>
        <p className="text-sm font-semibold text-slate-700 mb-2">{connector.name}</p>
        <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full">Coming Soon</span>
      </div>
    )
  }

  const badgeClass =
    connector.badgeColor === 'green'  ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
    connector.badgeColor === 'orange' ? 'bg-orange-50 text-orange-700 border-orange-100'   :
                                        'bg-blue-50 text-blue-700 border-blue-100'

  return (
    <div className={`border rounded-2xl transition-all ${
      isOpen ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-white hover:border-slate-300'
    }`}>
      <button onClick={onToggle} className="w-full text-left p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <span className="text-2xl block mb-2">{connector.emoji}</span>
            <p className="text-sm font-semibold text-slate-800 mb-1.5">{connector.name}</p>
            {connector.badge && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeClass}`}>
                {connector.badge}
              </span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 ml-2 mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && connector.steps && (
        <div className="px-5 pb-5 space-y-4">
          <ol className="space-y-2.5">
            {connector.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-600">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <button
            onClick={onUseCSV}
            className="flex items-center gap-1.5 text-sm text-blue-600 font-semibold hover:text-blue-700 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Use the Import CSV tab →
          </button>
        </div>
      )}
    </div>
  )
}

// ── Candidate preview table (shared between CSV + CV tabs) ────────────────────

function CandidateTable({
  rows,
  selectedIndices,
  onToggleRow,
  onToggleAll,
  allSelected,
  actionLabel,
  actionDisabled,
  onAction,
  actionLoading,
  onStartOver,
  startOverLabel,
}: {
  rows:           { idx: number; candidate: ParsedCandidate }[]
  selectedIndices: Set<number>
  onToggleRow:    (i: number) => void
  onToggleAll:    () => void
  allSelected:    boolean
  actionLabel:    string
  actionDisabled: boolean
  onAction:       () => void
  actionLoading:  boolean
  onStartOver:    () => void
  startOverLabel: string
}) {
  const selectedCount = rows.filter(r => selectedIndices.has(r.idx)).length

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">
            {rows.length} candidate{rows.length !== 1 ? 's' : ''} parsed
          </span>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            {selectedCount} selected
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onStartOver} className="text-xs text-slate-400 hover:text-slate-600">
            {startOverLabel}
          </button>
          <button
            onClick={onAction}
            disabled={actionDisabled}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {actionLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Users className="w-4 h-4" />}
            {actionLabel}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="pl-5 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="rounded accent-blue-600"
                />
              </th>
              {['Name', 'Email', 'Title', 'Location', 'Exp', 'Skills'].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map(({ idx, candidate: c }) => {
              const isSelected = selectedIndices.has(idx)
              return (
                <tr
                  key={idx}
                  onClick={() => onToggleRow(idx)}
                  className={`cursor-pointer transition-colors hover:bg-blue-50 ${
                    isSelected ? 'bg-white' : 'bg-slate-50/60 opacity-50'
                  }`}
                >
                  <td className="pl-5 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleRow(idx)}
                      onClick={e => e.stopPropagation()}
                      className="rounded accent-blue-600"
                    />
                  </td>
                  <td className="px-3 py-3 font-medium text-slate-800 whitespace-nowrap">
                    {c.name ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                    {c.email ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-600 max-w-[180px] truncate">
                    {c.current_title ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                    {c.location ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                    {c.experience_years != null
                      ? `${c.experience_years}y`
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {(c.skills ?? []).slice(0, 3).map(s => (
                        <SkillBadge key={s} skill={s} />
                      ))}
                      {(c.skills?.length ?? 0) > 3 && (
                        <span className="text-xs text-slate-400">
                          +{(c.skills?.length ?? 0) - 3}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SourcingPage() {
  const [tab, setTab] = useState<'csv' | 'cvs' | 'profile'>('csv')
  const [openConnector, setOpenConnector] = useState<string | null>(null)

  // ── CSV state ──────────────────────────────────────────────────────────────
  const [csvText,   setCsvText]   = useState('')
  const [fileName,  setFileName]  = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [parsed,    setParsed]    = useState<ParsedCandidate[]>([])
  const [selected,  setSelected]  = useState<Set<number>>(new Set())
  const [parsing,   setParsing]   = useState(false)
  const [importing, setImporting] = useState(false)
  const [importRes, setImportRes] = useState<ImportResult | null>(null)
  const [csvError,  setCsvError]  = useState('')

  // ── CV state ───────────────────────────────────────────────────────────────
  const [cvFiles,     setCvFiles]     = useState<CvFileResult[]>([])
  const [cvParsing,   setCvParsing]   = useState(false)
  const [cvSelected,  setCvSelected]  = useState<Set<number>>(new Set())
  const [cvImporting, setCvImporting] = useState(false)
  const [cvImportRes, setCvImportRes] = useState<ImportResult | null>(null)
  const [cvImportErr, setCvImportErr] = useState('')

  // ── Profile state ──────────────────────────────────────────────────────────
  const [profileText, setProfileText] = useState('')
  const [extracted,   setExtracted]   = useState<ParsedCandidate | null>(null)
  const [extracting,  setExtracting]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [savedName,   setSavedName]   = useState<string | null>(null)
  const [profileErr,  setProfileErr]  = useState('')

  // ── CSV handlers ───────────────────────────────────────────────────────────

  const handleFile = useCallback((text: string, name: string) => {
    setCsvText(text)
    setFileName(name)
    setShowPaste(false)
    setParsed([])
    setImportRes(null)
    setCsvError('')
  }, [])

  const handleParse = async () => {
    if (!csvText.trim()) return
    setParsing(true)
    setCsvError('')
    setParsed([])
    setImportRes(null)
    try {
      const res  = await fetch('/api/sourcing/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ csv_text: csvText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setParsed(data.candidates)
      setSelected(new Set(data.candidates.map((_: unknown, i: number) => i)))
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : 'Parsing failed')
    } finally {
      setParsing(false)
    }
  }

  const handleImport = async () => {
    const toImport = parsed.filter((_, i) => selected.has(i))
    if (!toImport.length) return
    setImporting(true)
    try {
      const res  = await fetch('/api/sourcing/confirm', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ candidates: toImport }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setImportRes(data)
      setParsed([])
      setCsvText('')
      setFileName('')
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const toggleRow = (i: number) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(i)) { next.delete(i) } else { next.add(i) }
    return next
  })
  const toggleAll = () => setSelected(prev =>
    prev.size === parsed.length ? new Set() : new Set(parsed.map((_, i) => i))
  )

  // ── CV handlers ────────────────────────────────────────────────────────────

  const handleCvFiles = useCallback((files: File[]) => {
    setCvFiles(files.map(f => ({ file: f, status: 'idle' as const })))
    setCvSelected(new Set())
    setCvImportRes(null)
    setCvImportErr('')
  }, [])

  const handleCvParse = async () => {
    if (!cvFiles.length) return
    setCvParsing(true)
    const results: CvFileResult[] = cvFiles.map(r => ({ ...r }))

    for (let i = 0; i < results.length; i++) {
      results[i] = { ...results[i], status: 'parsing' }
      setCvFiles([...results])

      const fd = new FormData()
      fd.append('file', results[i].file)
      try {
        const res  = await fetch('/api/sourcing/parse-cv', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed')
        results[i] = { ...results[i], status: 'done', candidate: data.candidate }
      } catch (e) {
        results[i] = { ...results[i], status: 'error', error: e instanceof Error ? e.message : 'Failed' }
      }
      setCvFiles([...results])
    }

    // Auto-select all successful results
    const doneIndices = results
      .map((r, i) => (r.status === 'done' ? i : -1))
      .filter(i => i >= 0)
    setCvSelected(new Set(doneIndices))
    setCvParsing(false)
  }

  const handleCvImport = async () => {
    const toImport = cvFiles
      .filter((r, i) => r.status === 'done' && cvSelected.has(i))
      .map(r => r.candidate!)
    if (!toImport.length) return
    setCvImporting(true)
    setCvImportErr('')
    try {
      const res  = await fetch('/api/sourcing/confirm', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ candidates: toImport }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCvImportRes(data)
      setCvFiles([])
      setCvSelected(new Set())
    } catch (e) {
      setCvImportErr(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setCvImporting(false)
    }
  }

  const toggleCvRow = (idx: number) => setCvSelected(prev => {
    const next = new Set(prev)
    if (next.has(idx)) { next.delete(idx) } else { next.add(idx) }
    return next
  })

  const cvDoneFiles  = cvFiles.map((r, i) => ({ idx: i, candidate: r.candidate! })).filter((_, i) => cvFiles[i].status === 'done')
  const cvParseDone  = !cvParsing && cvFiles.length > 0 && cvFiles.every(f => f.status !== 'idle' && f.status !== 'parsing')
  const cvAllSelected = cvDoneFiles.length > 0 && cvDoneFiles.every(r => cvSelected.has(r.idx))

  const toggleCvAll = () => {
    if (cvAllSelected) {
      setCvSelected(new Set())
    } else {
      setCvSelected(new Set(cvDoneFiles.map(r => r.idx)))
    }
  }

  // ── Profile handlers ───────────────────────────────────────────────────────

  const handleExtract = async () => {
    if (!profileText.trim()) return
    setExtracting(true)
    setProfileErr('')
    setExtracted(null)
    setSavedName(null)
    try {
      const res  = await fetch('/api/sourcing/parse-profile', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: profileText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setExtracted(data.candidate)
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const handleSave = async () => {
    if (!extracted) return
    setSaving(true)
    setProfileErr('')
    try {
      const res  = await fetch('/api/candidates', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:             extracted.name             ?? 'Unknown',
          email:            extracted.email            ?? null,
          phone:            extracted.phone            ?? null,
          current_title:    extracted.current_title    ?? null,
          location:         extracted.location         ?? null,
          experience_years: extracted.experience_years ?? 0,
          skills:           extracted.skills           ?? [],
          linkedin_url:     extracted.linkedin_url     ?? null,
          status:           'active',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSavedName(extracted.name ?? 'Candidate')
      setExtracted(null)
      setProfileText('')
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Connector helpers ──────────────────────────────────────────────────────

  const toggleConnector = (id: string) => {
    setOpenConnector(prev => (prev === id ? null : id))
  }

  const handleUseCSV = useCallback(() => {
    setTab('csv')
    setOpenConnector(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // ── Derived values for CSV tab ─────────────────────────────────────────────

  const csvRows = parsed.map((candidate, idx) => ({ idx, candidate }))
  const csvAllSelected = selected.size === parsed.length && parsed.length > 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Sourcing</h1>
        <p className="text-sm text-slate-500 mt-1">
          Import candidates from any CSV, upload PDF CVs, or paste a LinkedIn profile to add them instantly.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(['csv', 'cvs', 'profile'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'csv' ? '📄 Import CSV' : t === 'cvs' ? '📎 Upload CVs' : '📋 Paste Profile'}
          </button>
        ))}
      </div>

      {/* ══ CSV TAB ════════════════════════════════════════════════════════════ */}
      {tab === 'csv' && (
        <div className="space-y-5">

          {/* Success */}
          {importRes && (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-lg font-bold text-slate-800">
                {importRes.created} candidate{importRes.created !== 1 ? 's' : ''} imported
              </p>
              {importRes.skipped > 0 && (
                <p className="text-sm text-slate-500 mt-1">
                  {importRes.skipped} skipped — email already exists
                </p>
              )}
              {importRes.errors.length > 0 && (
                <p className="text-xs text-red-500 mt-2">{importRes.errors[0]}</p>
              )}
              <button
                onClick={() => setImportRes(null)}
                className="mt-6 text-sm text-blue-600 hover:text-blue-700 font-semibold"
              >
                Import another file →
              </button>
            </div>
          )}

          {/* Preview table */}
          {!importRes && parsed.length > 0 && (
            <CandidateTable
              rows={csvRows}
              selectedIndices={selected}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              allSelected={csvAllSelected}
              actionLabel={`Import ${selected.size} candidate${selected.size !== 1 ? 's' : ''}`}
              actionDisabled={importing || selected.size === 0}
              onAction={handleImport}
              actionLoading={importing}
              onStartOver={() => { setParsed([]); setCsvText(''); setFileName('') }}
              startOverLabel="← Start over"
            />
          )}

          {/* Upload / paste state */}
          {!importRes && parsed.length === 0 && (
            <>
              {fileName && !showPaste && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <span className="text-sm text-blue-700 font-medium flex-1">{fileName}</span>
                  <button
                    onClick={() => { setCsvText(''); setFileName('') }}
                    className="text-blue-400 hover:text-blue-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {!fileName && !showPaste && <DropZone onFile={handleFile} />}

              {showPaste && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">Paste CSV data</p>
                    <button onClick={() => setShowPaste(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={csvText}
                    onChange={e => setCsvText(e.target.value)}
                    placeholder={`name,email,title,location,skills\nJohn Smith,john@example.com,Sr. Engineer,NYC,"React, Node, TypeScript"`}
                    rows={8}
                    className="w-full text-sm font-mono border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none text-slate-700 placeholder:text-slate-300"
                  />
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleParse}
                  disabled={!csvText.trim() || parsing}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {parsing ? 'Parsing with AI…' : 'Parse candidates'}
                </button>
                {!showPaste && !fileName && (
                  <button
                    onClick={() => setShowPaste(true)}
                    className="text-sm text-slate-500 hover:text-slate-700 underline underline-offset-2"
                  >
                    Or paste CSV text
                  </button>
                )}
              </div>

              {csvError && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {csvError}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ CVS TAB ════════════════════════════════════════════════════════════ */}
      {tab === 'cvs' && (
        <div className="space-y-5">

          {/* Success */}
          {cvImportRes && (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-lg font-bold text-slate-800">
                {cvImportRes.created} candidate{cvImportRes.created !== 1 ? 's' : ''} imported
              </p>
              {cvImportRes.skipped > 0 && (
                <p className="text-sm text-slate-500 mt-1">
                  {cvImportRes.skipped} skipped — email already exists
                </p>
              )}
              {cvImportRes.errors.length > 0 && (
                <p className="text-xs text-red-500 mt-2">{cvImportRes.errors[0]}</p>
              )}
              <button
                onClick={() => setCvImportRes(null)}
                className="mt-6 text-sm text-blue-600 hover:text-blue-700 font-semibold"
              >
                Upload more CVs →
              </button>
            </div>
          )}

          {!cvImportRes && (
            <>
              {/* Drop zone */}
              {cvFiles.length === 0 && <PdfDropZone onFiles={handleCvFiles} />}

              {/* File list with per-file statuses */}
              {cvFiles.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <span className="text-sm font-semibold text-slate-800">
                      {cvFiles.length} PDF{cvFiles.length !== 1 ? 's' : ''} selected
                    </span>
                    <button
                      onClick={() => { setCvFiles([]); setCvSelected(new Set()); setCvImportErr('') }}
                      className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Clear all
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-50">
                    {cvFiles.map((r, i) => (
                      <li key={i} className="flex items-center gap-3 px-5 py-3">
                        <FileText className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        <span className="text-sm text-slate-700 flex-1 truncate">{r.file.name}</span>
                        <span className="flex-shrink-0">
                          {r.status === 'idle' && (
                            <span className="text-xs text-slate-400">Ready</span>
                          )}
                          {r.status === 'parsing' && (
                            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                          )}
                          {r.status === 'done' && (
                            <span className="text-xs text-emerald-600 font-medium">
                              ✓ {r.candidate?.name ?? 'Parsed'}
                            </span>
                          )}
                          {r.status === 'error' && (
                            <span className="text-xs text-red-500">{r.error ?? 'Failed'}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Parse button */}
              {cvFiles.some(f => f.status === 'idle') && (
                <button
                  onClick={handleCvParse}
                  disabled={cvParsing}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {cvParsing
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <FileUp className="w-4 h-4" />}
                  {cvParsing
                    ? 'Parsing CVs with AI…'
                    : `Parse ${cvFiles.filter(f => f.status === 'idle').length} CV${cvFiles.filter(f => f.status === 'idle').length !== 1 ? 's' : ''} with AI`}
                </button>
              )}

              {/* Preview table after parsing */}
              {cvParseDone && cvDoneFiles.length > 0 && (
                <CandidateTable
                  rows={cvDoneFiles}
                  selectedIndices={cvSelected}
                  onToggleRow={toggleCvRow}
                  onToggleAll={toggleCvAll}
                  allSelected={cvAllSelected}
                  actionLabel={`Import ${cvFiles.filter((r, i) => r.status === 'done' && cvSelected.has(i)).length} candidate${cvFiles.filter((r, i) => r.status === 'done' && cvSelected.has(i)).length !== 1 ? 's' : ''}`}
                  actionDisabled={cvImporting || cvFiles.filter((r, i) => r.status === 'done' && cvSelected.has(i)).length === 0}
                  onAction={handleCvImport}
                  actionLoading={cvImporting}
                  onStartOver={() => { setCvFiles([]); setCvSelected(new Set()) }}
                  startOverLabel="← Upload different CVs"
                />
              )}

              {cvImportErr && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {cvImportErr}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ PROFILE TAB ════════════════════════════════════════════════════════ */}
      {tab === 'profile' && (
        <div className="space-y-5">

          {savedName && (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-lg font-bold text-slate-800">{savedName} added</p>
              <p className="text-sm text-slate-500 mt-1">Candidate saved to your pipeline</p>
              <button
                onClick={() => setSavedName(null)}
                className="mt-6 text-sm text-blue-600 hover:text-blue-700 font-semibold"
              >
                Add another →
              </button>
            </div>
          )}

          {!savedName && extracted && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Extracted candidate</p>
                  <p className="text-xl font-bold text-slate-900">{extracted.name ?? '—'}</p>
                  {extracted.current_title && (
                    <p className="text-sm text-slate-500 mt-0.5">{extracted.current_title}</p>
                  )}
                </div>
                <button onClick={() => setExtracted(null)} className="text-slate-400 hover:text-slate-600 p-1 -mr-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                {extracted.email && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-0.5">Email</p>
                    <p className="text-slate-700">{extracted.email}</p>
                  </div>
                )}
                {extracted.location && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-0.5">Location</p>
                    <p className="text-slate-700">{extracted.location}</p>
                  </div>
                )}
                {extracted.experience_years != null && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-0.5">Experience</p>
                    <p className="text-slate-700">{extracted.experience_years} years</p>
                  </div>
                )}
                {extracted.phone && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-0.5">Phone</p>
                    <p className="text-slate-700">{extracted.phone}</p>
                  </div>
                )}
                {extracted.linkedin_url && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-400 font-medium mb-0.5">LinkedIn</p>
                    <a
                      href={extracted.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs break-all"
                    >
                      {extracted.linkedin_url}
                    </a>
                  </div>
                )}
              </div>

              {(extracted.skills ?? []).length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(extracted.skills ?? []).map(s => (
                      <span key={s} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-100">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {profileErr && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {profileErr}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                  Save to candidates
                </button>
                <button
                  onClick={() => { setExtracted(null); setProfileErr('') }}
                  className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {!savedName && !extracted && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-0.5">Paste profile text</p>
                <p className="text-xs text-slate-400">
                  LinkedIn profile copy, resume snippet, email bio — anything with candidate details
                </p>
              </div>
              <textarea
                value={profileText}
                onChange={e => setProfileText(e.target.value)}
                placeholder={`John Smith\nSenior Software Engineer at Stripe\nSan Francisco Bay Area\n\nExperience: 8 years\nSkills: Python, Go, Kubernetes, PostgreSQL, AWS\n\nPreviously at: Uber, Lyft`}
                rows={11}
                className="w-full text-sm border border-slate-200 rounded-xl p-3.5 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none text-slate-700 placeholder:text-slate-300 leading-relaxed"
              />
              {profileErr && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {profileErr}
                </div>
              )}
              <button
                onClick={handleExtract}
                disabled={!profileText.trim() || extracting}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {extracting ? 'Extracting with AI…' : 'Extract candidate →'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ SOURCE CONNECTORS ══════════════════════════════════════════════════ */}
      <div>
        <div className="mb-5">
          <h2 className="text-base font-bold text-slate-800">Source Integrations</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Export candidates from major job boards and import them with one click.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {CONNECTORS.map(connector => (
            <ConnectorCard
              key={connector.id}
              connector={connector}
              isOpen={openConnector === connector.id}
              onToggle={() => toggleConnector(connector.id)}
              onUseCSV={handleUseCSV}
            />
          ))}
        </div>
      </div>

    </div>
  )
}
