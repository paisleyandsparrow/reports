import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'

// ---------------------------------------------------------------------------
// Placement exclusion rules
// ---------------------------------------------------------------------------
const EXCLUDE_RULES = [
  { match: p => /reels_overlay/i.test(p),   label: 'FB Reels Overlay' },
  { match: p => /an_classic/i.test(p),      label: 'Audience Network' },
  { match: p => /an_video/i.test(p),        label: 'Audience Network Video' },
  { match: p => /rewarded_video/i.test(p),  label: 'Rewarded Video' },
  { match: p => /facebook_search/i.test(p), label: 'FB Search Results' },
]
const PERF_EXCLUDE_RULES = [
  { match: p => /instream_video/i.test(p), label: 'Instream Video', minSpend: 1.0, maxCtr: 3.0 },
]
const HARD_EXCLUDE_MIN_SPEND = 0.10

function placementStatus(platformPosition, spend = 0) {
  const rule = EXCLUDE_RULES.find(r => r.match(platformPosition))
  if (!rule) return { status: 'good', label: 'Healthy' }
  if (spend < HARD_EXCLUDE_MIN_SPEND) return { status: 'good', label: 'Healthy' }
  return { status: 'exclude', label: rule.label }
}
function applyPerfExcludes(placements) {
  return placements.map(p => {
    if (p.health.status === 'exclude') return p
    const rule = PERF_EXCLUDE_RULES.find(r => r.match(p.position))
    if (!rule) return p
    if (p.spend >= rule.minSpend && p.ctr < rule.maxCtr)
      return { ...p, health: { status: 'exclude', label: rule.label } }
    return p
  })
}
function fmtPlacement(publisher, position) {
  const pub = (publisher || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const pos = (position || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  if (!pos || pub.toLowerCase() === pos.toLowerCase()) return pub
  return `${pub} · ${pos}`
}
function flagSpendDrains(placements, adsetSpend, adsetCtr) {
  return placements.map(p => {
    if (p.health.status === 'exclude') return p
    const spendShare = adsetSpend > 0 ? p.spend / adsetSpend : 0
    const isDrain = p.spend >= 1.00 && spendShare >= 0.10 && (p.clicks === 0 || (adsetCtr > 0 && p.ctr < adsetCtr * 0.5))
    if (isDrain) return { ...p, health: { status: 'drain', label: 'Spend Drain' }, drainSpend: p.spend, drainPct: Math.round(spendShare * 100) }
    return p
  })
}
function calcScore(placements) {
  const badCount = placements.filter(p => p.health.status === 'exclude' || p.health.status === 'drain').length
  if (badCount === 0) return 100
  if (badCount <= 2) return 75
  return 50
}
function scoreConfig(score) {
  if (score === 100) return { label: 'Thriving', tone: 'good', ring: '#10b981', soft: '#ecfdf5', deep: '#065f46' }
  if (score >= 75)   return { label: 'Leaking',  tone: 'warn', ring: '#f59e0b', soft: '#fffbeb', deep: '#78350f' }
  return                { label: 'Bleeding',     tone: 'crit', ring: '#ef4444', soft: '#fef2f2', deep: '#7f1d1d' }
}
function toYMD(d) { return d.toISOString().slice(0, 10) }
function fmtDisplay(ymd) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [y, m, d] = ymd.split('-')
  return `${months[parseInt(m)-1]} ${parseInt(d)}`
}
function fmtDay(ymd) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const dt = new Date(ymd + 'T12:00:00Z')
  return days[dt.getUTCDay()]
}
function addDays(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return toYMD(d) }
function fmtNum(n) { if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1)+'K'; return n.toLocaleString() }

const META_API = 'https://graph.facebook.com/v20.0'
const CACHE_TTL_MS = 5 * 60 * 1000
const cacheKey = date => `ad_health_v2_${date}`
function getCached(date) { try { const raw = sessionStorage.getItem(cacheKey(date)); if (!raw) return null; const { adSets, fetchedAt } = JSON.parse(raw); const isToday = date === toYMD(new Date()); if (isToday && Date.now() - fetchedAt > CACHE_TTL_MS) return null; return { adSets, fetchedAt } } catch { return null } }
function setCached(date, adSets) { try { sessionStorage.setItem(cacheKey(date), JSON.stringify({ adSets, fetchedAt: Date.now() })) } catch {} }

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
const MOCK_ADSETS = (() => {
  const raw = [
    { id: 'as_001', name: 'Paisley Summer Dresses', campaignId: 'c_001', campaignName: 'Summer Fashion 2026', spend: 48.32, clicks: 312, impressions: 18400,
      placements: [
        { publisher: 'facebook', position: 'feed', spend: 28.10, clicks: 210, impressions: 11200, cpc: 0.13, ctr: 1.88 },
        { publisher: 'instagram', position: 'stream', spend: 15.42, clicks: 89, impressions: 5800, cpc: 0.17, ctr: 1.53 },
        { publisher: 'facebook', position: 'reels_overlay', spend: 4.80, clicks: 13, impressions: 1400, cpc: 0.37, ctr: 0.93 },
      ] },
    { id: 'as_002', name: 'Kids Activewear Spring', campaignId: 'c_002', campaignName: 'Kids Clothing', spend: 22.15, clicks: 198, impressions: 9200,
      placements: [
        { publisher: 'instagram', position: 'stream', spend: 14.60, clicks: 142, impressions: 6100, cpc: 0.10, ctr: 2.33 },
        { publisher: 'audience_network', position: 'classic', spend: 7.55, clicks: 56, impressions: 3100, cpc: 0.13, ctr: 1.81 },
      ] },
    { id: 'as_003', name: 'Home Decor Bestsellers', campaignId: 'c_003', campaignName: 'Home & Garden', spend: 31.80, clicks: 445, impressions: 22000,
      placements: [
        { publisher: 'facebook', position: 'feed', spend: 18.20, clicks: 280, impressions: 13000, cpc: 0.065, ctr: 2.15 },
        { publisher: 'instagram', position: 'reels', spend: 13.60, clicks: 165, impressions: 9000, cpc: 0.082, ctr: 1.83 },
      ] },
    { id: 'as_004', name: 'Baby Essentials Bundle', campaignId: 'c_004', campaignName: 'Baby & Toddler', spend: 15.40, clicks: 88, impressions: 6800,
      placements: [
        { publisher: 'facebook', position: 'feed', spend: 8.90, clicks: 62, impressions: 4200, cpc: 0.14, ctr: 1.48 },
        { publisher: 'facebook', position: 'instream_video', spend: 6.50, clicks: 26, impressions: 2600, cpc: 0.25, ctr: 1.00 },
      ] },
  ]
  return raw.map(as => {
    as.placements = as.placements.map(p => ({ ...p, label: fmtPlacement(p.publisher, p.position), health: placementStatus(p.position, p.spend) }))
    as.placements = applyPerfExcludes(as.placements)
    as.ctr = as.impressions > 0 ? (as.clicks / as.impressions) * 100 : 0
    as.cpc = as.clicks > 0 ? as.spend / as.clicks : 0
    as.placements = flagSpendDrains(as.placements, as.spend, as.ctr)
    as.score = calcScore(as.placements)
    as.scoreConf = scoreConfig(as.score)
    const excludeLabels = [...new Set(as.placements.filter(p => p.health.status === 'exclude').map(p => p.health.label))]
    const drainItems = as.placements.filter(p => p.health.status === 'drain')
    const recs = []
    if (excludeLabels.length > 0) recs.push(`Exclude ${excludeLabels.join(', ')} in Ads Manager`)
    drainItems.forEach(p => recs.push(`${p.label} took $${p.drainSpend?.toFixed(2)} (${p.drainPct}% of spend) with almost no results — exclude or test it separately`))
    as.recommendation = recs.length > 0 ? recs : null
    return as
  })
})()

const IS_MOCK = import.meta.env.VITE_MOCK === 'true'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AdHealthPage() {
  const navigate = useNavigate()
  const [date, setDate]                   = useState(toYMD(new Date()))
  const [integration, setIntegration]     = useState(null)
  const [loadingCreds, setLoadingCreds]   = useState(!IS_MOCK)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)
  const [adSets, setAdSets]               = useState(IS_MOCK ? MOCK_ADSETS : [])
  const [storeName, setStoreName]         = useState(IS_MOCK ? 'Paisley & Sparrow' : '')
  const [cachedAt, setCachedAt]           = useState(IS_MOCK ? Date.now() : null)
  const [fromCache, setFromCache]         = useState(IS_MOCK)
  const [expanded, setExpanded]           = useState({})

  useEffect(() => {
    if (IS_MOCK) return
    async function loadCreds() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/login'); return }
      const { data: profile } = await supabase.from('user_preferences').select('store_name').eq('id', session.user.id).maybeSingle()
      setStoreName(profile?.store_name || '')
      const { data: intg, error: intgErr } = await supabase.from('user_integrations').select('access_token, ad_account_id').eq('user_id', session.user.id).eq('integration_type', 'meta_ads').maybeSingle()
      if (intgErr || !intg?.access_token || !intg?.ad_account_id) { navigate('/settings?from=ad-health'); return }
      setIntegration(intg)
      setLoadingCreds(false)
    }
    loadCreds()
  }, [navigate])

  const fetchData = useCallback(async (force = false) => {
    if (IS_MOCK) { setAdSets(MOCK_ADSETS); return }
    if (!integration) return
    if (!force) { const cached = getCached(date); if (cached) { setAdSets(cached.adSets); setCachedAt(cached.fetchedAt); setFromCache(true); setLoading(false); return } }
    setLoading(true); setError(null); setFromCache(false)
    try {
      const { access_token, ad_account_id } = integration
      const accountId = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`
      const params = new URLSearchParams({ level: 'adset', breakdowns: 'publisher_platform,platform_position', fields: 'adset_id,adset_name,campaign_id,campaign_name,spend,clicks,ctr,cpc,impressions', time_range: JSON.stringify({ since: date, until: date }), limit: 500, access_token })
      const resp = await fetch(`${META_API}/${accountId}/insights?${params}`)
      const json = await resp.json()
      if (json.error) throw new Error(json.error.message)
      const rows = json.data || []
      if (rows.length === 0) { setAdSets([]); setLoading(false); return }
      const byAdSet = {}
      for (const row of rows) {
        const id = row.adset_id
        if (!byAdSet[id]) byAdSet[id] = { id, name: row.adset_name || '', campaignId: row.campaign_id || '', campaignName: row.campaign_name || '', spend: 0, clicks: 0, impressions: 0, placements: [] }
        const spend = parseFloat(row.spend || 0), clicks = parseInt(row.clicks || 0), impressions = parseInt(row.impressions || 0)
        byAdSet[id].spend += spend; byAdSet[id].clicks += clicks; byAdSet[id].impressions += impressions
        byAdSet[id].placements.push({ publisher: row.publisher_platform || '', position: row.platform_position || '', label: fmtPlacement(row.publisher_platform, row.platform_position), spend, clicks, impressions, cpc: parseFloat(row.cpc || 0), ctr: parseFloat(row.ctr || 0), health: placementStatus(row.platform_position || '', spend) })
      }
      const processed = Object.values(byAdSet).map(as => {
        as.placements.sort((a, b) => b.spend - a.spend)
        as.ctr = as.impressions > 0 ? (as.clicks / as.impressions) * 100 : 0
        as.cpc = as.clicks > 0 ? as.spend / as.clicks : 0
        as.placements = applyPerfExcludes(as.placements)
        as.placements = flagSpendDrains(as.placements, as.spend, as.ctr)
        as.score = calcScore(as.placements)
        as.scoreConf = scoreConfig(as.score)
        const excludeLabels = [...new Set(as.placements.filter(p => p.health.status === 'exclude').map(p => p.health.label))]
        const drainItems = as.placements.filter(p => p.health.status === 'drain')
        const recs = []
        if (excludeLabels.length > 0) recs.push(`Exclude ${excludeLabels.join(', ')} in Ads Manager`)
        drainItems.forEach(p => recs.push(`${p.label} took $${p.drainSpend.toFixed(2)} (${p.drainPct}% of spend) with almost no results — exclude or test it separately`))
        as.recommendation = recs.length > 0 ? recs : null
        return as
      })
      processed.sort((a, b) => b.spend - a.spend)
      setCached(date, processed); setCachedAt(Date.now()); setAdSets(processed)
    } catch (e) {
      setError(e.message || 'Failed to fetch Meta data')
    } finally { setLoading(false) }
  }, [integration, date])
  useEffect(() => { if (!loadingCreds) fetchData() }, [fetchData, loadingCreds])

  // Derived
  const totalSpend       = adSets.reduce((s, a) => s + a.spend, 0)
  const totalClicks      = adSets.reduce((s, a) => s + a.clicks, 0)
  const totalImpressions = adSets.reduce((s, a) => s + a.impressions, 0)
  const avgCtr  = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgCpc  = totalClicks > 0 ? totalSpend / totalClicks : 0
  const flagCount   = adSets.reduce((s, a) => s + a.placements.filter(p => p.health.status === 'exclude' || p.health.status === 'drain').length, 0)
  const wastedSpend = adSets.reduce((s, a) => s + a.placements.filter(p => p.health.status === 'exclude' || p.health.status === 'drain').reduce((ps, p) => ps + p.spend, 0), 0)
  const healthyCount = adSets.filter(a => a.score === 100).length
  const overallScore = adSets.length > 0 ? Math.round(adSets.reduce((s, a) => s + a.score, 0) / adSets.length) : 0
  const overallConf  = scoreConfig(overallScore)

  const allRecs = (() => {
    const map = {}
    for (const a of adSets) for (const r of (a.recommendation || [])) { if (!map[r]) map[r] = []; map[r].push(a.name) }
    return Object.entries(map).map(([rec, adsets]) => ({ rec, adsets }))
  })()
  const spendFloor = Math.max(2, totalSpend * 0.05)
  const scaleTargets = adSets
    .filter(a => a.score === 100 && a.spend >= spendFloor && (a.ctr > avgCtr * 1.05 || (avgCpc > 0 && a.cpc < avgCpc * 0.95)))
    .map(a => {
      const tips = []
      if (avgCtr > 0 && a.ctr > avgCtr * 1.2) tips.push(`CTR is ${Math.round((a.ctr / avgCtr - 1) * 100)}% above your account average — consider increasing daily budget 20–30%`)
      else if (avgCtr > 0 && a.ctr > avgCtr * 1.05) tips.push(`CTR is above your account average — stable performer worth scaling gradually`)
      if (avgCpc > 0 && a.cpc < avgCpc * 0.8) tips.push(`CPC is ${Math.round((1 - a.cpc / avgCpc) * 100)}% below account average — most cost-efficient ad today`)
      else if (avgCpc > 0 && a.cpc < avgCpc * 0.95) tips.push(`Below-average CPC ($${a.cpc.toFixed(2)}) — cost-efficient, room to increase spend`)
      const bestPlacement = [...a.placements].filter(p => p.health.status === 'good' && p.spend >= 2 && p.ctr > 0).sort((x, y) => y.ctr - x.ctr)[0]
      if (bestPlacement) tips.push(`Best placement: ${bestPlacement.label} at ${bestPlacement.ctr.toFixed(1)}% CTR — consider a ${bestPlacement.label.split(' ').slice(-1)[0]}-only campaign`)
      return { ...a, scaleTips: tips }
    })
    .sort((a, b) => (b.ctr / (b.cpc || 1)) - (a.ctr / (a.cpc || 1)))

  const isToday = date === toYMD(new Date())
  const maxSpend = Math.max(1, ...adSets.map(a => a.spend))
  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  // ---------------------------------------------------------------------------
  // Sub-components
  // ---------------------------------------------------------------------------
  function HealthRing({ score, size = 120, stroke = 8 }) {
    const r = (size - stroke) / 2
    const circ = 2 * Math.PI * r
    const dash = (score / 100) * circ
    const conf = scoreConfig(score)
    return (
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f1ebe5" strokeWidth={stroke} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={conf.ring} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: size * 0.32, fontWeight: 400, color: '#1a1410', letterSpacing: '-0.02em', lineHeight: 1 }}>{score}</span>
          <span style={{ fontSize: size * 0.07, fontWeight: 600, color: conf.ring, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 4 }}>{conf.label}</span>
        </div>
      </div>
    )
  }

  function StatusDot({ status, label }) {
    const cfg = {
      good:    { dot: '#10b981', text: '#047857', bg: 'rgba(16,185,129,0.08)' },
      exclude: { dot: '#ef4444', text: '#b91c1c', bg: 'rgba(239,68,68,0.08)' },
      drain:   { dot: '#f59e0b', text: '#b45309', bg: 'rgba(245,158,11,0.08)' },
    }[status] || { dot: '#94a3b8', text: '#64748b', bg: 'rgba(148,163,184,0.08)' }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', fontWeight: 600, color: cfg.text, background: cfg.bg, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '0.01em' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0, boxShadow: `0 0 0 3px ${cfg.bg}` }} />
        {label}
      </span>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', background: '#fbf7f3', fontFamily: 'Inter, sans-serif', color: '#1a1410' }}>
      <AppHeader page="ad-health" storeName={storeName}
        onSignOut={async () => { await supabase.auth.signOut(); navigate('/login') }} />

      {/* Loading skeleton */}
      {loadingCreds && (
        <div style={{ maxWidth: 1100, margin: '64px auto', padding: '0 28px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: '#fff', borderRadius: 24, height: 140, marginBottom: 16, animation: 'shimmer 1.6s ease-in-out infinite', animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
      )}

      {!loadingCreds && (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 28px 80px' }}>

          {error === 'no_integration' && (
            <div style={{ background: '#fff', borderRadius: 24, padding: 64, textAlign: 'center', border: '1px solid #f1ebe5' }}>
              <div style={{ fontSize: '3rem', marginBottom: 20 }}>📊</div>
              <p style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.6rem', color: '#1a1410', marginBottom: 12, letterSpacing: '-0.02em' }}>Meta Ads not connected</p>
              <p style={{ fontSize: '0.95rem', color: '#7a6b5d', marginBottom: 28, maxWidth: 380, margin: '0 auto 28px', lineHeight: 1.6 }}>Add your Meta access token and ad account ID in Settings to unlock Ad Health.</p>
              <Link to="/settings" style={{ display: 'inline-block', background: '#1a1410', color: '#fbf7f3', padding: '14px 36px', borderRadius: 999, textDecoration: 'none', fontWeight: 600, fontSize: '0.875rem', letterSpacing: '0.02em' }}>Connect Meta Ads</Link>
            </div>
          )}

          {error && error !== 'no_integration' && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, padding: '16px 22px', color: '#991b1b', fontSize: '0.875rem', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span><strong>Meta API error:</strong> {error}</span>
              <button onClick={() => fetchData(true)} style={{ background: '#1a1410', color: '#fff', border: 'none', borderRadius: 999, padding: '8px 18px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>Retry</button>
            </div>
          )}

          {!error && (
            <>
              {/* ═══════════════════════════════════════════════════════════
                  EDITORIAL HERO
                  ═══════════════════════════════════════════════════════════ */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap', marginBottom: 32 }}>
                <div style={{ flex: '1 1 400px', minWidth: 280 }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 10 }}>{fmtDay(date)}, {fmtDisplay(date)}</p>
                  <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 'clamp(2rem, 4.5vw, 2.85rem)', color: '#1a1410', letterSpacing: '-0.025em', lineHeight: 1.05, margin: 0, marginBottom: 14 }}>
                    Your ads are <em style={{ color: overallConf.ring, fontStyle: 'italic' }}>{overallConf.label.toLowerCase()}</em>.
                  </h1>
                  <p style={{ fontSize: '1rem', color: '#7a6b5d', lineHeight: 1.6, margin: 0, maxWidth: 480 }}>
                    {flagCount === 0
                      ? `All ${adSets.length} ad sets are running clean. Nothing demanding your attention right now.`
                      : `${flagCount} placement${flagCount !== 1 ? 's' : ''} across ${adSets.length - healthyCount} ad set${adSets.length - healthyCount !== 1 ? 's' : ''} ${flagCount !== 1 ? 'are' : 'is'} draining $${wastedSpend.toFixed(2)} that could be redirected.`
                    }
                  </p>
                </div>

                {/* Date stepper */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #f1ebe5', borderRadius: 999, padding: 4 }}>
                  <button onClick={() => setDate(d => addDays(d, -1))} style={dateBtn}>←</button>
                  <div style={{ padding: '8px 18px', fontWeight: 600, fontSize: '0.875rem', color: '#1a1410', minWidth: 120, textAlign: 'center' }}>{fmtDisplay(date)}</div>
                  <button onClick={() => setDate(d => addDays(d, 1))} disabled={isToday} style={{ ...dateBtn, opacity: isToday ? 0.3 : 1, cursor: isToday ? 'default' : 'pointer' }}>→</button>
                </div>
              </div>

              {/* ═══════════════════════════════════════════════════════════
                  HERO STATS — overall ring + 4 numbers
                  ═══════════════════════════════════════════════════════════ */}
              <div style={{ background: '#fff', borderRadius: 28, padding: '36px 40px', marginBottom: 32, border: '1px solid #f1ebe5', display: 'flex', gap: 40, alignItems: 'center', flexWrap: 'wrap' }}>
                <HealthRing score={overallScore} size={132} stroke={9} />

                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 28, minWidth: 280 }}>
                  {[
                    { label: 'Spend',       value: `$${totalSpend.toFixed(2)}`,      sub: `${adSets.length} ad sets` },
                    { label: 'Clicks',      value: fmtNum(totalClicks),               sub: `${avgCtr.toFixed(2)}% CTR` },
                    { label: 'Avg CPC',     value: `$${avgCpc.toFixed(2)}`,           sub: 'per click' },
                    { label: 'Wasted',      value: `$${wastedSpend.toFixed(2)}`,      sub: `${flagCount} flag${flagCount !== 1 ? 's' : ''}`, danger: wastedSpend > 0 },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>{s.label}</div>
                      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.85rem', fontWeight: 400, color: s.danger ? '#b91c1c' : '#1a1410', letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: '0.72rem', color: '#a89485', marginTop: 6 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {cachedAt && fromCache && (
                  <div style={{ position: 'absolute' }}>
                    <button onClick={() => fetchData(true)} style={{ background: 'transparent', border: 'none', color: '#a89485', fontSize: '0.72rem', cursor: 'pointer' }}>↻</button>
                  </div>
                )}
              </div>

              {/* ═══════════════════════════════════════════════════════════
                  TWO-COLUMN: ACTION LIST + SCALE
                  ═══════════════════════════════════════════════════════════ */}
              {(allRecs.length > 0 || scaleTargets.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 32 }}>
                  {/* Action List */}
                  {allRecs.length > 0 && (
                    <div style={{ background: '#fff', borderRadius: 24, padding: '28px 30px', border: '1px solid #f1ebe5', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, right: 0, width: 140, height: 140, background: 'radial-gradient(circle at top right, rgba(236,72,153,0.06), transparent 70%)' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, position: 'relative' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ec4899' }} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7a6b5d', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Action Required</span>
                      </div>
                      <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 400, color: '#1a1410', letterSpacing: '-0.02em', margin: '0 0 20px' }}>
                        {allRecs.length} thing{allRecs.length !== 1 ? 's' : ''} to fix today
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {allRecs.map((item, i) => (
                          <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 0', borderTop: i === 0 ? 'none' : '1px solid #f1ebe5' }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a1410', color: '#fbf7f3', fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.9rem', color: '#1a1410', fontWeight: 500, lineHeight: 1.45, marginBottom: 4 }}>{item.rec}</div>
                              <div style={{ fontSize: '0.75rem', color: '#a89485' }}>
                                {item.adsets.length === 1 ? item.adsets[0] : item.adsets.length <= 3 ? item.adsets.join(' · ') : `${item.adsets.slice(0, 2).join(' · ')} +${item.adsets.length - 2} more`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Scale */}
                  {scaleTargets.length > 0 && (
                    <div style={{ background: 'linear-gradient(155deg, #1a1410 0%, #2a1f18 100%)', color: '#fbf7f3', borderRadius: 24, padding: '28px 30px', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', bottom: -40, left: -40, width: 200, height: 200, background: 'radial-gradient(circle, rgba(236,72,153,0.15), transparent 70%)' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, position: 'relative' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbcfe8' }} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fbcfe8', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Scale Up</span>
                      </div>
                      <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 400, color: '#fbf7f3', letterSpacing: '-0.02em', margin: '0 0 20px', position: 'relative' }}>
                        {scaleTargets.length} winner{scaleTargets.length !== 1 ? 's' : ''} worth more budget
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>
                        {scaleTargets.map((a, i) => (
                          <div key={a.id} style={{ paddingTop: i === 0 ? 0 : 16, borderTop: i === 0 ? 'none' : '1px solid rgba(251,247,243,0.1)' }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#fbf7f3', marginBottom: 4 }}>{a.name}</div>
                            <div style={{ fontSize: '0.72rem', color: '#fbcfe8', marginBottom: 10, fontVariantNumeric: 'tabular-nums' }}>${a.spend.toFixed(2)} · {a.ctr.toFixed(2)}% CTR · ${a.cpc.toFixed(2)} CPC</div>
                            {a.scaleTips.map((tip, j) => (
                              <div key={j} style={{ fontSize: '0.82rem', color: '#e8dfd6', lineHeight: 1.55, marginTop: j > 0 ? 6 : 0, paddingLeft: 14, borderLeft: '2px solid rgba(236,72,153,0.4)' }}>{tip}</div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════
                  AD SETS LIST
                  ═══════════════════════════════════════════════════════════ */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18, padding: '0 6px' }}>
                <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', fontWeight: 400, color: '#1a1410', letterSpacing: '-0.02em', margin: 0 }}>Ad Sets</h2>
                <span style={{ fontSize: '0.78rem', color: '#a89485' }}>Sorted by spend</span>
              </div>

              {loading && (
                <>
                  <div style={{ textAlign: 'center', padding: '8px 0 12px', fontSize: '0.85rem', color: '#a89485', fontWeight: 500 }}>Fetching from Meta…</div>
                  {[1, 2, 3].map(i => (
                    <div key={i} style={{ background: '#fff', borderRadius: 20, height: 140, marginBottom: 12, animation: 'shimmer 1.6s ease-in-out infinite', animationDelay: `${i * 0.12}s` }} />
                  ))}
                </>
              )}

              {!loading && adSets.length === 0 && !error && (
                <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #f1ebe5', padding: 64, textAlign: 'center', color: '#a89485' }}>
                  <div style={{ fontSize: '2.6rem', marginBottom: 14 }}>🌿</div>
                  <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: '#1a1410', letterSpacing: '-0.02em' }}>No ads ran on {fmtDisplay(date)}</p>
                  <p style={{ fontSize: '0.85rem', marginTop: 8 }}>Try a different date.</p>
                </div>
              )}

              {!loading && adSets.map(as => {
                const conf = as.scoreConf
                const isOpen = expanded[as.id] !== false
                const spendPct = (as.spend / maxSpend) * 100
                return (
                  <div key={as.id} style={{ background: '#fff', borderRadius: 20, marginBottom: 12, border: '1px solid #f1ebe5', overflow: 'hidden', transition: 'border-color 0.2s' }}>
                    {/* Header row — always visible */}
                    <button onClick={() => toggle(as.id)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, fontFamily: 'inherit' }}>
                      {/* Mini ring */}
                      <div style={{ flexShrink: 0 }}>
                        <HealthRing score={as.score} size={56} stroke={4.5} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a1410', letterSpacing: '-0.01em' }}>{as.name}</span>
                          <span style={{ fontSize: '0.72rem', color: '#a89485' }}>· {as.campaignName}</span>
                        </div>
                        {/* Spend bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.78rem', color: '#7a6b5d', fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ fontWeight: 700, color: '#1a1410', minWidth: 65 }}>${as.spend.toFixed(2)}</span>
                          <div style={{ flex: 1, maxWidth: 200, height: 4, background: '#f5efe8', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ width: `${spendPct}%`, height: '100%', background: conf.ring, borderRadius: 999, transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                          </div>
                          <span>{as.clicks.toLocaleString()} clicks</span>
                          <span>{as.ctr.toFixed(2)}% CTR</span>
                          <span>${as.cpc.toFixed(2)} CPC</span>
                        </div>
                      </div>

                      <span style={{ color: '#a89485', fontSize: '1.1rem', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>⌄</span>
                    </button>

                    {isOpen && (
                      <div style={{ padding: '0 24px 24px', borderTop: '1px solid #f5efe8' }}>
                        {/* Placement bars */}
                        <div style={{ marginTop: 20 }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 14 }}>Placements</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {as.placements.map((p, i) => {
                              const placePct = (p.spend / Math.max(1, ...as.placements.map(x => x.spend))) * 100
                              const barColor = p.health.status === 'exclude' ? '#ef4444' : p.health.status === 'drain' ? '#f59e0b' : '#10b981'
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                  <div style={{ width: 180, fontSize: '0.85rem', color: '#1a1410', fontWeight: 500, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
                                  <div style={{ flex: 1, height: 24, background: '#faf5f0', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
                                    <div style={{ width: `${placePct}%`, height: '100%', background: `linear-gradient(90deg, ${barColor}, ${barColor}dd)`, borderRadius: 8, transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                                  </div>
                                  <div style={{ display: 'flex', gap: 18, fontSize: '0.78rem', color: '#7a6b5d', fontVariantNumeric: 'tabular-nums', minWidth: 200, justifyContent: 'flex-end' }}>
                                    <span style={{ minWidth: 56, textAlign: 'right', color: '#1a1410', fontWeight: 600 }}>${p.spend.toFixed(2)}</span>
                                    <span style={{ minWidth: 50, textAlign: 'right' }}>{p.ctr.toFixed(2)}%</span>
                                    <span style={{ minWidth: 50, textAlign: 'right' }}>${p.cpc.toFixed(2)}</span>
                                  </div>
                                  <div style={{ minWidth: 110, display: 'flex', justifyContent: 'flex-end' }}>
                                    <StatusDot status={p.health.status} label={p.health.label} />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {as.recommendation && (
                          <div style={{ marginTop: 22, padding: '16px 20px', background: '#faf5f0', border: '1px solid #f1ebe5', borderRadius: 14, borderLeft: `3px solid ${conf.ring}` }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: conf.ring, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>Recommendation</div>
                            {as.recommendation.map((rec, i) => (
                              <div key={i} style={{ fontSize: '0.88rem', color: '#1a1410', lineHeight: 1.55, marginTop: i > 0 ? 8 : 0 }}>{rec}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        button:focus-visible { outline: 2px solid #ec4899; outline-offset: 2px; }
      `}</style>
    </div>
  )
}

const dateBtn = {
  background: 'transparent',
  border: 'none',
  borderRadius: 999,
  width: 36,
  height: 36,
  cursor: 'pointer',
  fontSize: '1rem',
  color: '#1a1410',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  fontWeight: 500,
}
