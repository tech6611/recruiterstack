// Toolbar popup: show whether we're connected, and offer a shortcut to settings.

chrome.runtime.sendMessage({ type: 'getStatus' }, (resp) => {
  const el = document.getElementById('status')
  if (resp && resp.connected) {
    el.textContent = 'Connected ✓'
    el.className = 'ok'
  } else {
    el.textContent = 'Not connected'
    el.className = 'error'
  }
})

document.getElementById('opts').addEventListener('click', () => {
  chrome.runtime.openOptionsPage()
})
