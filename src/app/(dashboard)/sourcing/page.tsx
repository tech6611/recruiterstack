'use client'

/**
 * Phase 9: Sourcing — Track A (CSV Import) + Track B (Paste Profile)
 *
 * /sourcing
 * Tab 1 — Import CSV: drop/paste any CSV → AI maps columns → preview table → bulk import
 * Tab 2 — Paste Profile: paste LinkedIn/resume text → AI extracts → save as candidate
 */

import { useState, useRef, useCallback } from 'react'
import {
  Upload, FileText, Users, CheckCircle, AlertCircle,
  Loader2, X, ChevronRight, Search,
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

// ── DropZone ──────────────────────────────────────────────────────────────────

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

// ── Skill badge ───────────────────────────────────────────────────────────────

function SkillBadge({ skill }: { skill: string }) {
  return (
    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full whitespace-nowrap">
      {skill}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SourcingPage() {
  const [tab, setTab] = useState<'csv' | 'profile'>('csv')

  // ── CSV state ──────────────────────────────────────────────────────────────
  const [csvText,    setCsvText]    = useState('')
  const [fileName,   setFileName]   = useState('')
  const [showPaste,  setShowPaste]  = useState(false)
  const [parsed,     setParsed]     = useState<ParsedCandidate[]>([])
  const [selected,   setSelected]   = useState<Set<number>>(new Set())
  const [parsing,    setParsing]    = useState(false)
  const [importing,  setImporting]  = useState(false)
  const [importRes,  setImportRes]  = useState<ImportResult | null>(null)
  const [csvError,   setCsvError]   = useState('')

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

  const toggleRow    = (i: number) => setSelected(prev => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })
  const toggleAll    = () => setSelected(prev =>
    prev.size === parsed.length ? new Set() : new Set(parsed.map((_, i) => i))
  )

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
          name:             extracted.name    ?? 'Unknown',
          email:            extracted.email   ?? null,
          phone:            extracted.phone   ?? null,
          current_title:    extracted.current_title  ?? null,
          location:         extracted.location       ?? null,
          experience_years: extracted.experience_years ?? 0,
          skills:           extracted.skills ?? [],
          linkedin_url:     extracted.linkedin_url   ?? null,
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Sourcing</h1>
        <p className="text-sm text-slate-500 mt-1">
          Import candidates from any CSV export, or paste a LinkedIn profile to add them instantly.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-8">
        {(['csv', 'profile'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'csv' ? '📄 Import CSV' : '📋 Paste Profile'}
          </button>
        ))}
      </div>

      {/* ══ CSV TAB ════════════════════════════════════════════════════════════ */}
      {tab === 'csv' && (
        <div className="space-y-5">

          {/* Success state */}
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
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {/* Table header bar */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-800">
                    {parsed.length} candidate{parsed.length !== 1 ? 's' : ''} found
                  </span>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {selected.size} selected
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setParsed([]); setCsvText(''); setFileName('') }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ← Start over
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing || selected.size === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {importing
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Users className="w-4 h-4" />}
                    Import {selected.size} candidate{selected.size !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="pl-5 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selected.size === parsed.length && parsed.length > 0}
                          onChange={toggleAll}
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
                    {parsed.map((c, i) => {
                      const isSelected = selected.has(i)
                      return (
                        <tr
                          key={i}
                          onClick={() => toggleRow(i)}
                          className={`cursor-pointer transition-colors hover:bg-blue-50 ${
                            isSelected ? 'bg-white' : 'bg-slate-50/60 opacity-50'
                          }`}
                        >
                          <td className="pl-5 py-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRow(i)}
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
          )}

          {/* Upload / paste state */}
          {!importRes && parsed.length === 0 && (
            <>
              {/* File loaded indicator */}
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

              {/* Drop zone (shown when no file loaded and not pasting) */}
              {!fileName && !showPaste && (
                <DropZone onFile={handleFile} />
              )}

              {/* Paste CSV textarea */}
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

              {/* Actions row */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleParse}
                  disabled={!csvText.trim() || parsing}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {parsing
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Search className="w-4 h-4" />}
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

      {/* ══ PROFILE TAB ════════════════════════════════════════════════════════ */}
      {tab === 'profile' && (
        <div className="space-y-5">

          {/* Success */}
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

          {/* Extracted candidate card */}
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

          {/* Input state */}
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
    </div>
  )
}
