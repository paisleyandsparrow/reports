import { Link } from 'react-router-dom'

const NAV_PAGES = [
  { key: 'dashboard',  label: '🏠 Dashboard',  to: '/dashboard' },
  { key: 'catalog',    label: 'Campaigns',   to: '/' },
  { key: 'earnings',   label: '💰 Earnings',  to: '/earnings' },
  { key: 'ad-health',  label: '📊 Ad Health', to: '/ad-health' },
  { key: 'settings',   label: '⚙ Settings',  to: '/settings' },
]

const BREADCRUMB_LABELS = {
  dashboard:   'Dashboard',
  catalog:    'Campaign Discovery',
  'ad-health': 'Ad Health',
  earnings:   'Earnings',
  settings:   'Settings',
}

const linkStyle = {
  fontSize: '0.72rem',
  color: '#94a3b8',
  textDecoration: 'none',
  letterSpacing: '0.03em',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  fontFamily: 'inherit',
}

export default function AppHeader({ storeName, page, onSignOut, children }) {

  return (
    <header style={{
      background: '#0f172a',
      padding: '0 28px',
      height: '60px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 30,
      flexShrink: 0,
    }}>
      {/* Left: store name / breadcrumb + optional pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff', letterSpacing: '0.02em' }}>
            {storeName}
          </span>
          <span style={{ color: '#475569', fontSize: '0.85rem', margin: '0 7px' }}>/</span>
          <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.85rem' }}>
            {BREADCRUMB_LABELS[page]}
          </span>
        </div>
        {children}
      </div>

      {/* Right: nav links + sign out */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        {NAV_PAGES.map(p => {
          const isActive = p.key === page
          return (
            <Link
              id={`nav-${p.key}`}
              key={p.key}
              to={p.to}
              style={{
                ...linkStyle,
                padding: '4px 10px',
                borderRadius: '6px',
                color: isActive ? '#fff' : '#94a3b8',
                fontWeight: isActive ? 700 : 400,
                background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                pointerEvents: isActive ? 'none' : 'auto',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#e2e8f0' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#94a3b8' }}
            >
              {p.label}
            </Link>
          )
        })}
        <span style={{ width: '1px', height: '16px', background: '#334155', margin: '0 8px' }} />
        <button style={{ ...linkStyle, padding: '4px 10px', borderRadius: '6px' }} onClick={onSignOut}
          onMouseEnter={e => e.currentTarget.style.color = '#e2e8f0'}
          onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>
          Sign out
        </button>
      </div>
    </header>
  )
}
