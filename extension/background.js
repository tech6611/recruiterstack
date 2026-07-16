// Background service worker — the ONLY part of the extension that talks to the
// RecruiterStack API. It runs with host_permissions, so its fetches are exempt
// from the browser's cross-origin (CORS) block that would stop a content script.
//
// It reads the saved platform URL + API key from chrome.storage, attaches the
// key as a Bearer token, and answers three messages from the rest of the
// extension: getSequences, enroll, getStatus.

const DEFAULT_BASE_URL = 'https://recruiterstack.in'

async function getConfig() {
  const { apiBaseUrl, apiKey } = await chrome.storage.sync.get(['apiBaseUrl', 'apiKey'])
  return {
    apiBaseUrl: (apiBaseUrl || DEFAULT_BASE_URL).replace(/\/$/, ''),
    apiKey: apiKey || '',
  }
}

// Thin wrapper around fetch that adds the base URL + auth header and always
// resolves to a plain object (never throws) so callers can branch cleanly.
async function apiFetch(path, options = {}) {
  const { apiBaseUrl, apiKey } = await getConfig()
  if (!apiKey) {
    return { ok: false, notConnected: true, error: 'No API key set. Open the extension options to connect.' }
  }
  try {
    const res = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(options.headers || {}),
      },
    })
    let body = null
    try { body = await res.json() } catch { /* non-JSON / empty body */ }
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    return { ok: false, error: `Could not reach ${apiBaseUrl}. Is the platform URL correct?` }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  ;(async () => {
    try {
      if (msg.type === 'getSequences') {
        const r = await apiFetch('/api/ext/sequences')
        if (r.notConnected) return sendResponse({ ok: false, notConnected: true, error: r.error })
        if (!r.ok) return sendResponse({ ok: false, error: r.body?.error || `Request failed (${r.status || '?'})` })
        return sendResponse({ ok: true, sequences: r.body?.data || [] })
      }

      if (msg.type === 'enroll') {
        const r = await apiFetch('/api/ext/enroll', { method: 'POST', body: JSON.stringify(msg.payload) })
        if (r.notConnected) return sendResponse({ ok: false, notConnected: true, error: r.error })
        if (!r.ok) return sendResponse({ ok: false, error: r.body?.error || `Request failed (${r.status || '?'})` })
        return sendResponse({ ok: true, data: r.body?.data })
      }

      if (msg.type === 'getStatus') {
        const { apiKey, apiBaseUrl } = await getConfig()
        return sendResponse({ connected: !!apiKey, apiBaseUrl })
      }

      sendResponse({ ok: false, error: 'Unknown request' })
    } catch (err) {
      sendResponse({ ok: false, error: String((err && err.message) || err) })
    }
  })()
  // Returning true keeps the message channel open for the async sendResponse above.
  return true
})
