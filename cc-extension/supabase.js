;(function () {
// Supabase config — same project as the CC portal
const SUPABASE_URL = 'https://wzmtzpcqbaisqwjiigdx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bXR6cGNxYmFpc3F3amlpZ2R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjgyNTksImV4cCI6MjA5MDc0NDI1OX0.qlFCCc1t_nlA_WOLXATEgc_zd0AXLuuIsGowldpM5Mw'

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function supabaseFetch(path, options = {}) {
  const session = await getStoredSession()
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
    ...(options.headers || {}),
  }
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Supabase ${res.status}: ${body}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ── Session storage ───────────────────────────────────────────────────────────

function getStoredSession() {
  return new Promise(resolve => {
    chrome.storage.local.get(['supabase_session'], result => {
      resolve(result.supabase_session || null)
    })
  })
}

function setStoredSession(session) {
  return new Promise(resolve => {
    chrome.storage.local.set({ supabase_session: session }, resolve)
  })
}

function clearStoredSession() {
  return new Promise(resolve => {
    chrome.storage.local.remove(['supabase_session'], resolve)
  })
}

// ── Google sign-in lives in background.js (service worker) ──────────────────
// (popup.js sends { action: 'signIn' } via chrome.runtime.sendMessage)

async function signOut() {
  const session = await getStoredSession()
  if (session?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${session.access_token}`,
      },
    }).catch(() => {})
  }
  // Revoke Google token so next sign-in is interactive
  if (session?.provider_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${session.provider_token}`).catch(() => {})
  }
  await clearStoredSession()
}

// ── Amazon cookie capture ─────────────────────────────────────────────────────

// These are the cookies Playwright needs to operate as the user on Amazon
const CRITICAL_COOKIE_NAMES = [
  'session-id',
  'session-id-time',
  'ubid-main',
  'at-main',
  'sess-at-main',
  'x-main',
  'lc-main',
  'i18n-prefs',
]

async function captureAmazonSession(userId) {
  const allCookies = await new Promise((resolve, reject) => {
    chrome.cookies.getAll({ domain: '.amazon.com' }, (cookies) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
      resolve(cookies)
    })
  })

  if (!allCookies || allCookies.length === 0) {
    throw new Error('No Amazon cookies found. Make sure you are logged into Amazon in this browser.')
  }

  // Prefer critical cookies but include everything — Playwright may need them
  const criticalCookies = allCookies.filter(c => CRITICAL_COOKIE_NAMES.includes(c.name))
  if (criticalCookies.length < 3) {
    throw new Error('Amazon session cookies not found. Please log into Amazon first, then try again.')
  }

  // Compute expiry from the soonest-expiring critical cookie that has an expiry
  const expiryTimes = criticalCookies
    .filter(c => c.expirationDate && c.expirationDate > 0)
    .map(c => c.expirationDate * 1000) // convert to ms
  const soonestExpiry = expiryTimes.length > 0
    ? new Date(Math.min(...expiryTimes)).toISOString()
    : null

  const cookiePayload = allCookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
    expirationDate: c.expirationDate || null,
  }))

  const now = new Date().toISOString()
  const userAgent = navigator.userAgent

  // Upsert into Supabase (one row per user — always overwrites with latest)
  await supabaseFetch('/rest/v1/user_amazon_sessions', {
    method: 'POST',
    headers: {
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: userId,
      cookies: cookiePayload,
      captured_at: now,
      expires_at: soonestExpiry,
      user_agent: userAgent,
      is_valid: true,
    }),
  })

  return { capturedAt: now, expiresAt: soonestExpiry, cookieCount: cookiePayload.length }
}

// ── Load existing session info from Supabase ──────────────────────────────────

async function loadAmazonSessionInfo(userId) {
  const data = await supabaseFetch(
    `/rest/v1/user_amazon_sessions?user_id=eq.${userId}&select=captured_at,expires_at,is_valid&limit=1`,
    { method: 'GET' }
  )
  return data && data.length > 0 ? data[0] : null
}

// Export for popup.js
window.__ps = {
  signOut,
  getStoredSession,
  captureAmazonSession,
  loadAmazonSessionInfo,
}
})();
