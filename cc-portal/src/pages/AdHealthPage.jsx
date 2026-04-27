import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'

// ---------------------------------------------------------------------------
// Placement exclusion rules
// Hard excludes: always bad for product/affiliate content regardless of performance
// Perf excludes: only flag if underperforming (applied after adset totals known)
// ---------------------------------------------------------------------------
const EXCLUDE_RULES = [
  { match: p => /reels_overlay/i.test(p),   label: 'FB Reels Overlay' },
  { match: p => /an_classic/i.test(p),      label: 'Audience Network' },
  { match: p => /an_video/i.test(p),        label: 'Audience Network Video' },
  { match: p => /rewarded_video/i.test(p),  label: 'Rewarded Video' },
  { match: p => /facebook_search/i.test(p), label: 'FB Search Results' },
]

// Performance-gated: only exclude if spend >= minSpend AND CTR < maxCtr
const PERF_EXCLUDE_RULES = [
  { match: p => /instream_video/i.test(p), label: 'Instream Video', minSpend: 1.0, maxCtr: 3.0 },
]

// Hard excludes require >= $0.10 spend so rounding-error placements don't trigger flags
const HARD_EXCLUDE_MIN_SPEND = 0.10

function placementStatus(platformPosition, spend = 0) {
  const rule = EXCLUDE_RULES.find(r => r.match(platformPosition))
  if (!rule) return { status: 'good', label: 'Good' }
  if (spend < HARD_EXCLUDE_MIN_SPEND) return { status: 'good', label: 'Good' }
  return { status: 'exclude', label: `Exclude — ${rule.label}` }
}

function applyPerfExcludes(placements) {
  return placements.map(p => {
    if (p.health.status === 'exclude') return p
    const rule = PERF_EXCLUDE_RULES.find(r => r.match(p.position))
    if (!rule) return p
    if (p.spend >= rule.minSpend && p.ctr < rule.maxCtr)
      return { ...p, health: { status: 'exclude', label: `Exclude — ${rule.label}` } }
    return p
  })
}

// Human-readable placement names
function fmtPlacement(publisher, position) {
  const pub = (publisher || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const pos = (position || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  if (!pos || pub.toLowerCase() === pos.toLowerCase()) return pub
  return `${pub} ${pos}`
}

// ---------------------------------------------------------------------------
// Spend-drain detection
// A placement is a spend drain if it takes ≥10% of the ad set's total spend
// AND its CTR is less than 50% of the ad set average (or has 0 clicks entirely).
// Called after adset totals are known so percentages are accurate.
// ---------------------------------------------------------------------------
function flagSpendDrains(placements, adsetSpend, adsetCtr) {
  return placements.map(p => {
    if (p.health.status === 'exclude') return p  // already flagged, don't double-flag
    const spendShare = adsetSpend > 0 ? p.spend / adsetSpend : 0
    const isDrain = p.spend >= 1.00 && spendShare >= 0.10 && (p.clicks === 0 || (adsetCtr > 0 && p.ctr < adsetCtr * 0.5))
    if (isDrain) {
      return {
        ...p,
        health: { status: 'drain', label: 'Spend Drain' },
        drainSpend: p.spend,
        drainPct: Math.round(spendShare * 100),
      }
    }
    return p
  })
}

// Health score: combines exclude flags + spend drains
function calcScore(placements) {
  const badCount = placements.filter(p => p.health.status === 'exclude' || p.health.status === 'drain').length
  if (badCount === 0) return 100
  if (badCount <= 2) return 75
  return 50
}

function scoreConfig(score) {
  if (score === 100) return { label: 'HEALTHY', badge: '✅ ALL GOOD', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' }
  if (score >= 75) return { label: 'NEEDS WORK', badge: '🚨 ACTION NEEDED', color: '#d97706', bg: '#fffbeb', border: '#fde68a' }
  return { label: 'ACT NOW', badge: '🚨 ACTION NEEDED', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
}

// Date helpers
function toYMD(d) {
  return d.toISOString().slice(0, 10)
}
function fmtDisplay(ymd) {
  const [y, m, d] = ymd.split('-')
  return `${parseInt(m)}/${parseInt(d)}/${String(y).slice(2)}`
}
function addDays(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return toYMD(d)
}

// Meta Graph API base URL
const META_API = 'https://graph.facebook.com/v20.0'

// ---------------------------------------------------------------------------
// Cache helpers — sessionStorage keyed by date
// Past dates: cache forever (data won't change)
// Today: cache for 5 minutes to avoid hammering the API
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 5 * 60 * 1000
const cacheKey = date => `ad_health_v2_${date}`

function getCached(date) {
  try {
    const raw = sessionStorage.getItem(cacheKey(date))
    if (!raw) return null
    const { adSets, fetchedAt } = JSON.parse(raw)
    const isToday = date === toYMD(new Date())
    if (isToday && Date.now() - fetchedAt > CACHE_TTL_MS) return null
    return { adSets, fetchedAt }
  } catch { return null }
}

function setCached(date, adSets) {
  try {
    sessionStorage.setItem(cacheKey(date), JSON.stringify({ adSets, fetchedAt: Date.now() }))
  } catch {}
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AdHealthPage() {
  const navigate = useNavigate()
  const [date, setDate] = useState(toYMD(new Date()))
  const [integration, setIntegration] = useState(null)   // { access_token, ad_account_id }
  const [loadingCreds, setLoadingCreds] = useState(true)  // true while checking Supabase creds
  const [loading, setLoading] = useState(false)           // true while calling Meta API
  const [error, setError] = useState(null)
  const [adSets, setAdSets] = useState([])  // processed ad set objects
  const [storeName, setStoreName] = useState('')
  const [cachedAt, setCachedAt] = useState(null)          // timestamp of displayed data
  const [fromCache, setFromCache] = useState(false)
  const [actionListOpen, setActionListOpen] = useState(true)
  const [scaleOpen, setScaleOpen] = useState(true)

  // Load integration credentials once
  useEffect(() => {
    async function loadCreds() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/login'); return }

      // Store name from onboarding profile
      const { data: profile } = await supabase
        .from('user_preferences')
        .select('store_name')
        .eq('id', session.user.id)
        .maybeSingle()
      setStoreName(profile?.store_name || '')

      const { data: intg, error: intgErr } = await supabase
        .from('user_integrations')
        .select('access_token, ad_account_id')
        .eq('user_id', session.user.id)
        .eq('integration_type', 'meta_ads')
        .maybeSingle()

      if (intgErr || !intg?.access_token || !intg?.ad_account_id) {
        navigate('/settings?from=ad-health')
        return
      }
      setIntegration(intg)
      setLoadingCreds(false)
    }
    loadCreds()
  }, [navigate])

  // Fetch Meta data whenever integration or date changes
  const fetchData = useCallback(async (force = false) => {
    if (!integration) return

    // Serve from cache unless forced
    if (!force) {
      const cached = getCached(date)
      if (cached) {
        setAdSets(cached.adSets)
        setCachedAt(cached.fetchedAt)
        setFromCache(true)
        setLoading(false)
        return
      }
    }

    setLoading(true)
    setError(null)
    setFromCache(false)
    try {
      const { access_token, ad_account_id } = integration
      const accountId = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`

      // Single insights call: per-adset, per-placement breakdown for the selected date
      const params = new URLSearchParams({
        level: 'adset',
        breakdowns: 'publisher_platform,platform_position',
        fields: 'adset_id,adset_name,campaign_id,campaign_name,spend,clicks,ctr,cpc,impressions',
        time_range: JSON.stringify({ since: date, until: date }),
        limit: 500,
        access_token,
      })
      const resp = await fetch(`${META_API}/${accountId}/insights?${params}`)
      const json = await resp.json()

      if (json.error) throw new Error(json.error.message)

      const rows = json.data || []
      if (rows.length === 0) {
        setAdSets([])
        setLoading(false)
        return
      }

      // Group rows by adset_id
      const byAdSet = {}
      for (const row of rows) {
        const id = row.adset_id
        if (!byAdSet[id]) {
          byAdSet[id] = {
            id,
            name: row.adset_name || '',
            campaignId: row.campaign_id || '',
            campaignName: row.campaign_name || '',
            spend: 0,
            clicks: 0,
            impressions: 0,
            placements: [],
          }
        }
        const spend = parseFloat(row.spend || 0)
        const clicks = parseInt(row.clicks || 0)
        const impressions = parseInt(row.impressions || 0)
        const cpc = parseFloat(row.cpc || 0)
        const ctr = parseFloat(row.ctr || 0)

        byAdSet[id].spend += spend
        byAdSet[id].clicks += clicks
        byAdSet[id].impressions += impressions

        byAdSet[id].placements.push({
          publisher: row.publisher_platform || '',
          position: row.platform_position || '',
          label: fmtPlacement(row.publisher_platform, row.platform_position),
          spend,
          clicks,
          impressions,
          cpc,
          ctr,
          health: placementStatus(row.platform_position || '', spend),
        })
      }

      // Sort placements by spend desc, compute adset-level CTR & CPC
      const processed = Object.values(byAdSet).map(as => {
        as.placements.sort((a, b) => b.spend - a.spend)
        as.ctr = as.impressions > 0 ? (as.clicks / as.impressions) * 100 : 0
        as.cpc = as.clicks > 0 ? as.spend / as.clicks : 0

        // Apply performance-gated excludes, then spend-drain detection
        as.placements = applyPerfExcludes(as.placements)
        as.placements = flagSpendDrains(as.placements, as.spend, as.ctr)

        as.score = calcScore(as.placements)
        as.scoreConf = scoreConfig(as.score)

        // Build recommendation text
        const excludeLabels = [...new Set(
          as.placements
            .filter(p => p.health.status === 'exclude')
            .map(p => p.health.label.replace('Exclude — ', ''))
        )]
        const drainItems = as.placements.filter(p => p.health.status === 'drain')

        const recs = []
        if (excludeLabels.length > 0)
          recs.push(`Exclude ${excludeLabels.join(', ')} in Ads Manager`)
        if (drainItems.length > 0) {
          drainItems.forEach(p => {
            recs.push(`${p.label} took $${p.drainSpend.toFixed(2)} (${p.drainPct}% of spend) with almost no results — exclude or test it separately`)
          })
        }
        as.recommendation = recs.length > 0 ? recs : null

        return as
      })

      // Sort by spend desc
      processed.sort((a, b) => b.spend - a.spend)
      setCached(date, processed)
      setCachedAt(Date.now())
      setAdSets(processed)
    } catch (e) {
      setError(e.message || 'Failed to fetch Meta data')
    } finally {
      setLoading(false)
    }
  }, [integration, date])

  useEffect(() => { if (!loadingCreds) fetchData() }, [fetchData, loadingCreds])

  // Summary stats
  const totalSpend = adSets.reduce((s, a) => s + a.spend, 0)
  const totalClicks = adSets.reduce((s, a) => s + a.clicks, 0)
  const totalImpressions = adSets.reduce((s, a) => s + a.impressions, 0)
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const flagCount = adSets.reduce((s, a) => s + a.placements.filter(p => p.health.status === 'exclude' || p.health.status === 'drain').length, 0)
  const wastedSpend = adSets.reduce((s, a) => s + a.placements
    .filter(p => p.health.status === 'exclude' || p.health.status === 'drain')
    .reduce((ps, p) => ps + p.spend, 0), 0)
  // Deduplicated action list: group identical rec text across ad sets
  const allRecs = (() => {
    const map = {}
    for (const a of adSets) {
      for (const r of (a.recommendation || [])) {
        if (!map[r]) map[r] = []
        map[r].push(a.name)
      }
    }
    return Object.entries(map).map(([rec, adsets]) => ({ rec, adsets }))
  })()
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0

  // Scale targets: healthy score, spend >= 5% of daily total (min $2), above-avg CTR or below-avg CPC
  const spendFloor = Math.max(2, totalSpend * 0.05)
  const scaleTargets = adSets
    .filter(a => a.score === 100 && a.spend >= spendFloor && (a.ctr > avgCtr * 1.05 || (avgCpc > 0 && a.cpc < avgCpc * 0.95)))
    .map(a => {
      const tips = []
      if (avgCtr > 0 && a.ctr > avgCtr * 1.2)
        tips.push(`CTR is ${Math.round((a.ctr / avgCtr - 1) * 100)}% above your account average — consider increasing daily budget 20–30%`)
      else if (avgCtr > 0 && a.ctr > avgCtr * 1.05)
        tips.push(`CTR is above your account average — stable performer worth scaling gradually`)
      if (avgCpc > 0 && a.cpc < avgCpc * 0.8)
        tips.push(`CPC is ${Math.round((1 - a.cpc / avgCpc) * 100)}% below account average — most cost-efficient ad today`)
      else if (avgCpc > 0 && a.cpc < avgCpc * 0.95)
        tips.push(`Below-average CPC ($${a.cpc.toFixed(2)}) — cost-efficient, room to increase spend`)
      // Best placement: highest CTR with at least $2 spend
      const bestPlacement = [...a.placements]
        .filter(p => p.health.status === 'good' && p.spend >= 2 && p.ctr > 0)
        .sort((x, y) => y.ctr - x.ctr)[0]
      if (bestPlacement)
        tips.push(`Best placement: ${bestPlacement.label} at ${bestPlacement.ctr.toFixed(1)}% CTR — consider a ${bestPlacement.label.split(' ').slice(-1)[0]}-only campaign`)
      return { ...a, scaleTips: tips }
    })
    .sort((a, b) => (b.ctr / (b.cpc || 1)) - (a.ctr / (a.cpc || 1)))

  const isToday = date === toYMD(new Date())

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  function ScoreCircle({ score, conf }) {
    const r = 22
    const circ = 2 * Math.PI * r
    const dash = (score / 100) * circ
    return (
      <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
        <svg width="56" height="56" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="28" cy="28" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
          <circle cx="28" cy="28" r={r} fill="none" stroke={conf.color} strokeWidth="4"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        </svg>
        <span style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '0.78rem', fontWeight: 800, color: conf.color
        }}>{score}</span>
      </div>
    )
  }

  function StatPill({ label, value }) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        background: '#f8fafc', borderRadius: 8, padding: '6px 12px', minWidth: 72
      }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{value}</span>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <AppHeader page="ad-health" storeName={storeName}
        onSignOut={async () => { await supabase.auth.signOut(); navigate('/login') }} />

      {/* Credentials loading skeleton */}
      {loadingCreds && (
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 16px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32, color: '#64748b' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 4 }}>Connecting to Meta Ads…</div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Checking credentials</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', height: 120, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}

      {!loadingCreds && (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>

        {/* No integration configured */}
        {error === 'no_integration' && (
          <div style={{
            background: '#fff', borderRadius: 14, padding: 32, textAlign: 'center',
            border: '1.5px solid #e2e8f0', marginTop: 32
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
            <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Meta Ads not connected</p>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 20 }}>
              Add your Meta access token and ad account ID in Settings to unlock Ad Health.
            </p>
            <Link
              to="/settings"
              style={{
                display: 'inline-block',
                background: '#1e293b', color: '#fff',
                padding: '10px 24px', borderRadius: 10,
                textDecoration: 'none', fontWeight: 600, fontSize: '0.85rem'
              }}
            >Go to Settings →</Link>
          </div>
        )}

        {error && error !== 'no_integration' && (
          <div style={{
            background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12,
            padding: '16px 20px', color: '#dc2626', fontSize: '0.85rem', marginBottom: 20
          }}>
            <strong>Meta API error:</strong> {error}
            <button
              onClick={() => fetchData(true)}
              style={{ marginLeft: 16, background: 'none', border: 'none', color: '#dc2626', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}
            >Retry</button>
          </div>
        )}

        {!error && (
          <>
            {/* Date navigator + summary bar */}
            <div style={{
              background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0',
              padding: '14px 20px', marginBottom: 16,
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12
            }}>
              {/* Date nav */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setDate(d => addDays(d, -1))} style={navBtn}>‹</button>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a', minWidth: 80, textAlign: 'center' }}>
                  {fmtDisplay(date)}
                </span>
                <button onClick={() => setDate(d => addDays(d, 1))} disabled={isToday} style={{ ...navBtn, opacity: isToday ? 0.3 : 1 }}>›</button>
              </div>

              {/* Cache status */}
              {cachedAt && !loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', color: '#94a3b8' }}>
                  {fromCache && <span style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: 20, padding: '2px 8px', fontWeight: 700, fontSize: '0.65rem' }}>⚡ CACHED</span>}
                  <span>Updated {Math.round((Date.now() - cachedAt) / 60000) < 1 ? 'just now' : `${Math.round((Date.now() - cachedAt) / 60000)}m ago`}</span>
                  <button
                    onClick={() => fetchData(true)}
                    style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: '0.72rem', color: '#64748b' }}
                  >↻ Refresh</button>
                </div>
              )}

              <div style={{ width: 1, background: '#e2e8f0', height: 28, margin: '0 4px' }} />

              {/* Summary stats */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1 }}>
                <StatPill label="Total Spend" value={loading ? '—' : `$${totalSpend.toFixed(2)}`} />
                <StatPill label="Total Clicks" value={loading ? '—' : totalClicks.toLocaleString()} />
                <StatPill label="Avg CTR" value={loading ? '—' : `${avgCtr.toFixed(2)}%`} />
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  background: flagCount > 0 ? '#fef2f2' : '#f8fafc',
                  borderRadius: 8, padding: '6px 12px', minWidth: 72
                }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: flagCount > 0 ? '#ef4444' : '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Flags</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: flagCount > 0 ? '#dc2626' : '#0f172a', marginTop: 2 }}>
                    {loading ? '—' : flagCount}
                  </span>
                </div>
                {!loading && wastedSpend > 0 && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    background: '#fef2f2', borderRadius: 8, padding: '6px 12px', minWidth: 72
                  }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#ef4444', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Wasted</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#dc2626', marginTop: 2 }}>${wastedSpend.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action checklist */}
            {!loading && allRecs.length > 0 && (
              <div style={{
                background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14,
                marginBottom: 16, overflow: 'hidden'
              }}>
                <button
                  onClick={() => setActionListOpen(o => !o)}
                  style={{
                    width: '100%', padding: '12px 20px', background: 'none', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#92400e' }}>
                    📋 Today's Action List — {allRecs.length} item{allRecs.length !== 1 ? 's' : ''}
                  </span>
                  <span style={{ color: '#92400e', fontSize: '0.8rem' }}>{actionListOpen ? '▲' : '▼'}</span>
                </button>
                {actionListOpen && (
                  <div style={{ padding: '0 20px 16px' }}>
                    {allRecs.map((item, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, padding: '6px 0',
                        borderTop: i === 0 ? '1px solid #fde68a' : '1px solid #fef3c7'
                      }}>
                        <span style={{ color: '#d97706', fontWeight: 700, flexShrink: 0 }}>→</span>
                        <div>
                          <div style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 600 }}>{item.rec}</div>
                          <div style={{ fontSize: '0.68rem', color: '#b45309', marginTop: 2 }}>
                            {item.adsets.length === 1
                              ? item.adsets[0]
                              : item.adsets.length <= 3
                                ? item.adsets.join(', ')
                                : `${item.adsets.slice(0, 2).join(', ')} +${item.adsets.length - 2} more`
                            }
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Scale opportunities */}
            {!loading && scaleTargets.length > 0 && (
              <div style={{
                background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 14,
                marginBottom: 16, overflow: 'hidden'
              }}>
                <button
                  onClick={() => setScaleOpen(o => !o)}
                  style={{
                    width: '100%', padding: '12px 20px', background: 'none', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#166534' }}>
                    📈 Scale Opportunities — {scaleTargets.length} ad{scaleTargets.length !== 1 ? 's' : ''}
                  </span>
                  <span style={{ color: '#166534', fontSize: '0.8rem' }}>{scaleOpen ? '▲' : '▼'}</span>
                </button>
                {scaleOpen && (
                  <div style={{ padding: '0 20px 16px' }}>
                    {scaleTargets.map((a, i) => (
                      <div key={a.id} style={{
                        padding: '10px 0',
                        borderTop: i === 0 ? '1px solid #bbf7d0' : '1px solid #dcfce7'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#14532d' }}>{a.name}</span>
                          <span style={{ fontSize: '0.68rem', background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>✅ HEALTHY</span>
                          <span style={{ fontSize: '0.72rem', color: '#166534' }}>${a.spend.toFixed(2)} spend · {a.ctr.toFixed(2)}% CTR · ${a.cpc.toFixed(2)} CPC</span>
                        </div>
                        {a.scaleTips.map((tip, j) => (
                          <div key={j} style={{ display: 'flex', gap: 8, marginTop: j > 0 ? 4 : 0 }}>
                            <span style={{ color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>→</span>
                            <span style={{ fontSize: '0.78rem', color: '#166534' }}>{tip}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ textAlign: 'center', padding: '8px 0 4px', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>
                  Fetching from Meta Ads…
                </div>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{
                    background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0',
                    height: 120, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.12}s`
                  }} />
                ))}
              </div>
            )}

            {/* No data */}
            {!loading && adSets.length === 0 && !error && (
              <div style={{
                background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0',
                padding: 40, textAlign: 'center', color: '#94a3b8'
              }}>
                <p style={{ fontSize: '0.9rem' }}>No ad data found for {fmtDisplay(date)}.</p>
                <p style={{ fontSize: '0.8rem', marginTop: 6 }}>Try a different date.</p>
              </div>
            )}

            {/* Ad set cards */}
            {!loading && adSets.map(as => {
              const conf = as.scoreConf
              return (
                <div key={as.id} style={{
                  background: '#fff', borderRadius: 14,
                  border: `1.5px solid ${conf.border}`,
                  marginBottom: 14, overflow: 'hidden'
                }}>
                  {/* Card header */}
                  <div style={{
                    background: conf.bg, borderBottom: `1px solid ${conf.border}`,
                    padding: '12px 20px', display: 'flex', alignItems: 'flex-start', gap: 14
                  }}>
                    <ScoreCircle score={as.score} conf={conf} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 800, color: conf.color,
                          background: '#fff', border: `1.5px solid ${conf.border}`,
                          padding: '2px 8px', borderRadius: 20, letterSpacing: '0.04em'
                        }}>{conf.label}</span>
                        <span style={{ fontSize: '0.72rem', color: conf.color, fontWeight: 700 }}>{conf.badge}</span>
                      </div>
                      <p style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a', margin: '4px 0 2px', lineHeight: 1.3 }}>
                        {as.name}
                      </p>
                      <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
                        Campaign: {as.campaignName || as.campaignId}
                      </p>
                    </div>
                  </div>

                  {/* Stat pills */}
                  <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: 8, borderBottom: '1px solid #f1f5f9' }}>
                    <StatPill label="Spend" value={`$${as.spend.toFixed(2)}`} />
                    <StatPill label="Clicks" value={as.clicks.toLocaleString()} />
                    <StatPill label="Avg CPC" value={`$${as.cpc.toFixed(2)}`} />
                    <StatPill label="CTR" value={`${as.ctr.toFixed(2)}%`} />
                    <StatPill label="Impressions" value={as.impressions.toLocaleString()} />
                  </div>

                  {/* Placement health table */}
                  <div style={{ padding: '12px 20px' }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                      Placement Health
                    </p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          {['Placement', 'Spend', 'CPC', 'CTR', 'Status'].map(h => (
                            <th key={h} style={{ textAlign: h === 'Placement' || h === 'Status' ? 'left' : 'right', padding: '4px 8px', color: '#94a3b8', fontWeight: 600, fontSize: '0.68rem' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {as.placements.map((p, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '5px 8px', color: '#334155', fontWeight: 500 }}>{p.label}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: '#334155' }}>${p.spend.toFixed(2)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: '#334155' }}>${p.cpc.toFixed(2)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: '#334155' }}>{p.ctr.toFixed(2)}%</td>
                            <td style={{ padding: '5px 8px' }}>
                              <span style={{
                                fontSize: '0.68rem', fontWeight: 700,
                                color: p.health.status === 'exclude' ? '#dc2626' : p.health.status === 'drain' ? '#d97706' : '#16a34a',
                                background: p.health.status === 'exclude' ? '#fef2f2' : p.health.status === 'drain' ? '#fffbeb' : '#f0fdf4',
                                padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap'
                              }}>
                                {p.health.label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {as.recommendation && (
                      <div style={{
                        marginTop: 10, padding: '8px 12px',
                        background: '#fffbeb', border: '1px solid #fde68a',
                        borderRadius: 8, fontSize: '0.78rem', color: '#92400e'
                      }}>
                        {as.recommendation.map((rec, i) => (
                          <p key={i} style={{ margin: i === 0 ? 0 : '4px 0 0' }}>
                            {i === 0 ? '💡 ' : '• '}{rec}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

const navBtn = {
  background: 'none', border: '1.5px solid #e2e8f0', borderRadius: 8,
  width: 30, height: 30, cursor: 'pointer', fontWeight: 700, fontSize: '1rem',
  color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1, padding: 0
}
