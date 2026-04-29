import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function UnauthorizedPage() {
  const navigate = useNavigate()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fbf7f3',
      fontFamily: 'Inter, sans-serif',
      color: '#1a1410',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -120, right: -120, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.14), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -160, left: -100, width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,207,232,0.28), transparent 70%)', pointerEvents: 'none' }} />

      <div style={{
        background: '#fff',
        borderRadius: 28,
        padding: '48px 40px',
        border: '1px solid #f1ebe5',
        boxShadow: '0 20px 50px -20px rgba(26,20,16,0.12)',
        maxWidth: 460,
        width: '100%',
        position: 'relative',
        zIndex: 1,
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 18 }}>
          Almost there
        </p>
        <h1 style={{
          fontFamily: 'Georgia, serif',
          fontWeight: 400,
          fontSize: '2rem',
          color: '#1a1410',
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          margin: '0 0 16px',
        }}>
          Your seat <em style={{ color: '#ec4899', fontStyle: 'italic' }}>isn't ready</em> yet.
        </h1>
        <p style={{ fontSize: '0.95rem', color: '#7a6b5d', lineHeight: 1.6, margin: '0 0 32px' }}>
          We're hand-approving every account so the experience stays considered. We'll have you in shortly.
        </p>

        <a
          href="mailto:hello@paisleyandsparrow.com"
          style={{
            display: 'inline-block',
            background: '#1a1410',
            color: '#fbf7f3',
            padding: '14px 28px',
            borderRadius: 999,
            fontSize: '0.92rem',
            fontWeight: 600,
            textDecoration: 'none',
            letterSpacing: '0.01em',
            transition: 'background .15s',
            marginBottom: 20,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2a1f18' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#1a1410' }}
        >
          Get in touch
        </a>

        <div>
          <button
            onClick={handleSignOut}
            style={{
              fontSize: '0.78rem',
              color: '#a89485',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 6,
              transition: 'color .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#1a1410'}
            onMouseLeave={e => e.currentTarget.style.color = '#a89485'}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
