import { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { CampaignCard, CampaignCardSkeleton } from '../components/CampaignCard'

// Helper: session cache
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
  try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

const SUMMARY_TTL = 5 * 60 * 1000  // 5 min

function fmt$(n, decimals = 2) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export default function DashboardPage() {
  const [storeName, setStoreName] = useState('')
  const [user, setUser] = useState(null)
  const [creatorId, setCreatorId] = useState(null)

  // Earnings
  const [earning30, setEarning30] = useState(null)   // get_earning_summary(30)
  const [earningAll, setEarningAll] = useState(null) // get_earning_summary(null)

  // Catalog snapshot
  const [catalogSnap, setCatalogSnap] = useState(null) // { total, active, accepted }

  // Ad health (today's spend)
  const [adToday, setAdToday] = useState(null) // { spend, adsets }

  // What to promote next
  const [activeCampaigns, setActiveCampaigns] = useState(null) // null = not yet loaded
  const [endingSoonCampaigns, setEndingSoonCampaigns] = useState([])
  const [newThisWeek, setNewThisWeek] = useState(null)
  const [earningsGoal, setEarningsGoal] = useState(null)

  const [loadingEarnings, setLoadingEarnings] = useState(true)
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [loadingAd, setLoadingAd] = useState(true)
  const [loadingNewCampaigns, setLoadingNewCampaigns] = useState(true)
  const tourStartedRef = useRef(false)

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  useEffect(() => {
    async function init() {
      const { data: { session: _session } } = await supabase.auth.getSession()
      const session = _session ?? (import.meta.env.VITE_MOCK === 'true' ? { user: { id: 'mock', email: 'jen@example.com' } } : null)
      if (!session) { window.location.href = '/login'; return }
      setUser(session.user)
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('store_name, categories, creator_id')
        .eq('id', session.user.id)
        .single()
      if (prefs?.store_name) setStoreName(prefs.store_name)
      if (prefs?.creator_id) setCreatorId(prefs.creator_id)
      await Promise.all([
        fetchEarnings(),
        fetchCatalogSnap(),
        fetchAdToday(),
        fetchNewThisWeek(),
        fetchEarningsGoal(session.user.id),
      ])
    }
    init()
  }, [])

  async function fetchEarnings() {
    setLoadingEarnings(true)
    const cached30 = cacheGet('dash_earning_30', SUMMARY_TTL)
    const cachedAll = cacheGet('dash_earning_all', SUMMARY_TTL)
    let d30 = cached30, dAll = cachedAll
    if (!d30) {
      const { data } = await supabase.rpc('get_earning_summary', { days_back: 30 })
      d30 = data || []
      cacheSet('dash_earning_30', d30)
    }
    if (!dAll) {
      const { data } = await supabase.rpc('get_earning_summary', { days_back: null })
      dAll = data || []
      cacheSet('dash_earning_all', dAll)
    }
    setEarning30(d30)
    setEarningAll(dAll)
    setLoadingEarnings(false)
  }

  async function fetchCatalogSnap() {
    setLoadingCatalog(true)
    const ck = 'dash_catalog_snap_v5'
    const cached = cacheGet(ck, SUMMARY_TTL)
    if (cached) {
      setCatalogSnap(cached)
      setEndingSoonCampaigns(cached.endingSoonList || [])
      // Restore active campaigns for "What to Promote Next" from sessionStorage side-channel
      const storedCampaigns = sessionStorage.getItem('dash_active_campaigns')
      if (storedCampaigns) {
        try { setActiveCampaigns(JSON.parse(storedCampaigns)) } catch {}
      }
      setLoadingCatalog(false)
      return
    }

    // Fetch all campaigns — lightweight fields only, no row limit concerns
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)

    const { data: allRows, error: fetchErr } = await supabase
      .from('cc_campaign_catalog')
      .select('campaign_id, campaign_name, brand_name, primary_asin, commission_rate, status, is_selected, end_date')
      .range(0, 1999)

    if (fetchErr) console.error('fetchCatalogSnap error:', fetchErr)
    const rows = allRows || []

    const delivering = rows.filter(c => c.status?.toUpperCase() === 'DELIVERING')
    const scheduled  = rows.filter(c => c.status?.toUpperCase() === 'SCHEDULED')
    const active     = [...delivering, ...scheduled]
    const highRateCampaigns = delivering.filter(c => Number(c.commission_rate) >= 20)
    const endingSoonList = active.filter(c => {
      if (!c.end_date) return false
      const ms = new Date(c.end_date + 'T23:59:59') - Date.now()
      return ms > 0 && ms < 7 * 24 * 60 * 60 * 1000
    }).sort((a, b) => new Date(a.end_date) - new Date(b.end_date)).slice(0, 5)
    const snap = {
      active: active.length,
      delivering: delivering.length,
      scheduled: scheduled.length,
      endingSoon: endingSoonList.length,
      endingSoonList,
    }
    cacheSet(ck, snap)
    setCatalogSnap(snap)
    setActiveCampaigns(highRateCampaigns)
    setEndingSoonCampaigns(endingSoonList)
    sessionStorage.setItem('dash_active_campaigns', JSON.stringify(highRateCampaigns))
    setLoadingCatalog(false)
  }

  async function fetchAdToday() {
    setLoadingAd(true)
    const today = new Date().toISOString().slice(0, 10)
    const ck = `dash_ad_today_${today}`
    const cached = cacheGet(ck, SUMMARY_TTL)
    if (cached) { setAdToday(cached); setLoadingAd(false); return }

    try {
      // Pull Meta credentials from user_integrations (same source as AdHealthPage)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setAdToday(null); setLoadingAd(false); return }

      const { data: intg } = await supabase
        .from('user_integrations')
        .select('access_token, ad_account_id')
        .eq('user_id', session.user.id)
        .eq('integration_type', 'meta_ads')
        .maybeSingle()

      if (!intg?.access_token || !intg?.ad_account_id) { setAdToday(null); setLoadingAd(false); return }

      const accountId = intg.ad_account_id.startsWith('act_') ? intg.ad_account_id : `act_${intg.ad_account_id}`
      const params = new URLSearchParams({
        level: 'adset',
        fields: 'adset_id,spend',
        time_range: JSON.stringify({ since: today, until: today }),
        limit: 500,
        access_token: intg.access_token,
      })
      const resp = await fetch(`https://graph.facebook.com/v20.0/${accountId}/insights?${params}`)
      const json = await resp.json()

      if (json.error || !json.data?.length) { setAdToday(null); setLoadingAd(false); return }

      const totalSpend = json.data.reduce((s, r) => s + Number(r.spend), 0)
      const adsets = new Set(json.data.map(r => r.adset_id)).size
      const result = { spend: totalSpend, adsets, label: 'Today' }
      cacheSet(ck, result)
      setAdToday(result)
    } catch (e) {
      console.error('fetchAdToday error:', e)
      setAdToday(null)
    }
    setLoadingAd(false)
  }

  async function fetchNewThisWeek() {
    setLoadingNewCampaigns(true)
    const ck = 'dash_new_this_week_v2'
    const cached = cacheGet(ck, SUMMARY_TTL)
    if (cached) { setNewThisWeek(cached); setLoadingNewCampaigns(false); return }
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('cc_campaign_catalog')
      .select('campaign_id, campaign_name, brand_name, commission_rate, status, start_date, end_date, first_seen, social_platforms, primary_asin, asins, image_url, is_selected, browse_nodes')
      .gte('first_seen', sevenDaysAgo)
      .order('commission_rate', { ascending: false })
      .limit(6)
    if (error) console.error('fetchNewThisWeek error:', error)
    const result = data || []
    cacheSet(ck, result)
    setNewThisWeek(result)
    setLoadingNewCampaigns(false)
  }

  async function fetchEarningsGoal(uid) {
    try {
      const { data } = await supabase
        .from('user_preferences')
        .select('monthly_earnings_goal')
        .eq('id', uid)
        .maybeSingle()
      setEarningsGoal(data?.monthly_earnings_goal ?? null)
    } catch { /* column may not exist yet */ }
  }

  function startTour() {
    const allSteps = [
      { element: '#stat-earnings-30', popover: { title: 'Earnings (30d)', description: 'Your total income from Creator Connections campaigns in the last 30 days.', side: 'bottom', align: 'start' } },
      { element: '#stat-ad-spend', popover: { title: 'Ad Spend Today', description: 'Live Meta Ads spend across all ad sets — pulled directly from your account.', side: 'bottom', align: 'start' } },
      { element: '#stat-active-campaigns', popover: { title: 'Active Campaigns', description: 'Campaigns currently delivering or scheduled on Amazon Creator Connections.', side: 'bottom', align: 'start' } },
      { element: '#earnings-goal', popover: { title: 'Monthly Goal', description: 'Your earnings target for the month. Set it in Settings → Monthly Earnings Goal.', side: 'top', align: 'start' } },
      { element: '#what-to-promote', popover: { title: 'What to Promote', description: "High-commission campaigns you haven't promoted yet — your best revenue opportunities.", side: 'top', align: 'start' } },
      { element: '#new-this-week', popover: { title: 'New This Week', description: 'Campaigns just added to Amazon CC — get in early for maximum exposure.', side: 'top', align: 'start' } },
      { element: '#nav-catalog', popover: { title: 'Campaign Catalog', description: 'Browse 10,000+ live Amazon CC campaigns filtered to your niches. Click CC → to accept.', side: 'bottom', align: 'start' } },
      { element: '#nav-earnings', popover: { title: 'Earnings', description: 'Detailed income breakdown by campaign and ASIN, filterable by time period.', side: 'bottom', align: 'start' } },
      { element: '#nav-ad-health', popover: { title: 'Ad Health', description: 'Live Meta Ads placement analysis — identify wasted spend and underperforming placements.', side: 'bottom', align: 'start' } },
      { element: '#nav-settings', popover: { title: 'Settings', description: 'Connect Meta Ads, set your niche categories, and configure your monthly earnings goal.', side: 'bottom', align: 'start' } },
    ]
    const steps = allSteps.filter(s => document.querySelector(s.element))
    if (steps.length === 0) return
    const d = driver({
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Done ✓',
      onDestroyed: () => localStorage.setItem('ps_tour_done_v1', '1'),
      steps,
    })
    d.drive()
  }

  // Auto-start tour on first visit
  useEffect(() => {
    if (loadingEarnings || loadingCatalog || loadingAd || loadingNewCampaigns) return
    if (tourStartedRef.current) return
    tourStartedRef.current = true
    if (localStorage.getItem('ps_tour_done_v1')) return
    const t = setTimeout(startTour, 800)
    return () => clearTimeout(t)
  }, [loadingEarnings, loadingCatalog, loadingAd, loadingNewCampaigns])

  // Derive top campaign from earning30
  const topCampaign = useMemo(() => {
    if (!earning30 || earning30.length === 0) return null
    return earning30.reduce((best, c) => Number(c.total_income) > Number(best.total_income) ? c : best, earning30[0])
  }, [earning30])

  const income30 = useMemo(() => (earning30 || []).reduce((s, c) => s + Number(c.total_income), 0), [earning30])
  const incomeAll = useMemo(() => (earningAll || []).reduce((s, c) => s + Number(c.total_income), 0), [earningAll])

  // What to promote: find active campaigns not in earningAll by campaign title match
  const { whatToPromote, promoteDebug } = useMemo(() => {
    if (!earningAll || !activeCampaigns) return { whatToPromote: [], promoteDebug: null }
    const earnedTitles = new Set(earningAll.map(r => r.campaign_title?.toLowerCase()))
    const unearned = activeCampaigns.filter(c => !earnedTitles.has(c.campaign_name?.toLowerCase()))
    const items = unearned.sort((a, b) => Number(b.commission_rate) - Number(a.commission_rate)).slice(0, 6)
    return {
      whatToPromote: items,
      promoteDebug: {
        deliveringHighRate: activeCampaigns.length,
        alreadyPromoted: activeCampaigns.length - unearned.length,
      }
    }
  }, [earningAll, activeCampaigns])

  const statCard = (label, value, sub, color = '#1a1410', loading = false, id = undefined) => (
    <div id={id} style={{
      background: '#fff', borderRadius: 22, padding: '24px 26px',
      border: '1px solid #f1ebe5', flex: '1 1 180px', minWidth: 0,
    }}>
      <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', color: '#a89485', marginBottom: 12 }}>{label}</div>
      {loading ? (
        <>
          <div className="dash-skel" style={{ height: 30, width: '60%' }} />
          <div className="dash-skel" style={{ height: 12, width: '40%', marginTop: 8 }} />
        </>
      ) : (
        <div style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '2rem', color, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      )}
      {sub && !loading && <div style={{ fontSize: '0.74rem', color: '#a89485', marginTop: 8, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )

  const goalPct = earningsGoal ? Math.min(100, (income30 / earningsGoal) * 100) : 0
  const goalReached = earningsGoal && income30 >= earningsGoal

  return (
    <div style={{ minHeight: '100vh', background: '#fbf7f3', fontFamily: 'Inter, sans-serif', color: '#1a1410' }}>
      <style>{`
        @keyframes dash-shimmer {
          0%   { background-position: -600px 0 }
          100% { background-position:  600px 0 }
        }
        @keyframes dash-spin {
          to { transform: rotate(360deg) }
        }
        .dash-skel {
          background: linear-gradient(90deg, #f5ede5 25%, #faf5ef 50%, #f5ede5 75%);
          background-size: 600px 100%;
          animation: dash-shimmer 1.4s infinite linear;
          border-radius: 6px;
        }
      `}</style>
      <AppHeader page="dashboard" storeName={storeName} onSignOut={handleSignOut} />

      {(loadingEarnings || loadingCatalog || loadingAd) && (
        <div style={{ background: '#fdf2f8', borderBottom: '1px solid #fbcfe8', padding: '8px 28px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            border: '2px solid #ec4899', borderTopColor: 'transparent',
            animation: 'dash-spin 0.7s linear infinite',
          }} />
          <span style={{ fontSize: '0.7rem', color: '#9d174d', fontWeight: 600, letterSpacing: '0.04em' }}>Loading dashboard…</span>
        </div>
      )}

      {endingSoonCampaigns.length > 0 && (
        <div style={{ background: '#1a1410', padding: '10px 28px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#fbcfe8', letterSpacing: '0.2em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Ending soon</span>
          {endingSoonCampaigns.map(c => {
            const daysLeft = Math.ceil((new Date(c.end_date + 'T23:59:59') - Date.now()) / 86400000)
            return (
              <span key={c.campaign_id} style={{ fontSize: '0.7rem', color: '#fbf7f3', whiteSpace: 'nowrap' }}>
                {c.campaign_name} <span style={{ color: '#a89485' }}>· {daysLeft}d</span>
              </span>
            )
          })}
        </div>
      )}

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 28px 80px', display: 'flex', flexDirection: 'column', gap: 48 }}>

        {/* Editorial hero */}
        <div>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
            Dashboard · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 style={{
            fontFamily: 'Georgia, serif', fontWeight: 400,
            fontSize: 'clamp(2.2rem, 4.5vw, 3.4rem)', color: '#1a1410',
            letterSpacing: '-0.03em', lineHeight: 1.05, margin: 0,
          }}>
            {storeName ? <>Welcome back, <em style={{ color: '#ec4899', fontStyle: 'italic' }}>{storeName.split(' ')[0]}</em>.</> : <>Your day, <em style={{ color: '#ec4899', fontStyle: 'italic' }}>at a glance</em>.</>}
          </h1>
          <p style={{ fontSize: '1.02rem', color: '#7a6b5d', lineHeight: 1.55, maxWidth: 560, marginTop: 18, margin: '18px 0 0' }}>
            Earnings, ad spend, and the campaigns worth your attention — quietly considered.
          </p>
        </div>

        {/* Row 1: Key stats */}
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {statCard('Earnings · 30d', fmt$(income30, 0), `${(earning30 || []).length} campaigns`, '#ec4899', loadingEarnings, 'stat-earnings-30')}
            {statCard('Lifetime', fmt$(incomeAll, 0), `${(earningAll || []).length} tracked`, '#1a1410', loadingEarnings)}
            {statCard('Ad spend', adToday ? fmt$(adToday.spend) : '—', adToday ? `${adToday.label} · ${adToday.adsets} ad sets` : 'No spend today', '#1a1410', loadingAd, 'stat-ad-spend')}
            {statCard('Live campaigns', catalogSnap ? catalogSnap.active.toLocaleString() : '—', catalogSnap ? `${catalogSnap.delivering} delivering · ${catalogSnap.scheduled} scheduled` : null, '#1a1410', loadingCatalog, 'stat-active-campaigns')}
          </div>
        </div>

        {/* Earnings Goal — espresso card for premium feel */}
        {!loadingEarnings && earningsGoal && (
          <div id="earnings-goal" style={{
            background: '#1a1410', borderRadius: 28, padding: '32px 36px', color: '#fbf7f3',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -100, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.22), transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#fbcfe8', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Monthly goal</span>
                <Link to="/settings" style={{ fontSize: '0.74rem', color: '#a89485', textDecoration: 'none', letterSpacing: '0.04em' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#fbcfe8'}
                  onMouseLeave={e => e.currentTarget.style.color = '#a89485'}
                >Adjust →</Link>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '3rem', color: goalReached ? '#fbcfe8' : '#fbf7f3', letterSpacing: '-0.03em', lineHeight: 1 }}>{fmt$(income30, 0)}</span>
                <span style={{ fontSize: '0.95rem', color: '#a89485' }}>of {fmt$(earningsGoal, 0)}</span>
              </div>
              <div style={{ background: 'rgba(251,247,243,0.12)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${goalPct.toFixed(1)}%`,
                  background: goalReached ? '#fbcfe8' : '#ec4899',
                  borderRadius: 999,
                  transition: 'width 0.8s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                <span style={{ fontSize: '0.78rem', color: '#a89485' }}>
                  {goalReached ? 'Goal reached this month.' : `${fmt$(earningsGoal - income30, 0)} to go`}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#fbcfe8', fontWeight: 600 }}>
                  {Math.min(100, Math.round(goalPct))}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Row 2: Top earner + quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>

          {/* Top earning campaign */}
          <div style={{ background: '#fff', borderRadius: 22, border: '1px solid #f1ebe5', padding: '28px 30px' }}>
            <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
              Top campaign · 30d
            </div>
            {loadingEarnings ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="dash-skel" style={{ height: 22, width: '80%' }} />
                <div className="dash-skel" style={{ height: 28, width: '40%' }} />
                <div className="dash-skel" style={{ height: 12, width: '50%' }} />
              </div>
            ) : topCampaign ? (
              <div>
                <div style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.25rem', color: '#1a1410', letterSpacing: '-0.01em', marginBottom: 14, lineHeight: 1.25 }}>
                  {topCampaign.campaign_title}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '2rem', color: '#ec4899', letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {fmt$(topCampaign.total_income)}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#7a6b5d' }}>
                    {Number(topCampaign.total_units).toLocaleString()} units · {fmt$(topCampaign.total_revenue)} rev
                  </span>
                </div>
                {topCampaign.max_rate && (
                  <span style={{
                    display: 'inline-block', marginTop: 14,
                    fontSize: '0.66rem', fontWeight: 700, padding: '4px 12px',
                    borderRadius: 999, background: '#fdf2f8', color: '#9d174d',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>{Number(topCampaign.max_rate).toFixed(0)}% commission</span>
                )}
              </div>
            ) : (
              <p style={{ fontSize: '0.92rem', color: '#a89485', margin: 0 }}>No earnings data yet.</p>
            )}
          </div>

          {/* Quick links */}
          <div style={{ background: '#fff', borderRadius: 22, border: '1px solid #f1ebe5', padding: '28px 30px' }}>
            <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
              Where to go
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { to: '/', label: 'Campaigns', desc: 'Browse & accept' },
                { to: '/earnings', label: 'Earnings', desc: 'Income by product' },
                { to: '/ad-health', label: 'Ad Health', desc: 'Placement analysis' },
                { to: '/settings', label: 'Settings', desc: 'Connections & goals' },
              ].map(({ to, label, desc }) => (
                <Link
                  key={to}
                  to={to}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: 14,
                    textDecoration: 'none', transition: 'background .15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#faf5ef' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.02rem', color: '#1a1410', letterSpacing: '-0.01em' }}>{label}</span>
                    <span style={{ fontSize: '0.74rem', color: '#a89485' }}>{desc}</span>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: '#ec4899' }}>→</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* What to Promote Next */}
        <div id="what-to-promote">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 24, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>Worth your attention</p>
              <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '2rem', color: '#1a1410', letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
                What to <em style={{ color: '#ec4899', fontStyle: 'italic' }}>promote next</em>
              </h2>
              <p style={{ fontSize: '0.92rem', color: '#7a6b5d', marginTop: 10, marginBottom: 0, maxWidth: 560 }}>
                High-commission campaigns available now that you haven't promoted yet.
              </p>
            </div>
            <Link to="/" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#ec4899', textDecoration: 'none', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              See all campaigns →
            </Link>
          </div>
          {(loadingEarnings || loadingCatalog) ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="dash-skel" style={{ borderRadius: 18, height: 240 }} />
              ))}
            </div>
          ) : whatToPromote.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 22, border: '1px solid #f1ebe5', padding: '36px 32px', textAlign: 'center' }}>
              <p style={{ fontSize: '0.95rem', color: '#7a6b5d', margin: 0, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                {promoteDebug?.deliveringHighRate === 0 ? (
                  'No delivering campaigns at 20%+ commission right now.'
                ) : promoteDebug?.alreadyPromoted === promoteDebug?.deliveringHighRate ? (
                  `You're already promoting all ${promoteDebug.deliveringHighRate} available campaigns at 20%+.`
                ) : (
                  'No suggestions available right now.'
                )}
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
              {whatToPromote.map(c => {
                const imgSrc = c.primary_asin ? `https://m.media-amazon.com/images/P/${c.primary_asin}.jpg` : null
                return (
                  <div
                    key={c.campaign_id}
                    style={{
                      background: '#fff', borderRadius: 20, border: '1px solid #f1ebe5',
                      padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
                      transition: 'box-shadow .2s, border-color .2s, transform .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 12px 32px -16px rgba(26,20,16,0.18)'; e.currentTarget.style.borderColor = '#e8dfd6'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#f1ebe5'; e.currentTarget.style.transform = 'none' }}
                  >
                    {imgSrc && (
                      <img src={imgSrc} alt={c.campaign_name} loading="lazy"
                        style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: 14, background: '#faf5ef' }}
                        onError={e => { e.target.style.display = 'none' }}
                      />
                    )}
                    <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#1a1410', color: '#fbf7f3', alignSelf: 'flex-start', letterSpacing: '0.04em' }}>
                      {Number(c.commission_rate).toFixed(0)}%
                    </span>
                    <div style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '0.95rem', color: '#1a1410', letterSpacing: '-0.01em', lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {c.campaign_name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#a89485' }}>{c.brand_name}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* New This Week */}
        <div id="new-this-week">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 24, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>Just landed</p>
              <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '2rem', color: '#1a1410', letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
                New <em style={{ color: '#ec4899', fontStyle: 'italic' }}>this week</em>
              </h2>
              <p style={{ fontSize: '0.92rem', color: '#7a6b5d', marginTop: 10, marginBottom: 0, maxWidth: 560 }}>
                Campaigns added to Creator Connections in the last 7 days.
              </p>
            </div>
            <Link to="/" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#ec4899', textDecoration: 'none', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
              See all →
            </Link>
          </div>
          {loadingNewCampaigns ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
              {Array.from({ length: 6 }).map((_, i) => <CampaignCardSkeleton key={i} />)}
            </div>
          ) : !newThisWeek || newThisWeek.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 22, border: '1px solid #f1ebe5', padding: '36px 32px', textAlign: 'center' }}>
              <p style={{ fontSize: '0.95rem', color: '#7a6b5d', margin: 0, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>No new campaigns this week. Check back soon.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
              {newThisWeek.map(c => (
                <div key={c.campaign_id} style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1, fontSize: '0.58rem', fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: '#ec4899', color: '#fbf7f3', letterSpacing: '0.14em', textTransform: 'uppercase' }}>New</div>
                  <CampaignCard campaign={c} creatorId={creatorId} />
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Floating tour replay button */}
      <button
        onClick={startTour}
        title="Take the tour"
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 1000,
          background: '#1a1410', color: '#fbf7f3', border: 'none', borderRadius: 999,
          padding: '12px 22px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 14px 32px -12px rgba(26,20,16,0.4)',
          fontFamily: 'inherit', letterSpacing: '0.02em',
          display: 'flex', alignItems: 'center', gap: 8,
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
