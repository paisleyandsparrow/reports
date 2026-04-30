import { supabase } from '../lib/supabase'
import PublicLayout from '../components/PublicLayout'

export default function LoginPage() {
  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <PublicLayout>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* ambient gradient blooms */}
        <div style={{ position: 'absolute', top: -120, right: -120, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.16), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -160, left: -100, width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,207,232,0.30), transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 64, maxWidth: 980, width: '100%', position: 'relative', zIndex: 1, alignItems: 'center' }}>

        {/* LEFT: editorial copy */}
        <div>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 18 }}>
            Paisley & Sparrow · Portal
          </p>
          <h1 style={{
            fontFamily: 'Georgia, serif',
            fontWeight: 400,
            fontSize: 'clamp(2.4rem, 5vw, 3.6rem)',
            color: '#1a1410',
            letterSpacing: '-0.03em',
            lineHeight: 1.02,
            margin: '0 0 22px',
          }}>
            Your campaigns, <em style={{ color: '#ec4899', fontStyle: 'italic' }}>elevated</em>.
          </h1>
          <p style={{ fontSize: '1.05rem', color: '#7a6b5d', lineHeight: 1.6, maxWidth: 440, margin: 0 }}>
            Track Creator Connections earnings, surface high-performing campaigns, and tune your Meta ads — all in one quiet, considered place.
          </p>
        </div>

        {/* RIGHT: sign-in card */}
        <div style={{
          background: '#fff',
          borderRadius: 28,
          padding: '40px 36px',
          border: '1px solid #f1ebe5',
          boxShadow: '0 20px 50px -20px rgba(26,20,16,0.12)',
        }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12 }}>Sign in</p>
          <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.6rem', color: '#1a1410', letterSpacing: '-0.02em', margin: '0 0 28px', lineHeight: 1.2 }}>
            Welcome back.
          </h2>

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
              transition: 'transform .12s, background .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#2a1f18' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1a1410' }}
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#f1ebe5' }} />
            <span style={{ fontSize: '0.7rem', color: '#a89485', letterSpacing: '0.06em' }}>by invitation only</span>
            <div style={{ flex: 1, height: 1, background: '#f1ebe5' }} />
          </div>

          <p style={{ fontSize: '0.78rem', color: '#7a6b5d', lineHeight: 1.55, textAlign: 'center', margin: 0 }}>
            Need access? <a href="mailto:hello@paisleyandsparrow.com" style={{ color: '#1a1410', fontWeight: 600, textDecoration: 'underline', textDecorationColor: '#fbcfe8', textUnderlineOffset: 3 }}>Get in touch</a>.
          </p>
        </div>
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
