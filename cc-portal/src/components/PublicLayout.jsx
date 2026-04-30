const LANDING = 'https://creatorcoders.com'

const t = {
  cream: '#fbf7f3',
  creamLine: '#f1ebe5',
  espresso: '#1a1410',
  espresso2: '#2a221c',
  pink: '#ec4899',
  pinkDeep: '#9d174d',
  muted: '#7a6b5d',
}

export default function PublicLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: t.cream, fontFamily: 'Inter, sans-serif', color: t.espresso, display: 'flex', flexDirection: 'column' }}>
      <Nav />
      <main style={{ flex: 1 }}>
        {children}
      </main>
      <Footer />
    </div>
  )
}

function Nav() {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      backdropFilter: 'saturate(140%) blur(14px)',
      WebkitBackdropFilter: 'saturate(140%) blur(14px)',
      background: 'rgba(251,247,243,0.78)',
      borderBottom: `1px solid rgba(26,20,16,0.06)`,
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: '18px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a
          href={LANDING}
          style={{
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
            fontSize: '1.15rem',
            color: t.espresso,
            textDecoration: 'none',
            letterSpacing: '-0.02em',
          }}
        >
          creator coders
        </a>

        <div style={{ display: 'flex', gap: 28, alignItems: 'center', fontSize: 14, color: t.muted }}>
          <NavLink href={`${LANDING}/#how`}>How it works</NavLink>
          <NavLink href={`${LANDING}/#story`}>Story</NavLink>
          <NavLink href={`${LANDING}/#pricing`}>Pricing</NavLink>
          <a
            href={LANDING}
            style={{
              background: t.pink, color: '#fff',
              borderRadius: 999, padding: '10px 20px',
              fontWeight: 500, fontSize: 14,
              textDecoration: 'none', display: 'inline-block',
              transition: 'transform 0.18s, background 0.18s, box-shadow 0.18s',
              boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = t.pinkDeep; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(236,72,153,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background = t.pink; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 0 rgba(0,0,0,0.06)' }}
          >
            Start free
          </a>
        </div>
      </div>
    </nav>
  )
}

function NavLink({ href, children }) {
  return (
    <a
      href={href}
      style={{ color: t.muted, textDecoration: 'none' }}
      onMouseEnter={e => { e.currentTarget.style.color = t.espresso }}
      onMouseLeave={e => { e.currentTarget.style.color = t.muted }}
    >
      {children}
    </a>
  )
}

function Footer() {
  return (
    <footer style={{
      borderTop: `1px solid ${t.creamLine}`,
      padding: '48px 32px',
      background: t.cream,
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a
            href={LANDING}
            style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.1rem', color: t.espresso, textDecoration: 'none', letterSpacing: '-0.02em' }}
          >
            creator coders
          </a>
          <span style={{ fontSize: 13, color: t.muted, letterSpacing: '0.02em' }}>
            © 2026 Creator Coders. Software for serious creators.
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 28, fontSize: 13 }}>
          <FooterLink href={`${LANDING}/contact`}>Contact</FooterLink>
          <FooterLink href={`${LANDING}/privacy`}>Privacy</FooterLink>
          <FooterLink href={`${LANDING}/terms`}>Terms</FooterLink>
        </nav>
      </div>
    </footer>
  )
}

function FooterLink({ href, children }) {
  return (
    <a
      href={href}
      style={{ color: t.muted, textDecoration: 'none' }}
      onMouseEnter={e => { e.currentTarget.style.color = t.pink }}
      onMouseLeave={e => { e.currentTarget.style.color = t.muted }}
    >
      {children}
    </a>
  )
}
