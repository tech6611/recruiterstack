// Runs on LinkedIn /in/ profile pages. Captures the visible name + profile URL,
// shows a floating "Add to sequence" panel, and hands the real work to the
// background worker (which makes the API call). This script never touches the
// API directly.

(function () {
  if (window.__rsExtLoaded) return
  window.__rsExtLoaded = true

  // --- read what's on the profile page ---
  function currentProfile() {
    const nameEl = document.querySelector('main h1') || document.querySelector('h1')
    const name = nameEl ? nameEl.innerText.trim() : ''
    // Normalise to the canonical https://www.linkedin.com/in/<slug>/ form.
    const m = location.href.match(/https?:\/\/[^/]*linkedin\.com\/in\/[^/?#]+/i)
    const linkedin_url = m ? `${m[0]}/` : location.href.split('?')[0]
    return { name, linkedin_url }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ))
  }

  // --- build the UI ---
  const root = document.createElement('div')
  root.id = 'rs-ext-root'
  root.innerHTML = `
    <button id="rs-ext-fab" title="Add to RecruiterStack sequence">➕ Add to sequence</button>
    <div id="rs-ext-panel" hidden>
      <div id="rs-ext-header">
        <span>Add to sequence</span>
        <button id="rs-ext-close" aria-label="Close">✕</button>
      </div>
      <div id="rs-ext-body">
        <label class="rs-ext-label" for="rs-ext-name">Name</label>
        <input id="rs-ext-name" class="rs-ext-input" type="text" />

        <label class="rs-ext-label" for="rs-ext-email">Email <span class="rs-ext-req">(required)</span></label>
        <input id="rs-ext-email" class="rs-ext-input" type="email" placeholder="name@company.com" />

        <label class="rs-ext-label" for="rs-ext-seq">Sequence</label>
        <select id="rs-ext-seq" class="rs-ext-input"></select>

        <button id="rs-ext-add" class="rs-ext-btn">Add to sequence</button>
        <div id="rs-ext-msg" class="rs-ext-msg"></div>
      </div>
    </div>
  `
  document.body.appendChild(root)

  const fab = root.querySelector('#rs-ext-fab')
  const panel = root.querySelector('#rs-ext-panel')
  const closeBtn = root.querySelector('#rs-ext-close')
  const nameInput = root.querySelector('#rs-ext-name')
  const emailInput = root.querySelector('#rs-ext-email')
  const seqSelect = root.querySelector('#rs-ext-seq')
  const addBtn = root.querySelector('#rs-ext-add')
  const msg = root.querySelector('#rs-ext-msg')

  function setMsg(text, kind) {
    msg.textContent = text || ''
    msg.className = 'rs-ext-msg' + (kind ? ' rs-ext-' + kind : '')
  }

  function openPanel() {
    const p = currentProfile()
    nameInput.value = p.name
    emailInput.value = ''
    setMsg('')
    panel.hidden = false
    fab.hidden = true

    // Load the org's active sequences into the dropdown.
    seqSelect.innerHTML = '<option>Loading…</option>'
    addBtn.disabled = true
    chrome.runtime.sendMessage({ type: 'getSequences' }, (resp) => {
      if (!resp || !resp.ok) {
        seqSelect.innerHTML = '<option value="">—</option>'
        if (resp && resp.notConnected) {
          setMsg('Not connected. Click the extension icon in the toolbar → paste your API key.', 'error')
        } else {
          setMsg((resp && resp.error) || 'Could not load sequences.', 'error')
        }
        return
      }
      const seqs = resp.sequences || []
      if (!seqs.length) {
        seqSelect.innerHTML = '<option value="">No active sequences</option>'
        setMsg('No active sequences found in your workspace.', 'error')
        return
      }
      seqSelect.innerHTML = seqs
        .map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
        .join('')
      addBtn.disabled = false
    })
  }

  function closePanel() {
    panel.hidden = true
    fab.hidden = false
  }

  function submit() {
    const name = nameInput.value.trim()
    const email = emailInput.value.trim()
    const sequence_id = seqSelect.value
    const { linkedin_url } = currentProfile()

    if (!name) return setMsg('Name is required.', 'error')
    if (!email) return setMsg('Email is required to enrol someone.', 'error')
    if (!sequence_id) return setMsg('Pick a sequence first.', 'error')

    addBtn.disabled = true
    setMsg('Adding…')
    chrome.runtime.sendMessage(
      { type: 'enroll', payload: { name, email, linkedin_url, sequence_id } },
      (resp) => {
        addBtn.disabled = false
        if (!resp || !resp.ok) {
          setMsg((resp && resp.error) || 'Something went wrong.', 'error')
          return
        }
        const d = resp.data || {}
        if (d.enrolled) {
          setMsg('✓ Added to the sequence' + (d.candidate_created ? ' (new candidate created).' : '.'), 'ok')
        } else if (d.reason === 'already_enrolled') {
          setMsg('Already in this sequence — nothing to do.', 'ok')
        } else if (d.reason === 'sequence_not_found') {
          setMsg('That sequence no longer exists.', 'error')
        } else {
          setMsg('Could not enrol (' + (d.reason || 'unknown reason') + ').', 'error')
        }
      },
    )
  }

  fab.addEventListener('click', openPanel)
  closeBtn.addEventListener('click', closePanel)
  addBtn.addEventListener('click', submit)
})()
