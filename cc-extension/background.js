// background.js — service worker
// Owns the Google sign-in flow so it survives the popup closing during auth.

const SUPABASE_URL = 'https://wzmtzpcqbaisqwjiigdx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bXR6cGNxYmFpc3F3amlpZ2R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjgyNTksImV4cCI6MjA5MDc0NDI1OX0.qlFCCc1t_nlA_WOLXATEgc_zd0AXLuuIsGowldpM5Mw'
const GOOGLE_CLIENT_ID = '947857596841-73gtfr6btashcj9ghjfru21a4p6kpgds.apps.googleusercontent.com'

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Paisley] Extension installed')
  chrome.alarms.create('processQueue', { periodInMinutes: 60 })
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'processQueue') {
    const result = await runQueue().catch(err => ({ error: err.message }))
    console.log('[Paisley] Auto queue run:', result)
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'signIn') {
    handleSignIn()
      .then(session => sendResponse({ session }))
      .catch(err => sendResponse({ error: err.message }))
    return true
  }
  if (msg.action === 'runQueue') {
    runQueue()
      .then(result => sendResponse({ result }))
      .catch(err => sendResponse({ error: err.message }))
    return true
  }
})

async function handleSignIn() {
  const REDIRECT_URI = `https://${chrome.runtime.id}.chromiumapp.org/`

  // Generate raw nonce, hash it for Google (Supabase gets the raw value)
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16))
  const rawNonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('')
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawNonce))
  const hashedNonce = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('response_type', 'id_token')
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('scope', 'openid email profile')
  authUrl.searchParams.set('nonce', hashedNonce)
  authUrl.searchParams.set('prompt', 'select_account')

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (url) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message))
        if (!url) return reject(new Error('Sign-in cancelled'))
        resolve(url)
      }
    )
  })

  const fragment = new URL(responseUrl).hash.slice(1)
  const params = new URLSearchParams(fragment)
  const idToken = params.get('id_token')
  if (!idToken) throw new Error('No ID token returned from Google')

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=id_token`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ provider: 'google', id_token: idToken, nonce: rawNonce }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error_description || body.msg || `Auth failed (${res.status})`)
  }

  const data = await res.json()
  await chrome.storage.local.set({ supabase_session: data })
  return data
}

// ── Queue processing ──────────────────────────────────────────────────────────

async function sbFetch(path, options = {}) {
  const stored = await chrome.storage.local.get(['supabase_session'])
  const session = stored.supabase_session
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

async function runQueue() {
  const stored = await chrome.storage.local.get(['supabase_session'])
  const session = stored.supabase_session
  if (!session?.user) throw new Error('Not signed in')

  const userId = session.user.id
  const today  = new Date().toISOString().slice(0, 10)
  const now    = new Date().toISOString()

  // Load user prefs
  const prefsData = await sbFetch(
    `/rest/v1/user_preferences?id=eq.${userId}&select=max_campaigns_per_day,max_per_run,acceptance_enabled&limit=1`
  )
  const prefs      = prefsData?.[0] || {}
  const maxPerDay  = parseInt(prefs.max_campaigns_per_day || 500)
  const maxPerRun  = parseInt(prefs.max_per_run || 100)

  // Count already accepted today
  const acceptedToday = await sbFetch(
    `/rest/v1/user_campaign_queue?user_id=eq.${userId}&status=eq.accepted&accepted_date=eq.${today}&select=id`
  )
  const alreadyAccepted = (acceptedToday || []).length
  const remainingCap    = Math.max(0, maxPerDay - alreadyAccepted)

  if (remainingCap === 0) {
    return { accepted: 0, failed: 0, total: 0, reason: `Daily cap of ${maxPerDay} already reached` }
  }

  // Fetch pending queue (oldest first, up to cap)
  const limit   = Math.min(maxPerRun, remainingCap)
  const pending = await sbFetch(
    `/rest/v1/user_campaign_queue?user_id=eq.${userId}&status=eq.pending&order=marked_at.asc&limit=${limit}&select=id,campaign_id`
  )

  if (!pending || pending.length === 0) {
    return { accepted: 0, failed: 0, total: 0, reason: 'No pending campaigns' }
  }

  let accepted = 0
  let failed   = 0

  for (const item of pending) {
    try {
      // TODO: replace stub with real CC content script click
      const result = await acceptCampaignStub(item.campaign_id)
      if (result.success) {
        await sbFetch(`/rest/v1/user_campaign_queue?id=eq.${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'accepted', accepted_at: now, accepted_date: today }),
        })
        accepted++
      } else {
        await sbFetch(`/rest/v1/user_campaign_queue?id=eq.${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'failed' }),
        })
        failed++
      }
    } catch (e) {
      console.warn('[Paisley] Failed item', item.campaign_id, e.message)
      failed++
    }
  }

  return { accepted, failed, total: pending.length, reason: null }
}

// Stub — replace with real CC page content script when ready
async function acceptCampaignStub(campaignId) {
  await new Promise(r => setTimeout(r, 30))
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL IMPLEMENTATION (commented out — swap acceptCampaignStub above with this
// once content script injection is wired up)
//
// How it works (mirrors connectors/creator_connections.py _submit_batch):
//   1. background.js opens (or reuses) a tab at the CC opportunities page so
//      the browser already has Amazon auth cookies attached.
//   2. We inject acceptCampaignReal as a content script into that tab via
//      chrome.scripting.executeScript — it runs in the page context where
//      fetch() automatically includes credentials (session cookies).
//   3. We POST a single campaign ID to Amazon's bulk-accept API endpoint.
//      Amazon accepts 1–5000 IDs per call; we send one per queue item so we
//      can track accept/fail individually.
//   4. On success (HTTP 200) we return { success: true }.
//      On EXISTING_REQUEST_IN_PROGRESS we retry up to 5× with 30s waits.
//      Any other failure returns { success: false, error: ... }.
//
// To activate:
//   a) Add "scripting" permission to manifest.json permissions array.
//   b) Add "https://affiliate-program.amazon.com/*" to host_permissions if not present.
//   c) Replace the call to acceptCampaignStub() in runQueue() with a call to
//      acceptCampaignReal() below.
//   d) Make sure the CC tab stays open (or reopen it) before the queue run starts.
//
// ─────────────────────────────────────────────────────────────────────────────

// const CC_OPPORTUNITIES_URL =
//   'https://affiliate-program.amazon.com/p/connect/requests' +
//   '?status=opportunity&type=affiliate-plus&campaignStatuses=active%2Cpending'
// const BULK_SUBMIT_URL =
//   'https://affiliate-program.amazon.com/connect/api/campaign/bulk-accept/submit'
//
// // Ensure a CC tab is open and return its tabId.
// // Reuses an existing tab if one is already at that host.
// async function getOrOpenCCTab() {
//   return new Promise((resolve) => {
//     chrome.tabs.query({ url: 'https://affiliate-program.amazon.com/*' }, (tabs) => {
//       if (tabs.length > 0) {
//         resolve(tabs[0].id)
//       } else {
//         chrome.tabs.create({ url: CC_OPPORTUNITIES_URL, active: false }, (tab) => {
//           // Wait for the tab to finish loading before injecting
//           chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
//             if (tabId === tab.id && info.status === 'complete') {
//               chrome.tabs.onUpdated.removeListener(listener)
//               resolve(tab.id)
//             }
//           })
//         })
//       }
//     })
//   })
// }
//
// // Content-script function injected into the CC page.
// // Runs in page context so fetch() has Amazon session cookies automatically.
// async function _ccAcceptInPage(campaignId, bulkSubmitUrl) {
//   const MAX_RETRIES = 5
//   const RETRY_DELAY_MS = 30000  // 30 s — Amazon processes requests async
//
//   for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
//     const resp = await fetch(bulkSubmitUrl, {
//       method: 'POST',
//       credentials: 'include',
//       headers: {
//         'Content-Type': 'application/json',
//         'Accept': 'application/json',
//         // storeid is the Amazon Associates tag — replace with the real user value
//         // (read from user_preferences.store_id or hardcode for single-user MVP)
//         'storeid': 'jenpaispa-20',
//         'Referer': window.location.href,
//       },
//       body: JSON.stringify({
//         rawInput: campaignId,            // one ID per call for per-item tracking
//         requestEntityType: 'CAMPAIGN_ID',
//         bulkActionType: 'BULK_ACCEPT_CAMPAIGN',
//       }),
//     })
//
//     if (resp.status === 200) {
//       return { success: true }
//     }
//
//     const body = await resp.text()
//     if (body.includes('EXISTING_REQUEST_IN_PROGRESS') || body.includes('DUPLICATE_REQUEST')) {
//       if (attempt < MAX_RETRIES - 1) {
//         await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
//         continue
//       }
//     }
//
//     return { success: false, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` }
//   }
//
//   return { success: false, error: 'Max retries exceeded (EXISTING_REQUEST_IN_PROGRESS)' }
// }
//
// // Drop-in replacement for acceptCampaignStub — call this from runQueue().
// async function acceptCampaignReal(campaignId) {
//   const tabId = await getOrOpenCCTab()
//   const results = await chrome.scripting.executeScript({
//     target: { tabId },
//     func: _ccAcceptInPage,
//     args: [campaignId, BULK_SUBMIT_URL],
//   })
//   return results[0]?.result ?? { success: false, error: 'No result from content script' }
// }
