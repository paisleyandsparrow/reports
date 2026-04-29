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

// ── Queue stats ───────────────────────────────────────────────────────────────

async function getQueueStats(userId) {
  const today = new Date().toISOString().slice(0, 10)
  const [pendingData, acceptedData] = await Promise.all([
    supabaseFetch(`/rest/v1/user_campaign_queue?user_id=eq.${userId}&status=eq.pending&select=id`),
    supabaseFetch(`/rest/v1/user_campaign_queue?user_id=eq.${userId}&status=eq.accepted&accepted_date=eq.${today}&select=id`),
  ])
  return {
    pending: (pendingData || []).length,
    acceptedToday: (acceptedData || []).length,
  }
}

// Export for popup.js
window.__ps = {
  signOut,
  getStoredSession,
  getQueueStats,
}
})();
