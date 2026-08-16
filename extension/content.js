// Runs on LinkedIn /in/ profile pages. Reads the visible profile the recruiter is
// looking at (name, headline, location, About, a little experience), shows a
// floating panel to score that person against one of your jobs and add them to a
// sequence — with a first message personalized from the fit. All API calls go
// through the background worker; this script never touches the API directly.
//
// Scope stays button-first: it only reads what's already rendered on the page the
// recruiter chose to open. No background crawling, no navigating other profiles.

(function () {
  if (window.__rsExtLoaded) return
  window.__rsExtLoaded = true

  // --- read what's on the profile page (all best-effort; missing fields degrade) ---
  function clean(s) {
    return (s || '').replace(/\s+/g, ' ').trim()
  }

  // Fallback: pull the name out of the browser tab title, which LinkedIn sets to
  // e.g. "(3) Jane Doe | LinkedIn" or "Jane Doe - Headline | LinkedIn".
  function nameFromTitle() {
    let t = document.title || ''
    t = t.replace(/^\(\d+\)\s*/, '')            // strip "(3) " unread-count prefix
    t = t.replace(/\s*\|\s*LinkedIn.*$/i, '')   // strip " | LinkedIn" suffix
    t = t.replace(/\s+[-–—]\s.*$/, '') // strip " - Headline" if present
    return clean(t)
  }

  function readName() {
    for (const h of document.querySelectorAll('main h1, h1')) {
      const t = clean(h.innerText || h.textContent)
      if (t) return t
    }
    return nameFromTitle()
  }

  // The headline is the line right under the name in the intro card.
  function readHeadline() {
    try {
      const el = document.querySelector('main .text-body-medium.break-words')
      const t = clean(el && (el.innerText || el.textContent))
      if (t) return t
    } catch (_) { /* ignore */ }
    // Fallback: the "- Headline" portion of the tab title.
    const m = (document.title || '').match(/[-–—]\s(.+?)\s*\|\s*LinkedIn/i)
    return m ? clean(m[1]) : ''
  }

  // The location line — a small grey line in the intro card that is NOT the
  // "500+ connections" / "followers" counter.
  function readLocation() {
    try {
      const spans = document.querySelectorAll('main .text-body-small.inline, main span.text-body-small')
      for (const s of spans) {
        const t = clean(s.innerText || s.textContent)
        if (!t) continue
        if (/connection|follower/i.test(t)) continue
        if (/[,]|India|United|Kingdom|States|Area|Remote/i.test(t) || t.split(' ').length <= 5) return t
      }
    } catch (_) { /* ignore */ }
    return ''
  }

  // The About section's free text, if the recruiter has it on screen.
  function readAbout() {
    try {
      const anchor = document.querySelector('#about')
      const section = anchor && anchor.closest('section')
      if (!section) return ''
      // The section repeats its text in a visually-hidden span; take the longest
      // text node under it and strip a leading "About" header.
      let best = ''
      for (const el of section.querySelectorAll('span[aria-hidden="true"], .display-flex.full-width span')) {
        const t = clean(el.innerText || el.textContent)
        if (t.length > best.length) best = t
      }
      return best.replace(/^About\s*/i, '').slice(0, 4000)
    } catch (_) { return '' }
  }

  // A few experience lines ("Title at Company"), best-effort from the Experience
  // section's bold role titles + their company subtitles.
  function readExperience() {
    try {
      const anchor = document.querySelector('#experience')
      const section = anchor && anchor.closest('section')
      if (!section) return []
      const out = []
      const seen = new Set()
      for (const el of section.querySelectorAll('.t-bold span[aria-hidden="true"], .t-bold')) {
        const t = clean(el.innerText || el.textContent)
        if (t && !seen.has(t)) { seen.add(t); out.push(t) }
        if (out.length >= 8) break
      }
      return out
    } catch (_) { return [] }
  }

  function currentProfile() {
    const m = location.href.match(/https?:\/\/[^/]*linkedin\.com\/in\/[^/?#]+/i)
    const linkedin_url = m ? `${m[0]}/` : location.href.split('?')[0]
    return {
      name: readName(),
      headline: readHeadline(),
      location: readLocation(),
      about: readAbout(),
      experience: readExperience(),
      linkedin_url,
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ))
  }

  const BUCKET_LABEL = { great: 'Great fit', good: 'Good fit', okay: 'Okay fit' }

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

        <label class="rs-ext-label" for="rs-ext-job">Score against a job <span class="rs-ext-opt">(optional)</span></label>
        <select id="rs-ext-job" class="rs-ext-input"></select>

        <button id="rs-ext-eval" class="rs-ext-btn rs-ext-btn-ghost" hidden>Evaluate fit</button>
        <div id="rs-ext-fit" class="rs-ext-fit" hidden></div>

        <label class="rs-ext-label" for="rs-ext-seq">Sequence</label>
        <select id="rs-ext-seq" class="rs-ext-input"></select>

        <label class="rs-ext-check"><input id="rs-ext-review" type="checkbox" /> Review first message before it sends</label>

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
  const jobSelect = root.querySelector('#rs-ext-job')
  const evalBtn = root.querySelector('#rs-ext-eval')
  const fitBox = root.querySelector('#rs-ext-fit')
  const seqSelect = root.querySelector('#rs-ext-seq')
  const reviewChk = root.querySelector('#rs-ext-review')
  const addBtn = root.querySelector('#rs-ext-add')
  const msg = root.querySelector('#rs-ext-msg')

  // The fit the recruiter last computed, reused to personalize the first message.
  let lastFit = null
  let lastFitJob = null

  function setMsg(text, kind) {
    msg.textContent = text || ''
    msg.className = 'rs-ext-msg' + (kind ? ' rs-ext-' + kind : '')
  }

  function resetFit() {
    lastFit = null
    lastFitJob = null
    fitBox.hidden = true
    fitBox.innerHTML = ''
  }

  function openPanel() {
    const p = currentProfile()
    nameInput.value = p.name
    emailInput.value = ''
    reviewChk.checked = false
    resetFit()
    setMsg('')
    panel.hidden = false
    fab.hidden = true

    // Load sequences + scoreable jobs in parallel.
    seqSelect.innerHTML = '<option>Loading…</option>'
    jobSelect.innerHTML = '<option value="">— No job (skip fit) —</option>'
    evalBtn.hidden = true
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

    chrome.runtime.sendMessage({ type: 'getJobs' }, (resp) => {
      if (!resp || !resp.ok) return // jobs are optional; a failure just hides the fit step
      const jobs = resp.jobs || []
      jobSelect.innerHTML =
        '<option value="">— No job (skip fit) —</option>' +
        jobs.map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.title)}</option>`).join('')
    })
  }

  function closePanel() {
    panel.hidden = true
    fab.hidden = false
  }

  // Show/hide the Evaluate button as the recruiter picks a job.
  function onJobChange() {
    resetFit()
    evalBtn.hidden = !jobSelect.value
  }

  function evaluateFit() {
    const job_id = jobSelect.value
    if (!job_id) return
    const p = currentProfile()
    if (!p.name) return setMsg('Could not read the name on this profile.', 'error')

    evalBtn.disabled = true
    setMsg('Scoring against this job…')
    chrome.runtime.sendMessage(
      {
        type: 'score',
        payload: {
          job_id,
          name: p.name,
          headline: p.headline,
          location: p.location,
          about: p.about,
          experience: p.experience,
        },
      },
      (resp) => {
        evalBtn.disabled = false
        if (!resp || !resp.ok) {
          setMsg((resp && resp.error) || 'Could not score this profile.', 'error')
          return
        }
        setMsg('')
        const d = resp.data || {}
        lastFit = { why: d.rationale || '', evidence: (d.competencies || []).map(c => c.evidence).filter(Boolean) }
        lastFitJob = job_id
        renderFit(d)
      },
    )
  }

  function renderFit(d) {
    const bucket = d.fit_bucket || 'okay'
    const gates = (d.gate_failures || [])
    const flags = (d.red_flags || [])
    fitBox.hidden = false
    fitBox.innerHTML = `
      <div class="rs-ext-fit-head">
        <span class="rs-ext-badge rs-ext-${escapeHtml(bucket)}">${escapeHtml(BUCKET_LABEL[bucket] || 'Fit')}</span>
        <span class="rs-ext-score">${Number(d.score) || 0}/100</span>
      </div>
      ${d.rationale ? `<div class="rs-ext-why">${escapeHtml(d.rationale)}</div>` : ''}
      ${gates.length ? `<div class="rs-ext-warn">Missing must-haves: ${gates.map(escapeHtml).join(', ')}</div>` : ''}
      ${flags.length ? `<div class="rs-ext-warn">Watch-outs: ${flags.map(escapeHtml).join('; ')}</div>` : ''}
    `
  }

  function submit() {
    const name = nameInput.value.trim()
    const email = emailInput.value.trim()
    const sequence_id = seqSelect.value
    const job_id = jobSelect.value
    const p = currentProfile()

    if (!name) return setMsg('Name is required.', 'error')
    if (!email) return setMsg('Email is required to enrol someone.', 'error')
    if (!sequence_id) return setMsg('Pick a sequence first.', 'error')

    const payload = { name, email, linkedin_url: p.linkedin_url, sequence_id }
    if (job_id) {
      payload.job_id = job_id
      payload.current_title = p.headline || null
      payload.review = reviewChk.checked
      // Only attach the fit if it was computed for THIS job.
      if (lastFit && lastFitJob === job_id) payload.fit = lastFit
    }

    addBtn.disabled = true
    setMsg('Adding…')
    chrome.runtime.sendMessage({ type: 'enroll', payload }, (resp) => {
      addBtn.disabled = false
      if (!resp || !resp.ok) {
        setMsg((resp && resp.error) || 'Something went wrong.', 'error')
        return
      }
      const d = resp.data || {}
      if (d.enrolled && d.held) {
        setMsg('✓ Queued for your review — approve it in RecruiterStack to send.', 'ok')
      } else if (d.enrolled) {
        const extra = d.personalized ? ' with a personalized first message' : ''
        setMsg('✓ Added to the sequence' + extra + (d.candidate_created ? ' (new candidate).' : '.'), 'ok')
      } else if (d.reason === 'already_enrolled') {
        setMsg('Already in this sequence — nothing to do.', 'ok')
      } else if (d.reason === 'sequence_not_found') {
        setMsg('That sequence no longer exists.', 'error')
      } else {
        setMsg('Could not enrol (' + (d.reason || 'unknown reason') + ').', 'error')
      }
    })
  }

  fab.addEventListener('click', openPanel)
  closeBtn.addEventListener('click', closePanel)
  jobSelect.addEventListener('change', onJobChange)
  evalBtn.addEventListener('click', evaluateFit)
  addBtn.addEventListener('click', submit)
})()
