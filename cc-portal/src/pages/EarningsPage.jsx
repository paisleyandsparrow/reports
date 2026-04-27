import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const EARNINGS_TTL = 5 * 60 * 1000
function eCacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > EARNINGS_TTL) { sessionStorage.removeItem(key); return null }
    return data
  } catch { return null }
}
function eCacheSet(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

const COL_META = [
  { key: 'campaign_title', label: 'Campaign',   align: 'left',  numeric: false },
  { key: 'asin',           label: 'ASIN',       align: 'left',  numeric: false },
  { key: 'max_rate',       label: 'Rate',       align: 'right', numeric: true  },
  { key: 'total_units',    label: 'Units',      align: 'right', numeric: true  },
  { key: 'total_revenue',  label: 'Revenue',    align: 'right', numeric: true  },
  { key: 'total_income',   label: 'Income',     align: 'right', numeric: true  },
]

function fmt$(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function EarningsPage() {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [preset, setPreset]     = useState('7')
  const [search, setSearch]     = useState('')
  const [sortCol, setSortCol]   = useState('total_income')
  const [sortDir, setSortDir]   = useState('desc')
  const [user, setUser]         = useState(null)
  const [storeName, setStoreName] = useState('')
  const [activeAsins, setActiveAsins] = useState(null) // null = loading, Set when loaded
  const tourStartedRef = useRef(false)

  function startEarningsTour() {
    const allSteps = [
      { element: '#earnings-controls', popover: { title: '📅 Time Period & Search', description: 'Switch between 7d, 30d, 90d, or all-time earnings. Search by campaign name or ASIN.', side: 'bottom', align: 'start' } },
      { element: '#earnings-stats', popover: { title: '📊 Summary Stats', description: 'Total income, revenue, units sold, and unique campaigns in your selected period.', side: 'bottom', align: 'start' } },
      { element: '#earnings-table', popover: { title: '📋 Earnings Breakdown', description: 'Full detail per ASIN — click any column to sort. ✓ Live / ✗ Expired shows if the campaign is still active.', side: 'top', align: 'start' } },
    ]
    const steps = allSteps.filter(s => document.querySelector(s.element))
    if (steps.length === 0) return
    const d = driver({
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Done ✓',
      onDestroyed: () => localStorage.setItem('ps_tour_earnings_v1', '1'),
      steps,
    })
    d.drive()
  }

  useEffect(() => {
    if (loading) return
    if (tourStartedRef.current) return
    tourStartedRef.current = true
    if (localStorage.getItem('ps_tour_earnings_v1')) return
    const t = setTimeout(startEarningsTour, 800)
    return () => clearTimeout(t)
  }, [loading])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/login'; return }
      setUser(session.user)
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('store_name')
        .eq('id', session.user.id)
        .single()
      if (prefs?.store_name) setStoreName(prefs.store_name)
      fetchDetail('all')
      fetchActiveAsins()
    }
    init()
  }, [])

  async function fetchActiveAsins() {
    const cacheKey = 'earnings_active_asins'
    const cached = eCacheGet(cacheKey)
    if (cached) { setActiveAsins(new Set(cached)); return }
    const { data } = await supabase
      .from('cc_campaign_catalog')
      .select('primary_asin, asins')
      .ilike('status', 'active')
    if (!data) { setActiveAsins(new Set()); return }
    const s = new Set()
    for (const c of data) {
      if (c.primary_asin) s.add(c.primary_asin)
      for (const a of (c.asins || [])) s.add(a)
    }
    setActiveAsins(s)
    eCacheSet(cacheKey, [...s])
  }

  async function fetchDetail(p) {
    const cacheKey = `earnings_detail_${p}`
    const cached = eCacheGet(cacheKey)
    if (cached) { setRows(cached); setLoading(false); return }
    setLoading(true)
    const daysBack = p === 'all' ? null : parseInt(p, 10)
    const { data, error } = await supabase.rpc('get_earning_detail', { days_back: daysBack })
    if (!error && data) { setRows(data); eCacheSet(cacheKey, data) }
    setLoading(false)
  }

  function handlePreset(p) {
    setPreset(p)
    fetchDetail(p)
  }

  function toggleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  const filtered = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      r.campaign_title?.toLowerCase().includes(q) ||
      r.asin?.toLowerCase().includes(q)
    )
  }, [rows, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = a[sortCol] ?? ''
      const vb = b[sortCol] ?? ''
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortCol, sortDir])

  const totalIncome  = filtered.reduce((s, r) => s + Number(r.total_income), 0)
  const totalRevenue = filtered.reduce((s, r) => s + Number(r.total_revenue), 0)
  const totalUnits   = filtered.reduce((s, r) => s + Number(r.total_units), 0)

  const sortArrow = (col) => {
    if (sortCol !== col) return <span style={{ color: '#cbd5e1', marginLeft: '4px' }}>↕</span>
    return <span style={{ marginLeft: '4px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>

      <AppHeader page="earnings" storeName={storeName} onSignOut={handleSignOut} />

      {/* Sub-header: back link + title + controls */}
      <div id="earnings-controls" style={{
        background: '#fff', borderBottom: '1.5px solid #e2e8f0',
        padding: '12px 28px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap'
      }}>
        <Link
          to="/"
          style={{
            fontSize: '0.75rem', fontWeight: 600, color: '#f97316',
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px',
            border: '1.5px solid #fed7aa', borderRadius: '8px', padding: '4px 12px',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          ← Catalog
        </Link>

        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>All Earnings</span>

        <div style={{ flex: 1 }} />

        {/* Date preset pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', whiteSpace: 'nowrap' }}>Period</span>
          <div style={{ display: 'flex', gap: '3px' }}>
            {['7', '30', '90', 'all'].map(p => {
              const active = preset === p
              return (
                <button
                  key={p}
                  onClick={() => handlePreset(p)}
                  style={{
                    fontSize: '0.68rem', fontWeight: active ? 700 : 500,
                    padding: '4px 10px', borderRadius: '20px', cursor: 'pointer',
                    border: `1.5px solid ${active ? '#f97316' : '#e2e8f0'}`,
                    background: active ? '#fff7ed' : '#fff',
                    color: active ? '#ea580c' : '#64748b',
                    whiteSpace: 'nowrap', transition: 'all .15s'
                  }}
                >
                  {p === 'all' ? 'All time' : `${p}d`}
                </button>
              )
            })}
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.72rem', pointerEvents: 'none' }}>🔍</span>
          <input
            type="text"
            placeholder="Search campaign or ASIN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: '1.5px solid #e2e8f0', borderRadius: '8px',
              padding: '5px 10px 5px 28px', fontSize: '0.78rem',
              background: '#fff', color: '#0f172a', outline: 'none', width: '220px'
            }}
            onFocus={e => e.target.style.borderColor = '#f97316'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
        </div>
      </div>

      {/* Stats summary row */}
      <div id="earnings-stats" style={{ padding: '16px 28px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Income',   value: fmt$(totalIncome),                  color: '#16a34a' },
          { label: 'Total Revenue',  value: fmt$(totalRevenue),                 color: '#0f172a' },
          { label: 'Total Units',    value: totalUnits.toLocaleString(),         color: '#0f172a' },
          { label: 'Campaigns',      value: [...new Set(filtered.map(r => r.campaign_title))].length.toLocaleString(), color: '#0f172a' },
          { label: 'Products (ASIN)',value: filtered.length.toLocaleString(),    color: '#0f172a' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#fff', borderRadius: '12px', padding: '12px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', minWidth: '120px' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div id="earnings-table" style={{ padding: '0 28px 48px' }}>
        <div style={{ background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Loading earnings…</div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No earnings found</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                    {COL_META.map(col => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        style={{
                          padding: '10px 16px',
                          textAlign: col.align,
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: sortCol === col.key ? '#f97316' : '#64748b',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          userSelect: 'none',
                          borderRight: col.key !== 'total_income' ? '1px solid #f1f5f9' : 'none'
                        }}
                      >
                        {col.label}{sortArrow(col.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa'}
                    >
                      {/* Campaign */}
                      <td style={{ padding: '10px 16px', maxWidth: '320px', borderRight: '1px solid #f1f5f9' }}>
                        <span style={{
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden', lineHeight: '1.35', color: '#0f172a', fontWeight: 500
                        }}>
                          {row.campaign_title || '—'}
                        </span>
                        {row.asin && activeAsins !== null && (
                          <span style={{
                            display: 'inline-block', marginTop: '3px',
                            fontSize: '0.58rem', fontWeight: 700, padding: '1px 6px',
                            borderRadius: '20px', letterSpacing: '0.03em', whiteSpace: 'nowrap',
                            ...(activeAsins.has(row.asin)
                              ? { background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }
                              : { background: '#f9fafb', color: '#94a3b8', border: '1px solid #e2e8f0' })
                          }}>
                            {activeAsins.has(row.asin) ? '✓ Live' : '✗ Expired'}
                          </span>
                        )}
                      </td>
                      {/* ASIN */}
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                        {row.asin ? (
                          <a
                            href={`https://www.amazon.com/dp/${row.asin}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#f97316', fontFamily: 'monospace', fontSize: '0.75rem', textDecoration: 'none', fontWeight: 600 }}
                            onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                            onMouseLeave={e => e.target.style.textDecoration = 'none'}
                          >
                            {row.asin}
                          </a>
                        ) : '—'}
                      </td>
                      {/* Rate */}
                      <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                        <span style={{
                          background: '#fff7ed', color: '#ea580c', fontWeight: 700,
                          fontSize: '0.72rem', padding: '2px 7px', borderRadius: '20px'
                        }}>
                          {Number(row.max_rate).toFixed(0)}%
                        </span>
                      </td>
                      {/* Units */}
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                        {Number(row.total_units).toLocaleString()}
                      </td>
                      {/* Revenue */}
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                        {fmt$(row.total_revenue)}
                      </td>
                      {/* Income */}
                      <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#16a34a', fontWeight: 700 }}>{fmt$(row.total_income)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals footer */}
                <tfoot>
                  <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                    <td style={{ padding: '10px 16px', color: '#0f172a', borderRight: '1px solid #f1f5f9' }}>
                      {sorted.length.toLocaleString()} rows
                    </td>
                    <td style={{ padding: '10px 16px', borderRight: '1px solid #f1f5f9' }} />
                    <td style={{ padding: '10px 16px', borderRight: '1px solid #f1f5f9' }} />
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', borderRight: '1px solid #f1f5f9' }}>
                      {sorted.reduce((s, r) => s + Number(r.total_units), 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#475569', borderRight: '1px solid #f1f5f9' }}>
                      {fmt$(sorted.reduce((s, r) => s + Number(r.total_revenue), 0))}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#16a34a' }}>
                      {fmt$(sorted.reduce((s, r) => s + Number(r.total_income), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Tour replay button */}
      <button
        onClick={startEarningsTour}
        title="Take the tour"
        style={{
          position: 'fixed', bottom: '28px', right: '28px', zIndex: 1000,
          background: '#0f172a', color: '#fff', border: 'none', borderRadius: '99px',
          padding: '10px 18px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
          display: 'flex', alignItems: 'center', gap: '6px',
          transition: 'background .15s, transform .1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.transform = 'scale(1.05)' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#0f172a'; e.currentTarget.style.transform = 'scale(1)' }}
      >
        🎯 Tour
      </button>

    </div>
  )
}
