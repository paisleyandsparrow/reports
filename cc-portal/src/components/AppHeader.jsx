import { Link } from 'react-router-dom'

const NAV_PAGES = [
  { key: 'dashboard',  label: 'Dashboard',   to: '/dashboard' },
  { key: 'catalog',    label: 'Campaigns',   to: '/' },
  { key: 'earnings',   label: 'CC Earnings', to: '/earnings' },
  { key: 'ad-health',  label: 'Ad Health',   to: '/ad-health' },
  { key: 'queue',      label: 'Queue',       to: '/queue' },
  { key: 'missed',     label: 'Missed $',    to: '/missed-earnings' },
  { key: 'settings',   label: 'Settings',    to: '/settings' },
]

export default function AppHeader({ storeName, page, onSignOut, children }) {
  return (
    <header style={{
      background: 'rgba(251, 247, 243, 0.85)',
      backdropFilter: 'saturate(140%) blur(12px)',
      WebkitBackdropFilter: 'saturate(140%) blur(12px)',
      padding: '0 28px',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 30,
      flexShrink: 0,
      borderBottom: '1px solid #f1ebe5',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Left: editorial wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0 }}>
        <Link to="/dashboard" style={{ display: 'flex', alignItems: 'baseline', gap: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          <span style={{
            fontFamily: 'Georgia, serif',
            fontWeight: 400,
            fontSize: '1.15rem',
            color: '#1a1410',
            letterSpacing: '-0.02em',
          }}>
            {storeName || ''}
          </span>
          <span style={{
            fontSize: '0.62rem',
            fontWeight: 700,
            color: '#ec4899',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}>
            Portal
          </span>
        </Link>
        {children}
      </div>

      {/* Right: nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {NAV_PAGES.map(p => {
          const isActive = p.key === page
          return (
            <Link
              id={`nav-${p.key}`}
              key={p.key}
              to={p.to}
              style={{
                fontSize: '0.82rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#1a1410' : '#7a6b5d',
                textDecoration: 'none',
                padding: '7px 14px',
                borderRadius: 999,
                background: isActive ? '#fff' : 'transparent',
                border: isActive ? '1px solid #f1ebe5' : '1px solid transparent',
                transition: 'color .15s, background .15s',
                pointerEvents: isActive ? 'none' : 'auto',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#1a1410' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#7a6b5d' }}
            >
              {p.label}
            </Link>
          )
        })}
        <span style={{ width: 1, height: 18, background: '#e8dfd6', margin: '0 10px' }} />
        <button
          onClick={onSignOut}
          style={{
            fontSize: '0.78rem',
            fontWeight: 500,
            color: '#a89485',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 8px',
            fontFamily: 'inherit',
            transition: 'color .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#1a1410'}
          onMouseLeave={e => e.currentTarget.style.color = '#a89485'}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
