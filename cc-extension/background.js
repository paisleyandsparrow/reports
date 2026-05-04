// background.js — service worker
// Owns the Google sign-in flow so it survives the popup closing during auth.

const SUPABASE_URL = 'https://wzmtzpcqbaisqwjiigdx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bXR6cGNxYmFpc3F3amlpZ2R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjgyNTksImV4cCI6MjA5MDc0NDI1OX0.qlFCCc1t_nlA_WOLXATEgc_zd0AXLuuIsGowldpM5Mw'
const GOOGLE_CLIENT_ID = '659224624844-fn0hicqktt1d8ji4db04rsn15rq6cjep.apps.googleusercontent.com'

chrome.runtime.onInstalled.addListener(() => {
  console.log('[CreatorCoders] Extension installed')
  chrome.alarms.create('processQueue', { periodInMinutes: 60 })
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'processQueue') {
    const result = await runQueue().catch(err => ({ error: err.message }))
    console.log('[CreatorCoders] Auto queue run:', result)
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

async function refreshSessionIfNeeded() {
  const stored = await chrome.storage.local.get(['supabase_session'])
  const session = stored.supabase_session
  if (!session) return null

  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1]))
    if (Date.now() < payload.exp * 1000 - 5 * 60 * 1000) return session
  } catch { /* decode failed, fall through to refresh */ }

  if (!session.refresh_token) return session

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
    if (!res.ok) return session
    const newSession = await res.json()
    await chrome.storage.local.set({ supabase_session: newSession })
    return newSession
  } catch {
    return session
  }
}

async function sbFetch(path, options = {}) {
  const session = await refreshSessionIfNeeded()
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
    `/rest/v1/user_preferences?id=eq.${userId}&select=max_campaigns_per_day,max_per_run,acceptance_enabled,store_id&limit=1`
  )
  const prefs      = prefsData?.[0] || {}
  const maxPerDay  = parseInt(prefs.max_campaigns_per_day || 500)
  const maxPerRun  = parseInt(prefs.max_per_run || 100)
  const storeId    = prefs.store_id || ''
  console.log('[CreatorCoders] storeId from prefs:', JSON.stringify(storeId), '| prefs:', JSON.stringify(prefs))

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

  // Send ALL campaign IDs in a single bulk POST (same as Python connector).
  // rawInput is a newline-joined string — Amazon accepts up to 5000 at once.
  const campaignIds = pending.map(item => item.campaign_id)
  console.log('[CreatorCoders] Submitting batch of', campaignIds.length, 'campaigns in one call')

  const result = await acceptCampaignsBatch(campaignIds, storeId)
  console.log('[CreatorCoders] batch result', JSON.stringify(result))

  if (result.success) {
    // Mark all as accepted
    await Promise.all(pending.map(item =>
      sbFetch(`/rest/v1/user_campaign_queue?id=eq.${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'accepted', accepted_at: now, accepted_date: today }),
      })
    ))
    return { accepted: pending.length, failed: 0, total: pending.length, reason: null }
  } else {
    console.warn('[CreatorCoders] batch failed', result.error)
    await Promise.all(pending.map(item =>
      sbFetch(`/rest/v1/user_campaign_queue?id=eq.${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'failed' }),
      })
    ))
    return { accepted: 0, failed: pending.length, total: pending.length, reason: result.error }
  }
}

// ── Amazon bulk-accept implementation ────────────────────────────────────────

const CC_OPPORTUNITIES_URL =
  'https://affiliate-program.amazon.com/p/connect/requests' +
  '?creatorId=amzn1.creator.ce51e44c-2eaf-401b-a94a-8a64cd412b82' +
  '&status=opportunity&type=affiliate-plus&campaignStatuses=active%2Cpending'
const BULK_SUBMIT_URL =
  'https://affiliate-program.amazon.com/connect/api/campaign/bulk-accept/submit'

// Ensure a CC tab is open and return its tabId.
// Reuses an existing tab if one is already at that host.
async function getOrOpenCCTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: 'https://affiliate-program.amazon.com/*' }, (tabs) => {
      if (tabs.length > 0) {
        resolve(tabs[0].id)
      } else {
        chrome.tabs.create({ url: CC_OPPORTUNITIES_URL, active: false }, (tab) => {
          chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener)
              resolve(tab.id)
            }
          })
        })
      }
    })
  })
}

// Injected into the CC page — sends ALL campaign IDs in one bulk POST (mirrors Python connector).
async function _ccAcceptBatchInPage(campaignIds, bulkSubmitUrl, storeId) {
  const idsText = campaignIds.join('\n')
  const _fetch = window.__fetch || fetch.bind(window)

  console.log('[CCBatch] location:', window.location.href)
  console.log('[CCBatch] __fetch available:', !!window.__fetch)
  console.log('[CCBatch] campaignIds:', campaignIds)

  for (let attempt = 0; attempt < 10; attempt++) {
    const resp = await _fetch(bulkSubmitUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'storeid': storeId,
        'Referer': window.location.href,
      },
      body: JSON.stringify({
        rawInput: idsText,
        requestEntityType: 'CAMPAIGN_ID',
        bulkActionType: 'BULK_ACCEPT_CAMPAIGN',
      }),
    })

    const respHeaders = {}
    resp.headers.forEach((v, k) => { respHeaders[k] = v })
    console.log('[CCBatch] attempt', attempt, 'status:', resp.status, 'headers:', JSON.stringify(respHeaders))

    if (resp.status === 200) {
      const body = await resp.text()
      return { success: true, body: body.slice(0, 300) }
    }

    const body = await resp.text()
    if (body.includes('EXISTING_REQUEST_IN_PROGRESS') || body.includes('DUPLICATE_REQUEST')) {
      await new Promise(r => setTimeout(r, 60000))  // wait 60s like Python does
      continue
    }

    return { success: false, error: `HTTP ${resp.status}: ${body.slice(0, 300)}` }
  }

  return { success: false, error: 'Max retries exceeded' }
}

// Injected into the CC page — runs in page context so fetch() carries Amazon cookies.
async function _ccAcceptInPage(campaignId, bulkSubmitUrl, storeId) {
  const MAX_RETRIES = 5
  const RETRY_DELAY_MS = 30000
  // Use original fetch (before Amazon's SPA may override it), same as working Python connector
  const _fetch = window.__fetch || fetch.bind(window)

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const resp = await _fetch(bulkSubmitUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'storeid': storeId,
        'Referer': window.location.href,
      },
      body: JSON.stringify({
        rawInput: campaignId,
        requestEntityType: 'CAMPAIGN_ID',
        bulkActionType: 'BULK_ACCEPT_CAMPAIGN',
      }),
    })

    if (resp.status === 200) {
      const okBody = await resp.text()
      return { success: true, body: okBody.slice(0, 300) }
    }

    const body = await resp.text()
    if (body.includes('EXISTING_REQUEST_IN_PROGRESS') || body.includes('DUPLICATE_REQUEST')) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
        continue
      }
    }

    return { success: false, error: `HTTP ${resp.status}: ${body.slice(0, 200)}` }
  }

  return { success: false, error: 'Max retries exceeded (EXISTING_REQUEST_IN_PROGRESS)' }
}

async function acceptCampaignsBatch(campaignIds, storeId) {
  const tabId = await getOrOpenCCTab()

  // Navigate to CC page fresh before submitting — mirrors Python which does
  // page.goto(OPPORTUNITIES_URL) before every batch to ensure fresh cookies/auth.
  await new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, { url: CC_OPPORTUNITIES_URL }, () => {
      chrome.tabs.onUpdated.addListener(function listener(tid, info) {
        if (tid === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener)
          resolve()
        }
      })
    })
  })
  // Let the page settle (SPA init)
  await new Promise(r => setTimeout(r, 3000))

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: _ccAcceptBatchInPage,
    args: [campaignIds, BULK_SUBMIT_URL, storeId],
  })
  return results[0]?.result ?? { success: false, error: 'No result from content script' }
}

async function acceptCampaignReal(campaignId, storeId) {
  const tabId = await getOrOpenCCTab()
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: _ccAcceptInPage,
    args: [campaignId, BULK_SUBMIT_URL, storeId],
  })
  return results[0]?.result ?? { success: false, error: 'No result from content script' }
}
