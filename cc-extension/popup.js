// popup.js — loaded after supabase.js via popup.html <script> tag

const { signOut, getStoredSession, captureAmazonSession, loadAmazonSessionInfo } = window.__ps

const authSection   = document.getElementById('auth-section')
const mainSection   = document.getElementById('main-section')
const signInBtn     = document.getElementById('sign-in-btn')
const signOutBtn    = document.getElementById('sign-out-btn')
const captureBtn    = document.getElementById('capture-btn')
const userEmailEl   = document.getElementById('user-email-display')
const sessionStatus = document.getElementById('session-status-text')
const authFeedback  = document.getElementById('auth-feedback')
const captureFeedback = document.getElementById('capture-feedback')

// ── Helpers ───────────────────────────────────────────────────────────────────

function setFeedback(el, msg, type = 'success') {
  el.textContent = msg
  el.className = `feedback ${type}`
}

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(iso) {
  if (!iso) return null
  const ms = new Date(iso) - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

function renderSessionStatus(info) {
  if (!info) {
    sessionStatus.textContent = 'No session captured yet'
    sessionStatus.className = 'status-value status-none'
    return
  }

  const capturedStr = `Captured ${formatDate(info.captured_at)}`

  if (!info.is_valid) {
    sessionStatus.innerHTML = `<span>⚠️ Session invalidated</span><br><small style="color:#a89485">${capturedStr} — please recapture</small>`
    sessionStatus.className = 'status-value status-warn'
    return
  }

  if (info.expires_at) {
    const days = daysUntil(info.expires_at)
    if (days <= 0) {
      sessionStatus.innerHTML = `<span>⚠️ Session expired</span><br><small style="color:#a89485">${capturedStr}</small>`
      sessionStatus.className = 'status-value status-warn'
    } else if (days <= 7) {
      sessionStatus.innerHTML = `<span>⚠️ Expires in ${days} day${days === 1 ? '' : 's'}</span><br><small style="color:#a89485">${capturedStr}</small>`
      sessionStatus.className = 'status-value status-warn'
    } else {
      sessionStatus.innerHTML = `<span>✓ Active — expires ${formatDate(info.expires_at)}</span><br><small style="color:#a89485">${capturedStr}</small>`
      sessionStatus.className = 'status-value status-ok'
    }
  } else {
    sessionStatus.innerHTML = `<span>✓ Active</span><br><small style="color:#a89485">${capturedStr}</small>`
    sessionStatus.className = 'status-value status-ok'
  }
}

// ── Init — check if already signed in ────────────────────────────────────────

async function init() {
  const session = await getStoredSession()
  if (session?.user) {
    showMainView(session)
    // Load current Amazon session info
    const info = await loadAmazonSessionInfo(session.user.id).catch(() => null)
    renderSessionStatus(info)
  } else {
    showAuthView()
  }
}

function showAuthView() {
  authSection.style.display = 'flex'
  mainSection.style.display = 'none'
}

function showMainView(session) {
  authSection.style.display = 'none'
  mainSection.style.display = 'flex'
  userEmailEl.textContent = session.user?.email || ''
}

// ── Sign in ───────────────────────────────────────────────────────────────────

signInBtn.addEventListener('click', async () => {
  signInBtn.disabled = true
  signInBtn.textContent = 'Signing in…'
  setFeedback(authFeedback, '')

  try {
    // Auth runs in the background service worker so it survives the popup closing
    const response = await new Promise(resolve =>
      chrome.runtime.sendMessage({ action: 'signIn' }, resolve)
    )
    if (response?.error) throw new Error(response.error)
    const session = response.session
    showMainView(session)
    const info = await loadAmazonSessionInfo(session.user.id).catch(() => null)
    renderSessionStatus(info)
  } catch (err) {
    signInBtn.disabled = false
    signInBtn.innerHTML = `<svg class="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Sign in with Google`
    setFeedback(authFeedback, err.message || 'Sign in failed. Please try again.', 'error')
  }
})

// ── Sign out ──────────────────────────────────────────────────────────────────

signOutBtn.addEventListener('click', async () => {
  await signOut()
  showAuthView()
  setFeedback(authFeedback, '')
})

// ── Capture Amazon session ────────────────────────────────────────────────────

captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true
  captureBtn.textContent = 'Capturing…'
  setFeedback(captureFeedback, '')

  try {
    const session = await getStoredSession()
    if (!session?.user) throw new Error('Not signed in')

    const result = await captureAmazonSession(session.user.id)

    renderSessionStatus({
      captured_at: result.capturedAt,
      expires_at: result.expiresAt,
      is_valid: true,
    })

    setFeedback(captureFeedback, `✓ Captured ${result.cookieCount} cookies successfully`, 'success')
  } catch (err) {
    setFeedback(captureFeedback, err.message || 'Capture failed. Please try again.', 'error')
  } finally {
    captureBtn.disabled = false
    captureBtn.textContent = 'Capture Amazon Session'
  }
})

// ── Boot ──────────────────────────────────────────────────────────────────────

init()
