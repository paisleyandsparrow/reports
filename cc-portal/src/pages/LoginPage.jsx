import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import PublicLayout from '../components/PublicLayout'

export default function LoginPage() {
  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  // Auto-trigger Google OAuth when coming from marketing site CTA
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('intent') === 'signup') {
      handleGoogleSignIn()
    }
  }, [])

  return (
    <PublicLayout>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        background: '#fbf7f3',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 28,
          padding: '48px 44px',
          border: '1px solid #f1ebe5',
          boxShadow: '0 20px 50px -20px rgba(26,20,16,0.10)',
          width: '100%',
          maxWidth: 400,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '0.66rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.22em', textTransform: 'uppercase', margin: '0 0 20px' }}>
            Creator Coders
          </p>
          <h1 style={{
            fontFamily: 'Georgia, serif',
            fontWeight: 400,
            fontSize: '1.8rem',
            color: '#1a1410',
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            margin: '0 0 8px',
          }}>
            Sign in to your account
          </h1>
          <p style={{ fontSize: '0.84rem', color: '#a89485', margin: '0 0 32px', lineHeight: 1.5 }}>
            Continue to your dashboard.
          </p>

          <button
            onClick={handleGoogleSignIn}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              background: '#1a1410',
              color: '#fbf7f3',
              border: 'none',
              borderRadius: 999,
              padding: '15px 22px',
              fontSize: '0.92rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.01em',
              transition: 'background .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#2a1f18' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1a1410' }}
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <p style={{ fontSize: '0.74rem', color: '#c4b5a5', margin: '20px 0 0', lineHeight: 1.5 }}>
            New here? <a href="https://creatorcoders.com/#pricing" style={{ color: '#ec4899', fontWeight: 600, textDecoration: 'none' }}>Start your free trial →</a>
          </p>
        </div>
      </div>
    </PublicLayout>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" />
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" />
      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z" />
      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z" />
    </svg>
  )
}
