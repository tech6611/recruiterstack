// Settings screen: load/save the platform URL + API key, and test the connection.

const baseUrlEl = document.getElementById('baseUrl')
const apiKeyEl = document.getElementById('apiKey')
const statusEl = document.getElementById('status')

function setStatus(text, ok) {
  statusEl.textContent = text
  statusEl.className = ok ? 'ok' : 'error'
}

// Prefill from saved values.
chrome.storage.sync.get(['apiBaseUrl', 'apiKey'], ({ apiBaseUrl, apiKey }) => {
  baseUrlEl.value = apiBaseUrl || 'https://recruiterstack.in'
  apiKeyEl.value = apiKey || ''
})

function save() {
  const apiBaseUrl = (baseUrlEl.value || '').trim().replace(/\/$/, '')
  const apiKey = (apiKeyEl.value || '').trim()
  return new Promise(resolve => {
    chrome.storage.sync.set({ apiBaseUrl, apiKey }, resolve)
  })
}

document.getElementById('save').addEventListener('click', async () => {
  await save()
  setStatus('Saved.', true)
})

// Test always saves the current field values first, then asks the background
// worker to hit the sequences endpoint with them.
document.getElementById('test').addEventListener('click', async () => {
  await save()
  setStatus('Testing…', true)
  chrome.runtime.sendMessage({ type: 'getSequences' }, (resp) => {
    if (!resp || !resp.ok) {
      setStatus((resp && resp.error) || 'Connection failed.', false)
      return
    }
    const n = (resp.sequences || []).length
    setStatus(`Connected ✓ — found ${n} active sequence${n === 1 ? '' : 's'}.`, true)
  })
})
