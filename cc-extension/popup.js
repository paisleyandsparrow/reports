// popup.js — loaded after supabase.js via popup.html <script> tag

const { signOut, getStoredSession, getQueueStats } = window.__ps

const authSection     = document.getElementById('auth-section')
const mainSection     = document.getElementById('main-section')
const signInBtn       = document.getElementById('sign-in-btn')
const signOutBtn      = document.getElementById('sign-out-btn')
const runQueueBtn     = document.getElementById('run-queue-btn')
const userEmailEl     = document.getElementById('user-email-display')
const queueStatsEl    = document.getElementById('queue-stats-text')
const authFeedback    = document.getElementById('auth-feedback')
const runFeedback     = document.getElementById('run-feedback')
const cooldownText    = document.getElementById('cooldown-text')

const COOLDOWN_MS = 10 * 60 * 1000  // 10 minutes

let cooldownInterval = null

// ── Cooldown helpers ──────────────────────────────────────────────────────────

function formatCountdown(msLeft) {
  const totalSec = Math.ceil(msLeft / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function startCooldownUI(lastRunAt) {
  if (cooldownInterval) clearInterval(cooldownInterval)

  function tick() {
    const msLeft = COOLDOWN_MS - (Date.now() - lastRunAt)
    if (msLeft <= 0) {
      clearInterval(cooldownInterval)
      cooldownInterval = null
      runQueueBtn.disabled = false
      runQueueBtn.textContent = '▶️ Run Queue Now'
      cooldownText.textContent = ''
    } else {
      runQueueBtn.disabled = true
      runQueueBtn.textContent = '⏳ Cooling down…'
      cooldownText.textContent = `Next run available in ${formatCountdown(msLeft)}`
    }
  }

  tick()
  cooldownInterval = setInterval(tick, 1000)
}

async function checkCooldown() {
  return new Promise(resolve => {
    chrome.storage.local.get('lastRunAt', ({ lastRunAt }) => {
      if (lastRunAt && Date.now() - lastRunAt < COOLDOWN_MS) {
        startCooldownUI(lastRunAt)
      }
      resolve()
    })
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setFeedback(el, msg, type = 'success') {
  el.textContent = msg
  el.className = `feedback ${type}`
}

// ── Init — check if already signed in ────────────────────────────────────────

async function init() {
  const session = await getStoredSession()
  if (session?.user) {
    showMainView(session)
    await Promise.all([loadQueueStats(session.user.id), checkCooldown()])
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

// ── Queue stats ────────────────────────────────────────────────────────────────

async function loadQueueStats(userId) {
  try {
    const stats = await getQueueStats(userId)
    queueStatsEl.className = 'status-value'
    queueStatsEl.textContent = `${stats.pending} pending · ${stats.acceptedToday} accepted today`
  } catch (e) {
    queueStatsEl.className = 'status-value status-none'
    queueStatsEl.textContent = 'Could not load queue'
  }
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
    await loadQueueStats(session.user.id)
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

// ── Run queue ──────────────────────────────────────────────────────────────

runQueueBtn.addEventListener('click', async () => {
  runQueueBtn.disabled = true
  runQueueBtn.textContent = 'Running…'
  cooldownText.textContent = ''
  setFeedback(runFeedback, '')

  try {
    const response = await new Promise(resolve =>
      chrome.runtime.sendMessage({ action: 'runQueue' }, resolve)
    )
    if (response?.error) throw new Error(response.error)
    const r = response.result
    if (r.reason && r.total === 0) {
      setFeedback(runFeedback, r.reason, 'error')
      runQueueBtn.disabled = false
      runQueueBtn.textContent = '▶️ Run Queue Now'
    } else {
      setFeedback(runFeedback, `✓ Accepted ${r.accepted} campaign${r.accepted === 1 ? '' : 's'}${r.failed ? ` · ${r.failed} failed` : ''}`, 'success')
      // Store last run time and start cooldown
      const now = Date.now()
      chrome.storage.local.set({ lastRunAt: now })
      startCooldownUI(now)
    }
    // Refresh stats
    const session = await getStoredSession()
    if (session?.user) loadQueueStats(session.user.id)
  } catch (err) {
    setFeedback(runFeedback, err.message || 'Run failed. Please try again.', 'error')
    runQueueBtn.disabled = false
    runQueueBtn.textContent = '▶️ Run Queue Now'
  }
})

// ── Boot ──────────────────────────────────────────────────────────────────────

init()
