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
      const { data: { session } } = await supabase.auth.getSession()
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
      { element: '#stat-earnings-30', popover: { title: '💰 Earnings (30d)', description: 'Your total income from Creator Connections campaigns in the last 30 days.', side: 'bottom', align: 'start' } },
      { element: '#stat-ad-spend', popover: { title: '📊 Ad Spend Today', description: 'Live Meta Ads spend across all ad sets — pulled directly from your account.', side: 'bottom', align: 'start' } },
      { element: '#stat-active-campaigns', popover: { title: '🏷 Active Campaigns', description: 'Campaigns currently delivering or scheduled on Amazon Creator Connections.', side: 'bottom', align: 'start' } },
      { element: '#earnings-goal', popover: { title: '🎯 Monthly Goal', description: 'Your earnings target for the month. Set it in Settings → Monthly Earnings Goal.', side: 'top', align: 'start' } },
      { element: '#what-to-promote', popover: { title: '🚀 What to Promote', description: "High-commission campaigns you haven't promoted yet — your best revenue opportunities.", side: 'top', align: 'start' } },
      { element: '#new-this-week', popover: { title: '🆕 New This Week', description: 'Campaigns just added to Amazon CC — get in early for maximum exposure.', side: 'top', align: 'start' } },
      { element: '#nav-catalog', popover: { title: '📋 Campaign Catalog', description: 'Browse 10,000+ live Amazon CC campaigns filtered to your niches. Click CC → to accept.', side: 'bottom', align: 'start' } },
      { element: '#nav-earnings', popover: { title: '💰 Earnings', description: 'Detailed income breakdown by campaign and ASIN, filterable by time period.', side: 'bottom', align: 'start' } },
      { element: '#nav-ad-health', popover: { title: '📊 Ad Health', description: 'Live Meta Ads placement analysis — identify wasted spend and underperforming placements.', side: 'bottom', align: 'start' } },
      { element: '#nav-settings', popover: { title: '⚙ Settings', description: 'Connect Meta Ads, set your niche categories, and configure your monthly earnings goal.', side: 'bottom', align: 'start' } },
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

  const statCard = (label, value, sub, color = '#0f172a', loading = false, id = undefined) => (
    <div id={id} style={{
      background: '#fff', borderRadius: '14px', padding: '20px 24px',
      border: '1.5px solid #e2e8f0', flex: '1 1 160px', minWidth: 0
    }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '8px' }}>{label}</div>
      {loading ? (
        <>
          <div className="dash-skel" style={{ height: '28px', width: '60%' }} />
          <div className="dash-skel" style={{ height: '12px', width: '40%', marginTop: '8px' }} />
        </>
      ) : (
        <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      )}
      {sub && !loading && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>{sub}</div>}
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <style>{`
        @keyframes dash-shimmer {
          0%   { background-position: -600px 0 }
          100% { background-position:  600px 0 }
        }
        @keyframes dash-spin {
          to { transform: rotate(360deg) }
        }
        .dash-skel {
          background: linear-gradient(90deg, #e2e8f0 25%, #f8fafc 50%, #e2e8f0 75%);
          background-size: 600px 100%;
          animation: dash-shimmer 1.4s infinite linear;
          border-radius: 6px;
        }
      `}</style>
      <AppHeader page="dashboard" storeName={storeName} onSignOut={handleSignOut} />

      {(loadingEarnings || loadingCatalog || loadingAd) && (
        <div style={{ background: '#fff7ed', borderBottom: '1.5px solid #fed7aa', padding: '7px 28px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
            border: '2px solid #f97316', borderTopColor: 'transparent',
            animation: 'dash-spin 0.7s linear infinite',
            verticalAlign: 'middle'
          }} />
          <span style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 600 }}>Loading dashboard data…</span>
        </div>
      )}

      {endingSoonCampaigns.length > 0 && (
        <div style={{ background: '#fffbeb', borderBottom: '1.5px solid #fde68a', padding: '8px 28px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>⏳ ENDING SOON</span>
          {endingSoonCampaigns.map(c => {
            const daysLeft = Math.ceil((new Date(c.end_date + 'T23:59:59') - Date.now()) / 86400000)
            return (
              <span key={c.campaign_id} style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '20px', padding: '2px 10px', whiteSpace: 'nowrap' }}>
                {c.campaign_name} · {daysLeft}d left
              </span>
            )
          })}
        </div>
      )}

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

        {/* Row 1: Key stats */}
        <div>
          <h2 style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: '12px' }}>Performance</h2>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {statCard('Earnings (30d)', fmt$(income30, 0), `${(earning30 || []).length} campaigns`, '#16a34a', loadingEarnings, 'stat-earnings-30')}
            {statCard('Earnings (All Time)', fmt$(incomeAll, 0), `${(earningAll || []).length} campaigns tracked`, '#0f172a', loadingEarnings)}
            {statCard('Ad Spend', adToday ? fmt$(adToday.spend) : '—', adToday ? `${adToday.label} · ${adToday.adsets} ad sets` : null, '#7c3aed', loadingAd, 'stat-ad-spend')}
            {statCard('Active Campaigns', catalogSnap ? catalogSnap.active.toLocaleString() : '—', catalogSnap ? `${catalogSnap.delivering} delivering · ${catalogSnap.scheduled} scheduled` : null, '#0f172a', loadingCatalog, 'stat-active-campaigns')}
          </div>
        </div>

        {/* Earnings Goal */}
        {!loadingEarnings && earningsGoal && (
          <div id="earnings-goal" style={{ background: '#fff', borderRadius: '14px', border: '1.5px solid #e2e8f0', padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>🎯 Monthly Goal</div>
              <Link to="/settings" style={{ fontSize: '0.7rem', color: '#94a3b8', textDecoration: 'none' }}>Edit →</Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '10px' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: income30 >= earningsGoal ? '#16a34a' : '#0f172a' }}>{fmt$(income30, 0)}</span>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>of {fmt$(earningsGoal, 0)} goal</span>
            </div>
            <div style={{ background: '#f1f5f9', borderRadius: '99px', height: '8px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (income30 / earningsGoal) * 100).toFixed(1)}%`,
                background: income30 >= earningsGoal ? '#16a34a' : '#f97316',
                borderRadius: '99px',
                transition: 'width 0.8s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                {income30 >= earningsGoal ? '🎉 Goal reached this month!' : `${fmt$(earningsGoal - income30, 0)} to go`}
              </span>
              <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>
                {Math.min(100, Math.round((income30 / earningsGoal) * 100))}%
              </span>
            </div>
          </div>
        )}

        {/* Row 2: Top earner + quick links */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Top earning campaign */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1.5px solid #e2e8f0', padding: '20px 24px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '12px' }}>
              Top Campaign (30d)
            </div>
            {loadingEarnings ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="dash-skel" style={{ height: '18px', width: '80%' }} />
                <div className="dash-skel" style={{ height: '14px', width: '50%' }} />
                <div className="dash-skel" style={{ height: '12px', width: '35%' }} />
              </div>
            ) : topCampaign ? (
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', marginBottom: '6px', lineHeight: 1.3 }}>
                  {topCampaign.campaign_title}
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#16a34a' }}>
                    {fmt$(topCampaign.total_income)}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    {Number(topCampaign.total_units).toLocaleString()} units · {fmt$(topCampaign.total_revenue)} rev
                  </span>
                </div>
                {topCampaign.max_rate && (
                  <span style={{
                    display: 'inline-block', marginTop: '8px',
                    fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px',
                    borderRadius: '20px', background: '#fff7ed', color: '#ea580c'
                  }}>{Number(topCampaign.max_rate).toFixed(0)}% commission</span>
                )}
              </div>
            ) : (
              <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>No earnings data yet.</p>
            )}
          </div>

          {/* Quick links */}
          <div style={{ background: '#fff', borderRadius: '14px', border: '1.5px solid #e2e8f0', padding: '20px 24px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: '12px' }}>
              Quick Navigation
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { to: '/', label: '📋 Campaign Catalog', desc: 'Browse & accept Amazon CC campaigns' },
                { to: '/earnings', label: '💰 Earnings', desc: 'View income by product & ASIN' },
                { to: '/ad-health', label: '📊 Ad Health', desc: 'Meta Ads placement analysis' },
                { to: '/settings', label: '⚙ Settings', desc: 'Account & preferences' },
              ].map(({ to, label, desc }) => (
                <Link
                  key={to}
                  to={to}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: '2px',
                    padding: '8px 12px', borderRadius: '8px',
                    textDecoration: 'none', transition: 'background .15s',
                    border: '1px solid transparent'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.borderColor = '#fed7aa' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>{label}</span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Row 3: What to Promote Next */}
        <div id="what-to-promote">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h2 style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>
                What to Promote Next
              </h2>
              <Link to="/" style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f97316', textDecoration: 'none' }}>
                See all →
              </Link>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '16px', marginTop: '-8px' }}>
              High-commission campaigns available now that you haven't promoted yet.
            </p>
            {(loadingEarnings || loadingCatalog) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="dash-skel" style={{ borderRadius: '12px', height: '120px' }} />
                ))}
              </div>
            ) : whatToPromote.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: '14px', border: '1.5px solid #e2e8f0', padding: '24px' }}>
                {promoteDebug?.deliveringHighRate === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>No DELIVERING campaigns with 20%+ commission found in the catalog right now.</p>
                ) : promoteDebug?.alreadyPromoted === promoteDebug?.deliveringHighRate ? (
                  <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>🎉 You're already promoting all {promoteDebug.deliveringHighRate} available campaigns with 20%+ commission.</p>
                ) : (
                  <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>No suggestions available. ({promoteDebug?.deliveringHighRate ?? 0} delivering at 20%+, {promoteDebug?.alreadyPromoted ?? 0} already promoted)</p>
                )}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
                {whatToPromote.map(c => {
                  const imgSrc = c.primary_asin ? `https://m.media-amazon.com/images/P/${c.primary_asin}.jpg` : null
                  return (
                    <div
                      key={c.campaign_id}
                      style={{
                        background: '#fff', borderRadius: '12px', border: '1.5px solid #e2e8f0',
                        padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px',
                        transition: 'box-shadow .15s, border-color .15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)'; e.currentTarget.style.borderColor = '#f97316' }}
                      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e2e8f0' }}
                    >
                      {imgSrc && (
                        <img src={imgSrc} alt={c.campaign_name} loading="lazy"
                          style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', borderRadius: '8px', background: '#f8fafc' }}
                          onError={e => { e.target.style.display = 'none' }}
                        />
                      )}
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: '#fff7ed', color: '#ea580c', alignSelf: 'flex-start' }}>
                        {Number(c.commission_rate).toFixed(0)}%
                      </span>
                      <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#0f172a', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {c.campaign_name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{c.brand_name}</div>
                    </div>
                  )
                })}
              </div>
            )}
        </div>

        {/* New This Week */}
        <div id="new-this-week">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>🆕 New This Week</h2>
            <Link to="/" style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f97316', textDecoration: 'none' }}>See all →</Link>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '16px', marginTop: '-8px' }}>
            Campaigns added to Amazon Creator Connections in the last 7 days.
          </p>
          {loadingNewCampaigns ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
              {Array.from({ length: 6 }).map((_, i) => <CampaignCardSkeleton key={i} />)}
            </div>
          ) : !newThisWeek || newThisWeek.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: '14px', border: '1.5px solid #e2e8f0', padding: '20px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>No new campaigns added this week. Check back soon.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
              {newThisWeek.map(c => (
                <div key={c.campaign_id} style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 1, fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '20px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>🆕 NEW</div>
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
