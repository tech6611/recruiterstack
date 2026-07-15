'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Copy, Check, Trash2, AlertTriangle } from 'lucide-react'
import { inputClsWhite, labelCls } from '@/lib/ui/styles'

type ApiKey = {
  id: string
  name: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export default function ApiKeysSettingsPage() {
  const { orgId } = useAuth()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // The freshly-minted raw key — shown once, then cleared.
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/settings/api-keys')
    if (res.ok) setKeys(((await res.json()).data) as ApiKey[])
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) refresh() }, [orgId, refresh])

  async function createKey() {
    if (!name.trim()) return
    setErr(null); setCreating(true); setNewKey(null); setCopied(false)
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const j = await res.json()
      if (!res.ok) { setErr(j.error ?? 'Failed to create key'); return }
      setNewKey(j.data.key as string)
      setName('')
      await refresh()
    } finally {
      setCreating(false)
    }
  }

  async function revokeKey(id: string) {
    setErr(null)
    const res = await fetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setErr(j.error ?? 'Failed to revoke key')
      return
    }
    await refresh()
  }

  async function copyKey() {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey)
    setCopied(true)
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="h-5 w-5 text-emerald-600" />
        <h1 className="text-xl font-semibold text-slate-800">API Keys</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Keys let external tools — like the LinkedIn browser extension — add candidates
        and enrol them into sequences on behalf of your workspace. Treat a key like a
        password.
      </p>

      {err && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Freshly-minted key — shown exactly once */}
      {newKey && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold mb-2">
            <AlertTriangle className="h-4 w-4" />
            Copy this key now — you won&apos;t be able to see it again
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-white border border-amber-200 px-3 py-2 text-xs text-slate-800 break-all">
              {newKey}
            </code>
            <button
              onClick={copyKey}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition"
            >
              {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-4">
        <label className={labelCls} htmlFor="key-name">Create a new key</label>
        <div className="flex items-center gap-2">
          <input
            id="key-name"
            className={inputClsWhite}
            placeholder="e.g. My LinkedIn extension"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createKey() }}
            maxLength={100}
          />
          <button
            onClick={createKey}
            disabled={creating || !name.trim()}
            className="whitespace-nowrap rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            {creating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Existing keys */}
      <h2 className="text-sm font-semibold text-slate-500 mb-3">Your keys</h2>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-slate-400">No keys yet. Generate one above to get started.</p>
      ) : (
        <ul className="space-y-2">
          {keys.map(k => (
            <li
              key={k.id}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 truncate">{k.name}</span>
                  {k.revoked_at && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                      Revoked
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  <code>{k.key_prefix}…</code>
                  {' · '}
                  {k.last_used_at
                    ? `last used ${new Date(k.last_used_at).toLocaleDateString()}`
                    : 'never used'}
                </div>
              </div>
              {!k.revoked_at && (
                <button
                  onClick={() => revokeKey(k.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
