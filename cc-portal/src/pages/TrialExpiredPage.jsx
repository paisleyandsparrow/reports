export default function TrialExpiredPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#fbf7f3',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 20px',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#1a1410',
    }}>
      {/* Ambient blooms */}
      <div style={{
        position: 'absolute', top: -180, right: -120, width: 480, height: 480,
        background: 'radial-gradient(circle, rgba(251,207,232,0.45) 0%, rgba(251,207,232,0) 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -200, left: -150, width: 520, height: 520,
        background: 'radial-gradient(circle, rgba(253,242,248,0.6) 0%, rgba(253,242,248,0) 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative',
        zIndex: 1,
        background: '#ffffff',
        borderRadius: 24,
        boxShadow: '0 30px 80px -30px rgba(26,20,16,0.18), 0 0 0 1px #f1ebe5',
        padding: '48px 44px 44px',
        width: '100%',
        maxWidth: 500,
        textAlign: 'center',
      }}>
        {/* Icon */}
        <div style={{
          width: 64,
          height: 64,
          background: '#fdf2f8',
          border: '1.5px solid #fbcfe8',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: '1.75rem',
        }}>
          🔒
        </div>

        {/* Eyebrow */}
        <p style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: '#ec4899',
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          marginBottom: 14,
        }}>
          Trial ended
        </p>

        <h1 style={{
          fontFamily: 'Georgia, serif',
          fontWeight: 400,
          fontSize: '2rem',
          color: '#1a1410',
          letterSpacing: '-0.02em',
          margin: '0 0 14px',
          lineHeight: 1.15,
        }}>
          Your free trial has ended
        </h1>

        <p style={{
          fontSize: '0.92rem',
          color: '#7a6b5d',
          lineHeight: 1.65,
          margin: '0 0 32px',
        }}>
          Your 7-day free trial is over. Subscribe to keep access to your campaign catalog,
          earnings dashboard, and everything you've set up.
        </p>

        {/* Feature list */}
        <div style={{
          background: '#fbf7f3',
          border: '1px solid #f1ebe5',
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 32,
          textAlign: 'left',
        }}>
          {[
            'Full campaign catalog & smart matching',
            'Earnings dashboard & revenue tracking',
            'Ad spend vs. earnings insights',
            'Onboarding data & integrations preserved',
          ].map((feature, i, arr) => (
            <div key={feature} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 0',
              fontSize: '0.88rem',
              color: '#1a1410',
              borderBottom: i < arr.length - 1 ? '1px solid #f1ebe5' : 'none',
            }}>
              <span style={{ color: '#ec4899', fontSize: '0.9rem', flexShrink: 0 }}>✓</span>
              {feature}
            </div>
          ))}
        </div>

        <a
          href="/pricing"
          style={{
            display: 'block',
            background: '#1a1410',
            color: '#fbf7f3',
            borderRadius: 999,
            padding: '15px 32px',
            fontSize: '0.92rem',
            fontWeight: 600,
            letterSpacing: '0.02em',
            textDecoration: 'none',
            boxShadow: '0 14px 32px -14px rgba(26,20,16,0.45)',
            transition: 'background .15s, transform .12s',
            marginBottom: 20,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2a1f18'; e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#1a1410'; e.currentTarget.style.transform = 'none' }}
        >
          Subscribe now →
        </a>

        <p style={{ fontSize: '0.78rem', color: '#a89485', margin: 0 }}>
          Questions?{' '}
          <a href="mailto:creatorcodersportal@gmail.com" style={{ color: '#7a6b5d', textDecoration: 'underline' }}>
            creatorcodersportal@gmail.com
          </a>
        </p>
      </div>
    </div>
  )
}
