import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import { CampaignCard, CampaignCardSkeleton, categorize, CATEGORY_KEYWORDS, CATEGORY_STYLES } from '../components/CampaignCard'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const DISPLAY_CHUNK = 60

// --- Session cache helpers ---
const CAMPAIGNS_TTL_MS = 10 * 60 * 1000  // 10 minutes
const EARNING_TTL_MS  =  5 * 60 * 1000  //  5 minutes

function cacheGet(key, ttlMs) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > ttlMs) { sessionStorage.removeItem(key); return null }
    return data
  } catch { return null }
}

function cacheSet(key, data) {
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch { /* quota exceeded — just skip */ }
}

export default function CampaignCatalog() {
  const [campaigns, setCampaigns] = useState([])   // all rows from server
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('niches') // 'niches' | 'all' | specific category name
  const [filterMinRate, setFilterMinRate] = useState(20)
  const [user, setUser] = useState(null)
  const [creatorId, setCreatorId] = useState(null)
  const [storeName, setStoreName] = useState('')
  const [userCategories, setUserCategories] = useState([])
  const [editingNiches, setEditingNiches] = useState(false)
  const [pendingNiches, setPendingNiches] = useState([])
  const [savingNiches, setSavingNiches] = useState(false)
  const [displayLimit, setDisplayLimit] = useState(DISPLAY_CHUNK)
  const [sortBy, setSortBy] = useState('rate')
  const [datePreset, setDatePreset] = useState('all')
  const [minRateInput, setMinRateInput] = useState('20')
  const [platformFilter, setPlatformFilter] = useState('all') // 'all' | specific platform string
  const [showLegend, setShowLegend] = useState(false)

  // Already-Earning panel state
  const [earningItems, setEarningItems] = useState([])
  const [earningPreset, setEarningPreset] = useState('7')
  const [earningOpen, setEarningOpen] = useState(true)
  const [earningLoading, setEarningLoading] = useState(false)

  const tourStartedRef = useRef(false)

  function startCatalogTour() {
    const allSteps = [
      { element: '#catalog-earning-panel', popover: { title: '💰 Already Earning', description: "Campaigns you're currently earning from — see your top performers at a glance.", side: 'bottom', align: 'start' } },
      { element: '#catalog-filter-bar', popover: { title: '🔍 Filter Bar', description: 'Search by brand or keyword, filter by date added, and set a minimum commission %.' , side: 'bottom', align: 'start' } },
      { element: '#catalog-sort-row', popover: { title: '↕ Sort & Platform', description: 'Sort by highest rate, newest first, or ending soonest. Filter to Instagram, TikTok, YouTube, and more.', side: 'bottom', align: 'start' } },
      { element: '#catalog-niches-btn', popover: { title: '⭐ My Niches', description: 'Set your categories once — your default view only shows relevant campaigns for your niche.', side: 'bottom', align: 'start' } },
      { element: '#catalog-grid', popover: { title: '📋 Campaign Grid', description: 'Every card shows product image, commission %, category, and dates. Click CC → to accept on Amazon.', side: 'top', align: 'start' } },
    ]
    const steps = allSteps.filter(s => document.querySelector(s.element))
    if (steps.length === 0) return
    const d = driver({
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Done ✓',
      onDestroyed: () => localStorage.setItem('ps_tour_catalog_v1', '1'),
      steps,
    })
    d.drive()
  }

  // Auto-start tour on first visit
  useEffect(() => {
    if (loading) return
    if (tourStartedRef.current) return
    tourStartedRef.current = true
    if (localStorage.getItem('ps_tour_catalog_v1')) return
    const t = setTimeout(startCatalogTour, 800)
    return () => clearTimeout(t)
  }, [loading])

  async function fetchEarning(preset) {
    const cacheKey = `ps_earning_${preset}`
    const cached = cacheGet(cacheKey, EARNING_TTL_MS)
    if (cached) { setEarningItems(cached); return }
    setEarningLoading(true)
    const daysBack = preset === 'all' ? null : parseInt(preset, 10)
    const { data, error } = await supabase.rpc('get_earning_summary', { days_back: daysBack })
    if (!error && data) {
      setEarningItems(data)
      cacheSet(cacheKey, data)
    }
    setEarningLoading(false)
  }

  function handleEarningPreset(preset) {
    setEarningPreset(preset)
    fetchEarning(preset)
  }

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUser(session.user)
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('creator_id, store_name, categories')
        .eq('id', session.user.id)
        .single()
      if (prefs) {
        if (prefs.creator_id) setCreatorId(prefs.creator_id)
        if (prefs.store_name) setStoreName(prefs.store_name)
        if (prefs.categories?.length > 0) setUserCategories(prefs.categories)
      }
      fetchEarning('7')
    }
    init()
  }, [])

  // Re-fetch from server when commission filter changes
  useEffect(() => {
    setCampaigns([])
    setDisplayLimit(DISPLAY_CHUNK)
    fetchCampaigns(filterMinRate)
  }, [filterMinRate])

  // Reset display slice when client-side filters change
  useEffect(() => {
    setDisplayLimit(DISPLAY_CHUNK)
  }, [search, categoryFilter, datePreset, sortBy, platformFilter])

  async function fetchCampaigns(minRate = filterMinRate) {
    const cacheKey = `ps_campaigns_${minRate}`
    const cached = cacheGet(cacheKey, CAMPAIGNS_TTL_MS)
    if (cached) { setCampaigns(cached); setLoading(false); return }
    setLoading(true)
    const BATCH = 1000

    function buildQuery(from, withCount = false) {
      let q = supabase
        .from('cc_campaign_catalog')
        .select(
          'campaign_id, campaign_name, brand_name, commission_rate, status, start_date, end_date, first_seen, social_platforms, primary_asin, asins, image_url, is_selected, browse_nodes',
          withCount ? { count: 'exact' } : undefined
        )
        .order('commission_rate', { ascending: false })
      if (minRate > 0) q = q.gte('commission_rate', minRate)
      return q.range(from, from + BATCH - 1)
    }

    // First request gives us count + first 1000 rows in one shot
    const { data: first, count, error } = await buildQuery(0, true)
    if (error || !first) { setLoading(false); return }

    if (!count || count <= BATCH) {
      setCampaigns(first)
      cacheSet(cacheKey, first)
      setLoading(false)
      return
    }

    // Fire all remaining batches in parallel
    const extraBatches = Math.ceil((count - BATCH) / BATCH)
    const results = await Promise.all(
      Array.from({ length: extraBatches }, (_, i) =>
        buildQuery((i + 1) * BATCH).then(r => r.data || [])
      )
    )

    const all = [first, ...results].flat()
    setCampaigns(all)
    cacheSet(cacheKey, all)
    setLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function saveNiches() {
    setSavingNiches(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      await supabase.from('user_preferences')
        .update({ categories: pendingNiches })
        .eq('id', session.user.id)
      setUserCategories(pendingNiches)
      if (pendingNiches.length > 0) setCategoryFilter('niches')
    }
    setSavingNiches(false)
    setEditingNiches(false)
  }

  // Client-side filtering — categoryFilter is single source of truth for category scope
  const filtered = campaigns.filter(c => {
    const text = `${c.campaign_name} ${c.brand_name}`.toLowerCase()
    const matchesSearch = !search || text.includes(search.toLowerCase())
    const cats = categorize(c)
    const matchesCategory =
      categoryFilter === 'all' ? true :
      categoryFilter === 'niches' ? (userCategories.length === 0 || cats.some(cat => userCategories.includes(cat))) :
      cats.includes(categoryFilter)
    let matchesDate = true
    if (datePreset !== 'all' && c.first_seen) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - parseInt(datePreset, 10))
      matchesDate = new Date(c.first_seen) >= cutoff
    }
    const matchesPlatform = platformFilter === 'all' || (c.social_platforms || []).some(p => p.toLowerCase().includes(platformFilter.toLowerCase()))
    return matchesSearch && matchesCategory && matchesDate && matchesPlatform
  })

  // Deduplicate by primary_asin — same product can have many campaign entries per brand.
  // Data is already sorted commission_rate DESC so first occurrence = best deal.
  const deduped = (() => {
    const seen = new Set()
    return filtered.filter(c => {
      if (!c.primary_asin) return true
      if (seen.has(c.primary_asin)) return false
      seen.add(c.primary_asin)
      return true
    })
  })()

  // Sort deduped result by selected sort order
  const sorted = (() => {
    if (sortBy === 'rate') return deduped // already commission_rate DESC from server
    const arr = [...deduped]
    if (sortBy === 'newest') arr.sort((a, b) => new Date(b.first_seen || 0) - new Date(a.first_seen || 0))
    else if (sortBy === 'oldest') arr.sort((a, b) => new Date(a.first_seen || 0) - new Date(b.first_seen || 0))
    else if (sortBy === 'brand') arr.sort((a, b) => (a.brand_name || '').localeCompare(b.brand_name || ''))
    else if (sortBy === 'ending') {
      // Ending soonest first (null end_dates go last)
      arr.sort((a, b) => {
        if (!a.end_date && !b.end_date) return 0
        if (!a.end_date) return 1
        if (!b.end_date) return -1
        return new Date(a.end_date) - new Date(b.end_date)
      })
    }
    return arr
  })()

  // Slice for display — load more is client-side only
  const displayed = sorted.slice(0, displayLimit)
  const hasMore = sorted.length > displayLimit

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>

      {/* Badge Legend Modal */}
      {showLegend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowLegend(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-slate-900 mb-4" style={{ fontSize: '0.95rem' }}>Campaign Badge Guide</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', whiteSpace: 'nowrap', flexShrink: 0 }}>✓ Accepted</span>
                <p style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>You have accepted this Creator Connections campaign. It's live on your storefront.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', whiteSpace: 'nowrap', flexShrink: 0 }}>⏰ Ending</span>
                <p style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>Campaign ends within 7 days. Promote now or it will expire.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <span style={{ fontSize: '0.58rem', fontWeight: 700, background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '20px', padding: '1px 6px', letterSpacing: '0.03em', whiteSpace: 'nowrap', flexShrink: 0 }}>ACTIVE</span>
                <p style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.5 }}>Campaign status is Active — currently accepting creators.</p>
              </div>
            </div>
            <button
              onClick={() => setShowLegend(false)}
              style={{ marginTop: '20px', width: '100%', padding: '9px', borderRadius: '10px', background: '#f1f5f9', border: 'none', fontSize: '0.82rem', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
            >Close</button>
          </div>
        </div>
      )}

      {/* Edit Niches Modal */}
      {editingNiches && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="font-bold text-slate-900 mb-1" style={{ fontSize: '0.95rem' }}>My niches</h2>
            <p className="text-slate-400 mb-4" style={{ fontSize: '0.78rem' }}>Select the categories you promote. Your default view will show only these.</p>
            <div className="flex flex-wrap gap-2 mb-6">
              {Object.keys(CATEGORY_KEYWORDS).map(cat => {
                const on = pendingNiches.includes(cat)
                return (
                  <button
                    key={cat}
                    onClick={() => setPendingNiches(prev => on ? prev.filter(c => c !== cat) : [...prev, cat])}
                    className="transition-all"
                    style={{
                      fontSize: '0.72rem', fontWeight: on ? 700 : 500,
                      padding: '4px 12px', borderRadius: '20px',
                      border: `1.5px solid ${on ? '#f97316' : '#e2e8f0'}`,
                      background: on ? '#fff7ed' : '#fff',
                      color: on ? '#ea580c' : '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingNiches(false)}
                style={{ fontSize: '0.82rem', color: '#94a3b8', padding: '8px 16px', cursor: 'pointer', background: 'none', border: 'none' }}
              >
                Cancel
              </button>
              <button
                onClick={saveNiches}
                disabled={savingNiches}
                style={{
                  fontSize: '0.82rem', fontWeight: 600,
                  background: '#f97316', color: '#fff',
                  padding: '8px 20px', borderRadius: '10px',
                  border: 'none', cursor: 'pointer', opacity: savingNiches ? 0.5 : 1
                }}
              >
                {savingNiches ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AppHeader page="catalog" storeName={storeName} onSignOut={handleSignOut}>
        <div style={{
          fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap',
          background: 'rgba(255,255,255,0.06)', borderRadius: '20px',
          padding: '3px 12px', letterSpacing: '0.02em'
        }}>
          <strong style={{ color: '#e2e8f0' }}>{campaigns.length.toLocaleString()}</strong>
          {' campaigns\u00a0·\u00a0'}
          {filterMinRate}%+ commission
          {'\u00a0·\u00a0updated '}
          {new Date().toISOString().slice(0, 10)}
        </div>
      </AppHeader>

      {/* Already Earning Panel */}
      {(earningItems.length > 0 || earningLoading) && (
        <div id="catalog-earning-panel" style={{ background: '#fff', borderBottom: '2px solid #f1f5f9' }}>
          {/* Panel header */}
          <div
            onClick={() => setEarningOpen(o => !o)}
            style={{
              padding: '11px 28px', display: 'flex', alignItems: 'center',
              gap: '14px', cursor: 'pointer', userSelect: 'none',
              borderLeft: '4px solid #f97316'
            }}
          >
            <span style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0f172a' }}>
              Already Earning
            </span>
            {earningLoading ? (
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Loading…</span>
            ) : (
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                <strong style={{ color: '#16a34a' }}>
                  ${earningItems.reduce((s, x) => s + Number(x.total_income), 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </strong>
                {' '}· {earningItems.length} campaigns · {earningPreset === 'all' ? 'all time' : `last ${earningPreset}d`}
              </span>
            )}
            {/* Date preset pills */}
            <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
              {['7', '30', '90', 'all'].map(p => {
                const active = earningPreset === p
                return (
                  <button
                    key={p}
                    onClick={() => handleEarningPreset(p)}
                    style={{
                      fontSize: '0.68rem', fontWeight: active ? 700 : 500,
                      padding: '3px 10px', borderRadius: '20px', cursor: 'pointer',
                      border: `1.5px solid ${active ? '#f97316' : '#e2e8f0'}`,
                      background: active ? '#fff7ed' : 'transparent',
                      color: active ? '#ea580c' : '#64748b',
                      whiteSpace: 'nowrap', transition: 'all .15s'
                    }}
                  >
                    {p === 'all' ? 'All' : `${p}d`}
                  </button>
                )
              })}
            </div>
            {/* View all link — inline next to preset pills */}
            <Link
              to="/earnings"
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: '0.68rem', fontWeight: 600, color: '#f97316',
                textDecoration: 'none', whiteSpace: 'nowrap',
                padding: '3px 10px', borderRadius: '20px',
                border: '1.5px solid #fed7aa', background: 'transparent'
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#fff7ed'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              View all →
            </Link>
            <span style={{
              marginLeft: 'auto', fontSize: '0.68rem', color: '#94a3b8',
              display: 'inline-block',
              transform: earningOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform .2s'
            }}>▼</span>
          </div>

          {/* Card strip */}
          {earningOpen && (
            earningLoading ? (
              <div style={{ overflowX: 'auto', padding: '10px 28px 16px', display: 'flex', gap: '12px' }}>
                {Array.from({ length: 6 }).map((_, i) => <EarningCardSkeleton key={i} />)}
              </div>
            ) : (
              <div style={{
                overflowX: 'auto', padding: '10px 28px 16px',
                display: 'flex', gap: '12px',
                scrollbarWidth: 'thin', scrollbarColor: '#e2e8f0 transparent'
              }}>
                {earningItems.map((item, i) => (
                  <EarningCard key={i} item={item} />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Filter bar */}
      <div id="catalog-filter-bar" style={{
        background: '#fff', borderBottom: '1.5px solid #e2e8f0',
        position: 'sticky', top: '60px', zIndex: 20,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
      }}>

        {/* Row 1: search · date presets · min % · category */}
        <div style={{ padding: '9px 28px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap' }}>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.72rem', pointerEvents: 'none' }}>🔍</span>
            <input
              type="text"
              placeholder="Search brand or product…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                border: '1.5px solid #e2e8f0', borderRadius: '8px',
                padding: '5px 10px 5px 28px', fontSize: '0.78rem',
                background: '#fff', color: '#0f172a', outline: 'none', width: '200px'
              }}
              onFocus={e => e.target.style.borderColor = '#f97316'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' }} />

          {/* Date added presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', whiteSpace: 'nowrap' }}>Added</span>
            <div style={{ display: 'flex', gap: '3px' }}>
              {['all', '1', '7', '30'].map(p => {
                const isActive = datePreset === p
                return (
                  <button
                    key={p}
                    onClick={() => setDatePreset(p)}
                    style={{
                      fontSize: '0.68rem', fontWeight: isActive ? 700 : 500,
                      padding: '4px 10px', borderRadius: '20px', cursor: 'pointer',
                      border: `1.5px solid ${isActive ? '#f97316' : '#e2e8f0'}`,
                      background: isActive ? '#fff7ed' : '#fff',
                      color: isActive ? '#ea580c' : '#64748b',
                      whiteSpace: 'nowrap', transition: 'all .15s'
                    }}
                  >
                    {p === 'all' ? 'All' : `${p}d`}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' }} />

          {/* Min % number input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', whiteSpace: 'nowrap' }}>Min %</span>
            <input
              type="number"
              value={minRateInput}
              min={0} max={100}
              onChange={e => setMinRateInput(e.target.value)}
              onBlur={e => {
                e.target.style.borderColor = '#e2e8f0'
                const v = Number(minRateInput) || 0
                if (v !== filterMinRate) setFilterMinRate(v)
              }}
              onKeyDown={e => { if (e.key === 'Enter') { const v = Number(minRateInput) || 0; setFilterMinRate(v); e.target.blur() } }}
              style={{
                width: '56px', border: '1.5px solid #e2e8f0', borderRadius: '8px',
                padding: '5px 10px', fontSize: '0.78rem',
                background: '#fff', color: '#0f172a', outline: 'none'
              }}
              onFocus={e => e.target.style.borderColor = '#f97316'}
            />
          </div>

          <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' }} />

          {/* Category — My niches + All + specific categories */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{
              border: '1.5px solid #e2e8f0', borderRadius: '8px',
              padding: '5px 10px', fontSize: '0.78rem',
              background: '#fff', color: '#0f172a', outline: 'none'
            }}
            onFocus={e => e.target.style.borderColor = '#f97316'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          >
            {userCategories.length > 0 && <option value="niches">★ My niches</option>}
            <option value="all">All categories</option>
            <option disabled>─────────────</option>
            {Object.keys(CATEGORY_KEYWORDS).map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Row 2: count · sort pills · edit niches */}
        <div id="catalog-sort-row" style={{ padding: '8px 28px', display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid #f1f5f9' }}>

          {/* Count */}
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {loading && campaigns.length === 0 ? 'Loading…' : (
              <>
                <strong style={{ color: '#0f172a', fontWeight: 700 }}>{displayed.length.toLocaleString()}</strong>
                {' of '}
                <strong style={{ color: '#0f172a', fontWeight: 700 }}>{sorted.length.toLocaleString()}</strong>
                {' campaigns'}
              </>
            )}
          </span>

          <div style={{ flex: 1 }} />

          {/* Sort pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', whiteSpace: 'nowrap' }}>Sort</span>
            <div style={{ display: 'flex', gap: '2px', background: '#f1f5f9', borderRadius: '8px', padding: '2px' }}>
              {[
                { value: 'rate', label: '% Rate' },
                { value: 'newest', label: 'Newest' },
                { value: 'oldest', label: 'Oldest' },
                { value: 'brand', label: 'Brand A–Z' },
                { value: 'ending', label: '⏰ Ending' },
              ].map(({ value, label }) => {
                const isActive = sortBy === value
                return (
                  <button
                    key={value}
                    onClick={() => setSortBy(value)}
                    style={{
                      fontSize: '0.68rem', fontWeight: isActive ? 700 : 500,
                      padding: '4px 10px', borderRadius: '6px',
                      cursor: 'pointer', border: 'none',
                      background: isActive ? '#fff' : 'transparent',
                      color: isActive ? '#0f172a' : '#64748b',
                      whiteSpace: 'nowrap', transition: 'all .15s',
                      boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' }} />

          {/* Platform filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#94a3b8', whiteSpace: 'nowrap' }}>Platform</span>
            <div style={{ display: 'flex', gap: '3px' }}>
              {['all', 'instagram', 'tiktok', 'youtube', 'pinterest', 'facebook'].map(p => {
                const isActive = platformFilter === p
                const label = p === 'all' ? 'All' : p === 'instagram' ? 'IG' : p === 'tiktok' ? 'TT' : p === 'youtube' ? 'YT' : p === 'pinterest' ? 'PIN' : 'FB'
                return (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    style={{
                      fontSize: '0.68rem', fontWeight: isActive ? 700 : 500,
                      padding: '4px 9px', borderRadius: '20px', cursor: 'pointer',
                      border: `1.5px solid ${isActive ? '#f97316' : '#e2e8f0'}`,
                      background: isActive ? '#fff7ed' : '#fff',
                      color: isActive ? '#ea580c' : '#64748b',
                      whiteSpace: 'nowrap', transition: 'all .15s'
                    }}
                  >{label}</button>
                )
              })}
            </div>
          </div>

          <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' }} />

          {/* Badge legend */}
          <button
            onClick={() => setShowLegend(true)}
            style={{
              fontSize: '0.72rem', color: '#94a3b8', background: 'none',
              border: '1.5px solid #e2e8f0', borderRadius: '8px',
              padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#64748b' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#94a3b8' }}
          >
            ? Badges
          </button>

          <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 4px' }} />

          {/* Edit niches */}
          <button
            id="catalog-niches-btn"
            onClick={() => { setPendingNiches(userCategories); setEditingNiches(true) }}
            style={{
              fontSize: '0.72rem', fontWeight: 600, color: '#f97316',
              background: 'none', border: '1.5px solid #fed7aa', borderRadius: '8px',
              padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fff7ed' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
          >
            {userCategories.length > 0 ? `My niches (${userCategories.length}) ✏` : 'Set up niches →'}
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '16px',
          padding: '24px 28px'
        }}>
          {Array.from({ length: 24 }).map((_, i) => <CampaignCardSkeleton key={i} />)}
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', gap: '10px', color: '#64748b' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>No campaigns found</h2>
          <p style={{ fontSize: '0.85rem' }}>Try adjusting your filters</p>
        </div>
      ) : (
        <div id="catalog-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '16px',
          padding: '24px 28px'
        }}>
          {displayed.map(c => (
            <CampaignCard key={c.campaign_id} campaign={c} creatorId={creatorId} />
          ))}
        </div>
      )}

      {/* Load more — client-side only, always adds exactly DISPLAY_CHUNK */}
      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 28px 48px' }}>
          <button
            onClick={() => setDisplayLimit(p => p + DISPLAY_CHUNK)}
            disabled={loading}
            style={{
              border: '1.5px solid #e2e8f0', background: '#fff', color: '#374151',
              borderRadius: '10px', padding: '10px 28px',
              fontSize: '0.82rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1, transition: 'all .15s'
            }}
            onMouseEnter={e => { if (!loading) { e.target.style.background = '#f97316'; e.target.style.borderColor = '#f97316'; e.target.style.color = '#fff' } }}
            onMouseLeave={e => { e.target.style.background = '#fff'; e.target.style.borderColor = '#e2e8f0'; e.target.style.color = '#374151' }}
          >
            {loading ? 'Loading…' : `Show more (${Math.min(DISPLAY_CHUNK, sorted.length - displayLimit)} more)`}
          </button>
        </div>
      )}

      {/* Tour replay button */}
      <button
        onClick={startCatalogTour}
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

function EarningCardSkeleton() {
  return (
    <div className="animate-pulse" style={{
      flexShrink: 0, width: 148,
      background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 7
    }}>
      <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, background: '#e2e8f0' }} />
      <div style={{ height: '16px', borderRadius: '20px', background: '#e2e8f0', width: '55%' }} />
      <div style={{ height: '12px', borderRadius: '4px', background: '#f1f5f9', width: '90%' }} />
      <div style={{ height: '12px', borderRadius: '4px', background: '#f1f5f9', width: '70%' }} />
    </div>
  )
}

// EarningCard — campaign-level (groups by campaign_title, no single ASIN)
// item fields: campaign_title, asin_count, total_income, total_revenue, total_units, max_rate, top_asin
function EarningCard({ item }) {
  const initial = (item.campaign_title?.[0] || '?').toUpperCase()
  const income = Number(item.total_income)
  const units = Number(item.total_units)
  const rate = Number(item.max_rate)
  const asins = Number(item.asin_count)

  const imgSrc = item.top_asin
    ? `https://m.media-amazon.com/images/P/${item.top_asin}.jpg`
    : ''
  const [imgFailed, setImgFailed] = useState(!imgSrc)

  return (
    <div
      style={{
        flexShrink: 0, width: 148,
        background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12,
        padding: 12, display: 'flex', flexDirection: 'column', gap: 7,
        transition: 'box-shadow .15s, border-color .15s', cursor: 'default'
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = '#f97316' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e2e8f0' }}
    >
      {/* Product image or initial avatar */}
      <div style={{
        width: '100%', aspectRatio: '1', borderRadius: 8,
        background: '#f8fafc', display: 'flex', alignItems: 'center',
        justifyContent: 'center', overflow: 'hidden'
      }}>
        {!imgFailed && imgSrc ? (
          <img
            src={imgSrc}
            alt={item.campaign_title}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#94a3b8' }}>{initial}</span>
        )}
      </div>

      {/* Commission rate badge */}
      <span style={{
        fontSize: '0.7rem', fontWeight: 800,
        background: '#fff7ed', color: '#ea580c',
        padding: '2px 7px', borderRadius: 20,
        alignSelf: 'flex-start', letterSpacing: '0.02em', whiteSpace: 'nowrap'
      }}>
        {rate.toFixed(0)}% max
      </span>

      {/* Campaign title */}
      <div style={{
        fontSize: '0.7rem', fontWeight: 600, color: '#0f172a',
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
      }}>
        {item.campaign_title}
      </div>

      {/* Income earned */}
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#16a34a' }}>
        ${income.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      {/* Units + product count */}
      <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 'auto' }}>
        {units > 0 && <span>{units.toLocaleString()} unit{units !== 1 ? 's' : ''}</span>}
        {units > 0 && asins > 0 && <span> · </span>}
        {asins > 0 && <span>{asins} product{asins !== 1 ? 's' : ''}</span>}
      </div>
    </div>
  )
}
