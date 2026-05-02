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
  const [showLegend, setShowLegend] = useState(false)
  const [totalCatalogCount, setTotalCatalogCount] = useState(null)

  // Already-Earning panel state
  const [earningItems, setEarningItems] = useState([])
  const [earningPreset, setEarningPreset] = useState('7')
  const [earningOpen, setEarningOpen] = useState(true)
  const [earningLoading, setEarningLoading] = useState(false)

  // Queue state — map of campaign_id → 'pending' | 'accepted' | 'failed'
  const [queueStatus, setQueueStatus] = useState({})
  const [queueFilter, setQueueFilter] = useState('all') // 'all' | 'queued' | 'accepted'

  const tourStartedRef = useRef(false)

  function startCatalogTour() {
    const allSteps = [
      { element: '#catalog-earning-panel', popover: { title: 'Already Earning', description: "Campaigns you're currently earning from — see your top performers at a glance.", side: 'bottom', align: 'start' } },
      { element: '#catalog-filter-bar', popover: { title: 'Filter Bar', description: 'Search by brand or keyword, filter by date added, and set a minimum commission %.' , side: 'bottom', align: 'start' } },
      { element: '#catalog-sort-row', popover: { title: 'Sort & Filter', description: 'Sort by highest rate, newest first, or ending soonest.', side: 'bottom', align: 'start' } },
      { element: '#catalog-niches-btn', popover: { title: 'My Niches', description: 'Set your categories once — your default view only shows relevant campaigns for your niche.', side: 'bottom', align: 'start' } },
      { element: '#catalog-grid', popover: { title: 'Campaign Grid', description: 'Every card shows product image, commission %, category, and dates. Click CC → to accept on Amazon.', side: 'top', align: 'start' } },
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

      // Load queue statuses for all campaigns
      const { data: queued } = await supabase
        .from('user_campaign_queue')
        .select('campaign_id, status')
        .eq('user_id', session.user.id)
      if (queued) {
        const map = {}
        queued.forEach(r => { map[r.campaign_id] = r.status })
        setQueueStatus(map)
      }

      fetchEarning('7')

      // One-time total count across the entire catalog (no filters)
      const { count: total } = await supabase
        .from('cc_campaign_catalog')
        .select('*', { count: 'exact', head: true })
      if (total) setTotalCatalogCount(total)
    }
    init()
  }, [])

  async function handleQueueToggle(campaignId) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const currentStatus = queueStatus[campaignId]
    // Only allow toggling pending off; accepted campaigns stay accepted
    if (currentStatus === 'accepted') return
    if (currentStatus === 'pending') {
      await supabase.from('user_campaign_queue')
        .delete()
        .eq('user_id', session.user.id)
        .eq('campaign_id', campaignId)
      setQueueStatus(prev => { const next = { ...prev }; delete next[campaignId]; return next })
    } else {
      await supabase.from('user_campaign_queue')
        .upsert({ user_id: session.user.id, campaign_id: campaignId, status: 'pending' }, { onConflict: 'user_id,campaign_id' })
      setQueueStatus(prev => ({ ...prev, [campaignId]: 'pending' }))
    }
  }

  // Re-fetch from server when commission filter changes
  useEffect(() => {
    setCampaigns([])
    setDisplayLimit(DISPLAY_CHUNK)
    fetchCampaigns(filterMinRate)
  }, [filterMinRate])

  // Reset display slice when client-side filters change
  useEffect(() => {
    setDisplayLimit(DISPLAY_CHUNK)
  }, [search, categoryFilter, datePreset, sortBy])

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
          'campaign_id, campaign_name, brand_name, commission_rate, status, start_date, end_date, first_seen, primary_asin, asins, image_url, is_selected, browse_nodes',
          withCount ? { count: 'exact' } : undefined
        )
        .order('commission_rate', { ascending: false })
      if (minRate > 0) q = q.gte('commission_rate', minRate)
      return q.range(from, from + BATCH - 1)
    }

    // First request gives us count + first 1000 rows in one shot
    const { data: first, count, error } = await buildQuery(0, true)
    if (error || !first) { setLoading(false); return }

    // Render immediately with first batch — user sees content right away
    setCampaigns(first)
    setLoading(false)

    if (!count || count <= BATCH) {
      cacheSet(cacheKey, first)
      return
    }

    // Load remaining batches in the background — UI stays responsive
    const extraBatches = Math.ceil((count - BATCH) / BATCH)
    const results = await Promise.all(
      Array.from({ length: extraBatches }, (_, i) =>
        buildQuery((i + 1) * BATCH).then(r => r.data || [])
      )
    )

    const all = [first, ...results].flat()
    setCampaigns(all)
    cacheSet(cacheKey, all)
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
    const matchesPlatform = true
    const matchesQueue =
      queueFilter === 'all' ? true :
      queueFilter === 'queued' ? (queueStatus[c.campaign_id] === 'pending') :
      queueFilter === 'accepted' ? (queueStatus[c.campaign_id] === 'accepted') :
      true
    return matchesSearch && matchesCategory && matchesDate && matchesPlatform && matchesQueue
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
    <div style={{ minHeight: '100vh', background: '#fbf7f3', fontFamily: 'Inter, sans-serif', color: '#1a1410' }}>

      {/* Badge Legend Modal */}
      {showLegend && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(26,20,16,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setShowLegend(false)}>
          <div style={{ background: '#fff', borderRadius: 28, padding: 32, width: '100%', maxWidth: 420, boxShadow: '0 30px 80px -20px rgba(26,20,16,0.4)' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>Reference</p>
            <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.6rem', color: '#1a1410', letterSpacing: '-0.02em', margin: '0 0 22px' }}>Badge guide</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[
                { label: 'Accepted', bg: '#fdf2f8', color: '#9d174d', desc: "You've accepted this campaign. It's live on your storefront." },
                { label: 'Ends today', bg: '#1a1410', color: '#fbf7f3', desc: 'Campaign ends within 7 days. Promote now.' },
                { label: 'Active', bg: 'transparent', color: '#ec4899', isText: true, desc: 'Currently accepting creators.' },
              ].map(({ label, bg, color, desc, isText }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <span style={{
                    fontSize: '0.6rem', fontWeight: 700, padding: '4px 10px',
                    borderRadius: 999, letterSpacing: '0.14em', textTransform: 'uppercase',
                    whiteSpace: 'nowrap', flexShrink: 0, background: bg, color,
                    minWidth: 90, textAlign: 'center',
                  }}>{label}</span>
                  <p style={{ fontSize: '0.85rem', color: '#7a6b5d', lineHeight: 1.5, margin: 0 }}>{desc}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowLegend(false)}
              style={{ marginTop: 28, width: '100%', padding: 14, borderRadius: 999, background: '#1a1410', color: '#fbf7f3', border: 'none', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.01em' }}
              onMouseEnter={e => e.currentTarget.style.background = '#2a1f18'}
              onMouseLeave={e => e.currentTarget.style.background = '#1a1410'}
            >Close</button>
          </div>
        </div>
      )}

      {/* Edit Niches Modal */}
      {editingNiches && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(26,20,16,0.5)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#fff', borderRadius: 28, padding: 32, width: '100%', maxWidth: 480, boxShadow: '0 30px 80px -20px rgba(26,20,16,0.4)' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>Personalize</p>
            <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.7rem', color: '#1a1410', letterSpacing: '-0.02em', margin: '0 0 8px' }}>Your <em style={{ color: '#ec4899', fontStyle: 'italic' }}>niches</em></h2>
            <p style={{ fontSize: '0.88rem', color: '#7a6b5d', margin: '0 0 24px', lineHeight: 1.5 }}>Pick the categories you promote — we'll filter to those by default.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
              {Object.keys(CATEGORY_KEYWORDS).map(cat => {
                const on = pendingNiches.includes(cat)
                return (
                  <button
                    key={cat}
                    onClick={() => setPendingNiches(prev => on ? prev.filter(c => c !== cat) : [...prev, cat])}
                    style={{
                      fontSize: '0.78rem', fontWeight: on ? 600 : 500,
                      padding: '7px 16px', borderRadius: 999,
                      border: 'none',
                      background: on ? '#1a1410' : '#faf5ef',
                      color: on ? '#fbf7f3' : '#7a6b5d',
                      cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.01em',
                      transition: 'all .15s',
                    }}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setEditingNiches(false)}
                style={{ fontSize: '0.88rem', color: '#7a6b5d', padding: '12px 22px', cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit', fontWeight: 500 }}
                onMouseEnter={e => e.currentTarget.style.color = '#1a1410'}
                onMouseLeave={e => e.currentTarget.style.color = '#7a6b5d'}
              >
                Cancel
              </button>
              <button
                onClick={saveNiches}
                disabled={savingNiches}
                style={{
                  fontSize: '0.88rem', fontWeight: 600,
                  background: savingNiches ? '#d4c5b3' : '#ec4899', color: '#fff',
                  padding: '12px 26px', borderRadius: 999,
                  border: 'none', cursor: savingNiches ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', letterSpacing: '0.01em',
                }}
                onMouseEnter={e => { if (!savingNiches) e.currentTarget.style.background = '#db2777' }}
                onMouseLeave={e => { if (!savingNiches) e.currentTarget.style.background = '#ec4899' }}
              >
                {savingNiches ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AppHeader page="catalog" storeName={storeName} onSignOut={handleSignOut} />

      {/* Already Earning Panel */}
      {(earningItems.length > 0 || earningLoading) && (
        <div id="catalog-earning-panel" style={{ background: '#fff', borderBottom: '1px solid #f1ebe5' }}>
          <div
            onClick={() => setEarningOpen(o => !o)}
            style={{
              padding: '14px 28px', display: 'flex', alignItems: 'center',
              gap: 16, cursor: 'pointer', userSelect: 'none',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Already earning
            </span>
            {earningLoading ? (
              <span style={{ fontSize: '0.82rem', color: '#a89485', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Loading…</span>
            ) : (
              <span style={{ fontSize: '0.85rem', color: '#7a6b5d' }}>
                <strong style={{ color: '#1a1410', fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                  ${earningItems.reduce((s, x) => s + Number(x.total_income), 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </strong>
                {' · '}{earningItems.length} campaigns{' · '}{earningPreset === 'all' ? 'all time' : `last ${earningPreset}d`}
              </span>
            )}
            <div style={{ display: 'flex', gap: 4, background: '#faf5ef', borderRadius: 999, padding: 3 }} onClick={e => e.stopPropagation()}>
              {['7', '30', '90', 'all'].map(p => {
                const active = earningPreset === p
                return (
                  <button
                    key={p}
                    onClick={() => handleEarningPreset(p)}
                    style={{
                      fontSize: '0.7rem', fontWeight: active ? 600 : 500,
                      padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                      border: 'none',
                      background: active ? '#1a1410' : 'transparent',
                      color: active ? '#fbf7f3' : '#7a6b5d',
                      whiteSpace: 'nowrap', transition: 'all .15s',
                      fontFamily: 'inherit', letterSpacing: '0.02em',
                    }}
                  >
                    {p === 'all' ? 'All' : `${p}d`}
                  </button>
                )
              })}
            </div>
            <Link
              to="/earnings"
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: '0.74rem', fontWeight: 600, color: '#ec4899',
                textDecoration: 'none', whiteSpace: 'nowrap', letterSpacing: '0.02em',
              }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              View all →
            </Link>
            <span style={{
              marginLeft: 'auto', fontSize: '0.7rem', color: '#a89485',
              display: 'inline-block',
              transform: earningOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform .2s',
            }}>▼</span>
          </div>

          {earningOpen && (
            earningLoading ? (
              <div style={{ overflowX: 'auto', padding: '4px 28px 20px', display: 'flex', gap: 14 }}>
                {Array.from({ length: 6 }).map((_, i) => <EarningCardSkeleton key={i} />)}
              </div>
            ) : (
              <div style={{
                overflowX: 'auto', padding: '4px 28px 20px',
                display: 'flex', gap: 14,
                scrollbarWidth: 'thin', scrollbarColor: '#f1ebe5 transparent',
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
        background: 'rgba(251,247,243,0.92)',
        backdropFilter: 'saturate(140%) blur(12px)',
        WebkitBackdropFilter: 'saturate(140%) blur(12px)',
        borderBottom: '1px solid #f1ebe5',
        position: 'sticky', top: 64, zIndex: 20,
      }}>
        <div style={{ padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search brand or product…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: '1px solid #f1ebe5', borderRadius: 999,
              padding: '9px 18px', fontSize: '0.85rem',
              background: '#fff', color: '#1a1410', outline: 'none', minWidth: 220,
              fontFamily: 'inherit', transition: 'border-color .15s',
            }}
            onFocus={e => e.target.style.borderColor = '#ec4899'}
            onBlur={e => e.target.style.borderColor = '#f1ebe5'}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Added</span>
            <div style={{ display: 'flex', gap: 3, background: '#fff', borderRadius: 999, padding: 3, border: '1px solid #f1ebe5' }}>
              {['all', '1', '7', '30'].map(p => {
                const isActive = datePreset === p
                return (
                  <button
                    key={p}
                    onClick={() => setDatePreset(p)}
                    style={{
                      fontSize: '0.7rem', fontWeight: isActive ? 600 : 500,
                      padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                      border: 'none',
                      background: isActive ? '#1a1410' : 'transparent',
                      color: isActive ? '#fbf7f3' : '#7a6b5d',
                      whiteSpace: 'nowrap', transition: 'all .15s',
                      fontFamily: 'inherit', letterSpacing: '0.02em',
                    }}
                  >
                    {p === 'all' ? 'All' : `${p}d`}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Min %</span>
            <input
              type="number"
              value={minRateInput}
              min={0} max={100}
              onChange={e => setMinRateInput(e.target.value)}
              onBlur={e => {
                e.target.style.borderColor = '#f1ebe5'
                const v = Number(minRateInput) || 0
                if (v !== filterMinRate) setFilterMinRate(v)
              }}
              onKeyDown={e => { if (e.key === 'Enter') { const v = Number(minRateInput) || 0; setFilterMinRate(v); e.target.blur() } }}
              style={{
                width: 64, border: '1px solid #f1ebe5', borderRadius: 999,
                padding: '7px 14px', fontSize: '0.85rem',
                background: '#fff', color: '#1a1410', outline: 'none',
                fontFamily: 'inherit',
              }}
              onFocus={e => e.target.style.borderColor = '#ec4899'}
            />
          </div>

          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{
              border: '1px solid #f1ebe5', borderRadius: 999,
              padding: '8px 16px', fontSize: '0.82rem',
              background: '#fff', color: '#1a1410', outline: 'none',
              fontFamily: 'inherit', cursor: 'pointer',
            }}
            onFocus={e => e.target.style.borderColor = '#ec4899'}
            onBlur={e => e.target.style.borderColor = '#f1ebe5'}
          >
            {userCategories.length > 0 && <option value="niches">★ My niches</option>}
            <option value="all">All categories</option>
            <option disabled>─────────────</option>
            {Object.keys(CATEGORY_KEYWORDS).map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Queue</span>
            <div style={{ display: 'flex', gap: 3, background: '#fff', borderRadius: 999, padding: 3, border: '1px solid #f1ebe5' }}>
              {[['all', 'All'], ['queued', 'Queued'], ['accepted', 'Accepted']].map(([val, label]) => {
                const isActive = queueFilter === val
                return (
                  <button
                    key={val}
                    onClick={() => setQueueFilter(val)}
                    style={{
                      fontSize: '0.7rem', fontWeight: isActive ? 600 : 500,
                      padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                      border: 'none',
                      background: isActive ? (val === 'accepted' ? '#166534' : val === 'queued' ? '#9d174d' : '#1a1410') : 'transparent',
                      color: isActive ? '#fff' : '#7a6b5d',
                      whiteSpace: 'nowrap', transition: 'all .15s',
                      fontFamily: 'inherit', letterSpacing: '0.02em',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <button
            id="catalog-niches-btn"
            onClick={() => { setPendingNiches(userCategories); setEditingNiches(true) }}
            style={{
              fontSize: '0.78rem', fontWeight: 600, color: '#ec4899',
              background: 'none', border: '1px solid #fbcfe8', borderRadius: 999,
              padding: '7px 16px', cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'inherit', letterSpacing: '0.01em',
              transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fdf2f8' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            {userCategories.length > 0 ? `My niches · ${userCategories.length}` : 'Set up niches →'}
          </button>
        </div>

        <div id="catalog-sort-row" style={{ padding: '12px 28px', display: 'flex', alignItems: 'center', gap: 14, borderTop: '1px solid #f5ede5', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: '#7a6b5d' }}>
            {loading && campaigns.length === 0 ? (
              <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#a89485' }}>Loading…</span>
            ) : (
              <>
                <strong style={{ color: '#1a1410', fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>{displayed.length.toLocaleString()}</strong>
                {' of '}
                <strong style={{ color: '#1a1410', fontWeight: 600 }}>{sorted.length.toLocaleString()}</strong>
                {' campaigns'}
                {totalCatalogCount && (
                  <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#a89485' }}>
                    {'· '}
                    <span style={{ color: '#ec4899', fontWeight: 600 }}>{totalCatalogCount.toLocaleString()}</span>
                    {' total in catalog'}
                  </span>
                )}
              </>
            )}
          </span>

          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Sort</span>
            <div style={{ display: 'flex', gap: 3, background: '#fff', borderRadius: 999, padding: 3, border: '1px solid #f1ebe5' }}>
              {[
                { value: 'rate', label: 'Rate' },
                { value: 'newest', label: 'Newest' },
                { value: 'oldest', label: 'Oldest' },
                { value: 'brand', label: 'Brand A–Z' },
                { value: 'ending', label: 'Ending' },
              ].map(({ value, label }) => {
                const isActive = sortBy === value
                return (
                  <button
                    key={value}
                    onClick={() => setSortBy(value)}
                    style={{
                      fontSize: '0.7rem', fontWeight: isActive ? 600 : 500,
                      padding: '4px 12px', borderRadius: 999,
                      cursor: 'pointer', border: 'none',
                      background: isActive ? '#1a1410' : 'transparent',
                      color: isActive ? '#fbf7f3' : '#7a6b5d',
                      whiteSpace: 'nowrap', transition: 'all .15s',
                      fontFamily: 'inherit', letterSpacing: '0.02em',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          <button
            onClick={() => setShowLegend(true)}
            style={{
              fontSize: '0.74rem', color: '#7a6b5d', background: 'none',
              border: '1px solid #f1ebe5', borderRadius: 999,
              padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: 'inherit', fontWeight: 500,
              transition: 'all .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#1a1410'; e.currentTarget.style.borderColor = '#e8dfd6' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#7a6b5d'; e.currentTarget.style.borderColor = '#f1ebe5' }}
          >
            Badge guide
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 18,
          padding: '32px 28px',
        }}>
          {Array.from({ length: 24 }).map((_, i) => <CampaignCardSkeleton key={i} />)}
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '120px 24px', gap: 14 }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase', margin: 0 }}>Nothing here</p>
          <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '2rem', color: '#1a1410', letterSpacing: '-0.02em', margin: 0 }}>No campaigns <em style={{ color: '#ec4899', fontStyle: 'italic' }}>match</em>.</h2>
          <p style={{ fontSize: '0.95rem', color: '#7a6b5d', margin: 0 }}>Try loosening your filters.</p>
        </div>
      ) : (
        <div id="catalog-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 18,
          padding: '32px 28px',
        }}>
          {displayed.map(c => (
            <CampaignCard
              key={c.campaign_id}
              campaign={c}
              creatorId={creatorId}
              queueStatus={queueStatus[c.campaign_id] || null}
              onQueueToggle={handleQueueToggle}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 28px 64px' }}>
          <button
            onClick={() => setDisplayLimit(p => p + DISPLAY_CHUNK)}
            disabled={loading}
            style={{
              border: 'none', background: '#1a1410', color: '#fbf7f3',
              borderRadius: 999, padding: '14px 32px',
              fontSize: '0.88rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1, transition: 'background .15s, transform .12s',
              fontFamily: 'inherit', letterSpacing: '0.01em',
              boxShadow: '0 14px 32px -16px rgba(26,20,16,0.3)',
            }}
            onMouseEnter={e => { if (!loading) { e.target.style.background = '#2a1f18'; e.target.style.transform = 'translateY(-1px)' } }}
            onMouseLeave={e => { e.target.style.background = '#1a1410'; e.target.style.transform = 'none' }}
          >
            {loading ? 'Loading…' : `Show ${Math.min(DISPLAY_CHUNK, sorted.length - displayLimit)} more`}
          </button>
        </div>
      )}

      <button
        onClick={startCatalogTour}
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

function EarningCardSkeleton() {
  return (
    <div className="animate-pulse" style={{
      flexShrink: 0, width: 148,
      background: '#fbf7f3', border: '1px solid #f1ebe5', borderRadius: 14,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 7
    }}>
      <div style={{ width: '100%', aspectRatio: '1', borderRadius: 10, background: '#f5ede5' }} />
      <div style={{ height: '16px', borderRadius: '20px', background: '#f5ede5', width: '55%' }} />
      <div style={{ height: '12px', borderRadius: '4px', background: '#faf5ef', width: '90%' }} />
      <div style={{ height: '12px', borderRadius: '4px', background: '#faf5ef', width: '70%' }} />
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
        background: '#ffffff', border: '1px solid #f1ebe5', borderRadius: 14,
        padding: 12, display: 'flex', flexDirection: 'column', gap: 7,
        transition: 'box-shadow .15s, border-color .15s, transform .15s', cursor: 'default'
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 14px 32px -18px rgba(26,20,16,0.18)'; e.currentTarget.style.borderColor = '#fbcfe8'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#f1ebe5'; e.currentTarget.style.transform = 'none' }}
    >
      {/* Product image or initial avatar */}
      <div style={{
        width: '100%', aspectRatio: '1', borderRadius: 10,
        background: '#faf5ef', display: 'flex', alignItems: 'center',
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
          <span style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 600, color: '#a89485', fontStyle: 'italic' }}>{initial}</span>
        )}
      </div>

      {/* Commission rate badge */}
      <span style={{
        fontSize: '0.66rem', fontWeight: 700,
        background: '#fdf2f8', color: '#9d174d',
        padding: '3px 9px', borderRadius: 999,
        alignSelf: 'flex-start', letterSpacing: '0.04em', whiteSpace: 'nowrap',
        textTransform: 'uppercase'
      }}>
        {rate.toFixed(0)}% max
      </span>

      {/* Campaign title */}
      <div style={{
        fontFamily: 'Georgia, serif', fontSize: '0.78rem', fontWeight: 500, color: '#1a1410',
        lineHeight: 1.25,
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
      }}>
        {item.campaign_title}
      </div>

      {/* Income earned */}
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.95rem', fontWeight: 600, color: '#ec4899', letterSpacing: '-0.01em' }}>
        ${income.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>

      {/* Units + product count */}
      <div style={{ fontSize: '0.66rem', color: '#a89485', marginTop: 'auto', letterSpacing: '0.02em' }}>
        {units > 0 && <span>{units.toLocaleString()} unit{units !== 1 ? 's' : ''}</span>}
        {units > 0 && asins > 0 && <span> · </span>}
        {asins > 0 && <span>{asins} product{asins !== 1 ? 's' : ''}</span>}
      </div>
    </div>
  )
}
