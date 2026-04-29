// background.js — service worker
// Owns the Google sign-in flow so it survives the popup closing during auth.

const SUPABASE_URL = 'https://wzmtzpcqbaisqwjiigdx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bXR6cGNxYmFpc3F3amlpZ2R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjgyNTksImV4cCI6MjA5MDc0NDI1OX0.qlFCCc1t_nlA_WOLXATEgc_zd0AXLuuIsGowldpM5Mw'
const GOOGLE_CLIENT_ID = '947857596841-73gtfr6btashcj9ghjfru21a4p6kpgds.apps.googleusercontent.com'

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Paisley] Extension installed')
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'signIn') {
    handleSignIn()
      .then(session => sendResponse({ session }))
      .catch(err => sendResponse({ error: err.message }))
    return true // keep channel open for async response
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
