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
      const { data: { session: _session } } = await supabase.auth.getSession()
      const session = _session ?? (import.meta.env.VITE_MOCK === 'true' ? { user: { id: 'mock', email: 'jen@example.com' } } : null)
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
    if (sortCol !== col) return <span style={{ color: '#d4c5b3', marginLeft: 6 }}>↕</span>
    return <span style={{ marginLeft: 6, color: '#ec4899' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fbf7f3', fontFamily: 'Inter, sans-serif', color: '#1a1410' }}>
      <AppHeader page="earnings" storeName={storeName} onSignOut={handleSignOut} />

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '48px 28px 80px', display: 'flex', flexDirection: 'column', gap: 36 }}>

        {/* Editorial hero */}
        <div>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
            Earnings
          </p>
          <h1 style={{
            fontFamily: 'Georgia, serif', fontWeight: 400,
            fontSize: 'clamp(2.2rem, 4.5vw, 3.4rem)', color: '#1a1410',
            letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0,
          }}>
            Where your work <em style={{ color: '#ec4899', fontStyle: 'italic' }}>is paying off</em>.
          </h1>
          <p style={{ fontSize: '1.02rem', color: '#7a6b5d', lineHeight: 1.55, maxWidth: 600, marginTop: 18 }}>
            Income broken down by campaign and product. Sort, search, and see what's still live.
          </p>
        </div>

        {/* Controls bar */}
        <div id="earnings-controls" style={{
          background: '#fff', borderRadius: 22, border: '1px solid #f1ebe5',
          padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Period</span>
            <div style={{ display: 'flex', gap: 4, background: '#faf5ef', borderRadius: 999, padding: 4 }}>
              {['7', '30', '90', 'all'].map(p => {
                const active = preset === p
                return (
                  <button
                    key={p}
                    onClick={() => handlePreset(p)}
                    style={{
                      fontSize: '0.74rem', fontWeight: active ? 600 : 500,
                      padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
                      border: 'none',
                      background: active ? '#1a1410' : 'transparent',
                      color: active ? '#fbf7f3' : '#7a6b5d',
                      whiteSpace: 'nowrap', transition: 'all .15s',
                      fontFamily: 'inherit', letterSpacing: '0.02em',
                    }}
                  >
                    {p === 'all' ? 'All time' : `${p} days`}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              type="text"
              placeholder="Search campaign or ASIN…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', border: '1px solid #f1ebe5', borderRadius: 999,
                padding: '10px 18px', fontSize: '0.85rem',
                background: '#faf5ef', color: '#1a1410', outline: 'none',
                fontFamily: 'inherit', transition: 'border-color .15s, background .15s',
              }}
              onFocus={e => { e.target.style.borderColor = '#ec4899'; e.target.style.background = '#fff' }}
              onBlur={e => { e.target.style.borderColor = '#f1ebe5'; e.target.style.background = '#faf5ef' }}
            />
          </div>
        </div>

        {/* Stats summary row */}
        <div id="earnings-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {[
            { label: 'Income',     value: fmt$(totalIncome),  accent: true },
            { label: 'Revenue',    value: fmt$(totalRevenue) },
            { label: 'Units',      value: totalUnits.toLocaleString() },
            { label: 'Campaigns',  value: [...new Set(filtered.map(r => r.campaign_title))].length.toLocaleString() },
            { label: 'Products',   value: filtered.length.toLocaleString() },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{
              background: accent ? '#1a1410' : '#fff',
              color: accent ? '#fbf7f3' : '#1a1410',
              borderRadius: 22,
              padding: '22px 24px',
              border: accent ? 'none' : '1px solid #f1ebe5',
            }}>
              <div style={{ fontSize: '0.64rem', fontWeight: 700, color: accent ? '#fbcfe8' : '#a89485', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>{label}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.7rem', letterSpacing: '-0.02em', lineHeight: 1, color: accent ? '#fbcfe8' : '#1a1410' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div id="earnings-table">
          <div style={{ background: '#fff', borderRadius: 22, overflow: 'hidden', border: '1px solid #f1ebe5' }}>
            {loading ? (
              <div style={{ padding: 80, textAlign: 'center', color: '#a89485', fontSize: '0.95rem', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Loading earnings…</div>
            ) : sorted.length === 0 ? (
              <div style={{ padding: 80, textAlign: 'center', color: '#a89485', fontSize: '0.95rem', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>No earnings found.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#faf5ef', borderBottom: '1px solid #f1ebe5' }}>
                      {COL_META.map(col => (
                        <th
                          key={col.key}
                          onClick={() => toggleSort(col.key)}
                          style={{
                            padding: '14px 20px',
                            textAlign: col.align,
                            fontWeight: 700,
                            fontSize: '0.62rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.18em',
                            color: sortCol === col.key ? '#1a1410' : '#a89485',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            userSelect: 'none',
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
                        style={{ borderBottom: '1px solid #f5ede5', transition: 'background .15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#fdf8f2'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '14px 20px', maxWidth: 360 }}>
                          <span style={{
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            overflow: 'hidden', lineHeight: 1.35, color: '#1a1410', fontFamily: 'Georgia, serif', fontSize: '0.95rem', letterSpacing: '-0.005em',
                          }}>
                            {row.campaign_title || '—'}
                          </span>
                          {row.asin && activeAsins !== null && (
                            <span style={{
                              display: 'inline-block', marginTop: 6,
                              fontSize: '0.56rem', fontWeight: 700, padding: '3px 9px',
                              borderRadius: 999, letterSpacing: '0.16em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                              ...(activeAsins.has(row.asin)
                                ? { background: '#fdf2f8', color: '#9d174d' }
                                : { background: '#faf5ef', color: '#a89485' })
                            }}>
                              {activeAsins.has(row.asin) ? 'Live' : 'Expired'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px', whiteSpace: 'nowrap' }}>
                          {row.asin ? (
                            <a
                              href={`https://www.amazon.com/dp/${row.asin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#7a6b5d', fontFamily: '"SF Mono", monospace', fontSize: '0.78rem', textDecoration: 'none', fontWeight: 500 }}
                              onMouseEnter={e => { e.target.style.color = '#1a1410' }}
                              onMouseLeave={e => { e.target.style.color = '#7a6b5d' }}
                            >
                              {row.asin}
                            </a>
                          ) : <span style={{ color: '#d4c5b3' }}>—</span>}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <span style={{
                            background: '#fdf2f8', color: '#9d174d', fontWeight: 700,
                            fontSize: '0.7rem', padding: '4px 10px', borderRadius: 999,
                            letterSpacing: '0.04em',
                          }}>
                            {Number(row.max_rate).toFixed(0)}%
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', color: '#7a6b5d', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {Number(row.total_units).toLocaleString()}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', color: '#7a6b5d', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {fmt$(row.total_revenue)}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ color: '#1a1410', fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '-0.005em' }}>{fmt$(row.total_income)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#faf5ef', borderTop: '1px solid #f1ebe5' }}>
                      <td style={{ padding: '14px 20px', color: '#1a1410', fontWeight: 600, fontSize: '0.78rem' }}>
                        {sorted.length.toLocaleString()} rows
                      </td>
                      <td />
                      <td />
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: '#1a1410', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {sorted.reduce((s, r) => s + Number(r.total_units), 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', color: '#1a1410', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {fmt$(sorted.reduce((s, r) => s + Number(r.total_revenue), 0))}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ color: '#ec4899', fontFamily: 'Georgia, serif', fontSize: '1.05rem', letterSpacing: '-0.01em' }}>{fmt$(sorted.reduce((s, r) => s + Number(r.total_income), 0))}</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={startEarningsTour}
        title="Take the tour"
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
          background: '#1a1410', color: '#fbf7f3', border: 'none', borderRadius: 999,
          padding: '12px 22px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 14px 32px -12px rgba(26,20,16,0.4)',
          fontFamily: 'inherit', letterSpacing: '0.02em',
          transition: 'background .15s, transform .12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#2a1f18'; e.currentTarget.style.transform = 'translateY(-1px)' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#1a1410'; e.currentTarget.style.transform = 'none' }}
      >
        Take the tour
      </button>
    </div>
  )
}
