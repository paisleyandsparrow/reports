import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { parseEarningsCsv } from '../lib/parseEarningsCsv'
import AppHeader from '../components/AppHeader'
import { categorize } from '../components/CampaignCard'

export default function SettingsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const fromAdHealth = new URLSearchParams(location.search).get('from') === 'ad-health'
  const [userId, setUserId] = useState(null)
  const [userEmail, setUserEmail] = useState('')
  const [storeName, setStoreName] = useState('')
  const [existingCount, setExistingCount] = useState(null)
  const [csvState, setCsvState] = useState({ status: 'idle', fileName: '', rows: [], totalIncome: 0, totalRevenue: 0, errors: [] })
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const fileInputRef = useRef(null)

  // Meta Ads integration state
  const [metaToken, setMetaToken] = useState('')
  const [metaAccountId, setMetaAccountId] = useState('')
  const [metaShowToken, setMetaShowToken] = useState(false)
  const [metaSaving, setMetaSaving] = useState(false)
  const [metaSaveResult, setMetaSaveResult] = useState(null) // null | 'saved' | 'error'
  const [metaConnected, setMetaConnected] = useState(false)

  // Monthly earnings goal
  const [monthlyGoal, setMonthlyGoal] = useState('')
  const [goalSaving, setGoalSaving] = useState(false)
  const [goalSaveResult, setGoalSaveResult] = useState(null)

  // Automation settings state
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [maxPerDay, setMaxPerDay] = useState('500')
  const [maxPerRun, setMaxPerRun] = useState('100')
  const [runStartHour, setRunStartHour] = useState('8')
  const [runEndHour, setRunEndHour] = useState('20')
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSaveResult, setAutoSaveResult] = useState(null)

  // Billing state
  const [billing, setBilling] = useState(null) // { is_paid, subscription_status, trial_ends_at }
  const [portalLoading, setPortalLoading] = useState(false)

  async function openBillingPortal() {
    setPortalLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await supabase.functions.invoke('create-portal-session', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.data?.url) {
        window.location.href = res.data.url
      } else {
        alert(res.data?.error || 'Could not open billing portal')
      }
    } catch (e) {
      alert('Could not open billing portal')
    } finally {
      setPortalLoading(false)
    }
  }

  // Amazon session state
  const [amazonSession, setAmazonSession] = useState(null)

  // Auto-accept rules state
  const [rules, setRules] = useState([])
  const [newRuleCategory, setNewRuleCategory] = useState('')
  const [newRuleMinCommission, setNewRuleMinCommission] = useState('')
  const [newRuleBrand, setNewRuleBrand] = useState('')
  const [addingRule, setAddingRule] = useState(false)
  const [ruleQueuedCount, setRuleQueuedCount] = useState(null)
  const [rulePreviewCount, setRulePreviewCount] = useState(null)
  const [rulePreviewLoading, setRulePreviewLoading] = useState(false)

  // Live preview: count catalog matches as user fills in rule form
  useEffect(() => {
    const hasAny = newRuleCategory || newRuleMinCommission || newRuleBrand.trim()
    if (!hasAny) {
      setRulePreviewCount(null)
      return
    }
    setRulePreviewLoading(true)
    const timer = setTimeout(async () => {
      try {
        // browse_nodes is a text[] array — ilike doesn't work server-side, filter in JS
        const { data: rows } = await supabase
          .from('cc_campaign_catalog')
          .select('campaign_id, browse_nodes, commission_rate, brand_name')
          .limit(1000)
        const cat = newRuleCategory.trim()
        const brand = newRuleBrand.toLowerCase().trim()
        const minComm = newRuleMinCommission ? Number(newRuleMinCommission) : null
        const matches = (rows || []).filter(c => {
          if (cat && !categorize(c).includes(cat)) return false
          if (minComm !== null && parseFloat(c.commission_rate ?? 0) < minComm) return false
          if (brand && !(c.brand_name || '').toLowerCase().includes(brand)) return false
          return true
        })
        setRulePreviewCount(matches.length)
      } catch {
        setRulePreviewCount(null)
      } finally {
        setRulePreviewLoading(false)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [newRuleCategory, newRuleMinCommission, newRuleBrand])

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUserId(session.user.id)
      setUserEmail(session.user.email || '')
      const { data: profile } = await supabase
        .from('user_preferences')
        .select('store_name, is_paid, subscription_status, trial_ends_at, stripe_customer_id')
        .eq('id', session.user.id)
        .maybeSingle()
      setStoreName(profile?.store_name || '')
      setBilling(profile ? {
        is_paid: profile.is_paid,
        subscription_status: profile.subscription_status,
        trial_ends_at: profile.trial_ends_at,
        stripe_customer_id: profile.stripe_customer_id,
      } : null)
      const { count } = await supabase
        .from('creator_connections_revenue')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
      setExistingCount(count ?? 0)

      // Load existing Meta integration
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('access_token, ad_account_id')
        .eq('user_id', session.user.id)
        .eq('integration_type', 'meta_ads')
        .maybeSingle()
      if (integration) {
        setMetaToken(integration.access_token || '')
        setMetaAccountId(integration.ad_account_id || '')
        setMetaConnected(!!(integration.access_token && integration.ad_account_id))
      }

      // Load earnings goal
      try {
        const { data: goalData } = await supabase
          .from('user_preferences')
          .select('monthly_earnings_goal, acceptance_enabled, max_campaigns_per_day, max_per_run, run_start_hour, run_end_hour')
          .eq('id', session.user.id)
          .maybeSingle()
        if (goalData?.monthly_earnings_goal) setMonthlyGoal(String(goalData.monthly_earnings_goal))
        if (goalData) {
          setAutoEnabled(!!goalData.acceptance_enabled)
          if (goalData.max_campaigns_per_day != null) setMaxPerDay(String(goalData.max_campaigns_per_day))
          if (goalData.max_per_run != null) setMaxPerRun(String(goalData.max_per_run))
          if (goalData.run_start_hour != null) setRunStartHour(String(goalData.run_start_hour))
          if (goalData.run_end_hour != null) setRunEndHour(String(goalData.run_end_hour))
        }
      } catch { /* columns may not exist yet */ }

      // Load auto-accept rules
      try {
        const { data: rulesData } = await supabase
          .from('user_campaign_rules')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('enabled', true)
          .order('created_at', { ascending: true })
        if (rulesData) setRules(rulesData)
      } catch { /* table may not exist yet */ }

      // Load Amazon session info
      try {
        const { data: amzSession } = await supabase
          .from('user_amazon_sessions')
          .select('captured_at, expires_at, is_valid')
          .eq('user_id', session.user.id)
          .maybeSingle()
        if (amzSession) setAmazonSession(amzSession)
      } catch { /* table may not exist yet */ }
    }
    init()
  }, [])

  async function handleSaveMeta() {
    if (!userId) return
    setMetaSaving(true)
    setMetaSaveResult(null)
    try {
      const accountId = metaAccountId.trim().startsWith('act_')
        ? metaAccountId.trim()
        : `act_${metaAccountId.trim()}`
      const { error } = await supabase
        .from('user_integrations')
        .upsert({
          user_id: userId,
          integration_type: 'meta_ads',
          access_token: metaToken.trim(),
          ad_account_id: accountId,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,integration_type' })
      if (error) throw error
      setMetaAccountId(accountId)
      setMetaConnected(!!(metaToken.trim() && accountId))
      setMetaSaveResult('saved')
    } catch {
      setMetaSaveResult('error')
    } finally {
      setMetaSaving(false)
    }
  }

  async function handleSaveGoal() {
    if (!userId) return
    setGoalSaving(true)
    setGoalSaveResult(null)
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({ id: userId, monthly_earnings_goal: Number(monthlyGoal) }, { onConflict: 'id' })
      if (error) throw error
      setGoalSaveResult('saved')
      // Bust dashboard cache so it picks up the new goal
      sessionStorage.removeItem('dash_earning_30')
    } catch {
      setGoalSaveResult('error')
    } finally {
      setGoalSaving(false)
    }
  }

  async function handleSaveAutoSettings() {
    if (!userId) return
    setAutoSaving(true)
    setAutoSaveResult(null)
    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          id: userId,
          acceptance_enabled: autoEnabled,
          max_campaigns_per_day: Number(maxPerDay) || 500,
          max_per_run: Number(maxPerRun) || 100,
          run_start_hour: Number(runStartHour) || 8,
          run_end_hour: Number(runEndHour) || 20,
        }, { onConflict: 'id' })
      if (error) throw error
      setAutoSaveResult('saved')
    } catch {
      setAutoSaveResult('error')
    } finally {
      setAutoSaving(false)
    }
  }

  async function handleAddRule() {
    if (!userId || !newRuleCategory) return
    setAddingRule(true)
    setRuleQueuedCount(null)
    try {
      // 1. Save the rule
      const { data, error } = await supabase
        .from('user_campaign_rules')
        .insert({
          user_id: userId,
          category: newRuleCategory || null,
          min_commission: newRuleMinCommission ? Number(newRuleMinCommission) : null,
          brand_contains: newRuleBrand.trim() || null,
          enabled: true,
        })
        .select()
        .single()
      if (error) throw error
      setRules(prev => [...prev, data])

      // 2. Query catalog and filter client-side (browse_nodes is text[], ilike doesn't work on arrays)
      const { data: catalogRows } = await supabase
        .from('cc_campaign_catalog')
        .select('campaign_id, browse_nodes, commission_rate, brand_name')
        .limit(1000)
      const cat = newRuleCategory.trim()
      const brand = newRuleBrand.trim().toLowerCase()
      const minComm = newRuleMinCommission ? Number(newRuleMinCommission) : null
      const matches = (catalogRows || []).filter(c => {
        if (cat && !categorize(c).includes(cat)) return false
        if (minComm !== null && parseFloat(c.commission_rate ?? 0) < minComm) return false
        if (brand && !(c.brand_name || '').toLowerCase().includes(brand)) return false
        return true
      })

      // 3. Bulk-insert matches into queue, skip any already present (UNIQUE constraint)
      if (matches && matches.length > 0) {
        const now = new Date().toISOString()
        const rows = matches.map(m => ({
          user_id: userId,
          campaign_id: m.campaign_id,
          status: 'pending',
          marked_at: now,
        }))
        const { data: inserted } = await supabase
          .from('user_campaign_queue')
          .upsert(rows, { onConflict: 'user_id,campaign_id', ignoreDuplicates: true })
          .select('id')
        setRuleQueuedCount(inserted?.length ?? matches.length)
      } else {
        setRuleQueuedCount(0)
      }

      setNewRuleCategory('')
      setNewRuleMinCommission('')
      setNewRuleBrand('')
      setRulePreviewCount(null)
    } catch { /* ignore */ } finally {
      setAddingRule(false)
    }
  }

  async function handleDeleteRule(ruleId) {
    await supabase.from('user_campaign_rules').delete().eq('id', ruleId)
    setRules(prev => prev.filter(r => r.id !== ruleId))
  }

  function handleCsvFile(file) {
    if (!file) return
    setUploadResult(null)
    setCsvState({ status: 'parsing', fileName: file.name, rows: [], totalIncome: 0, totalRevenue: 0, errors: [] })
    const reader = new FileReader()
    reader.onload = e => {
      const { rows, totalIncome, totalRevenue, errors } = parseEarningsCsv(e.target.result)
      if (errors.length > 0 && rows.length === 0) {
        setCsvState({ status: 'error', fileName: file.name, rows: [], totalIncome: 0, totalRevenue: 0, errors })
      } else {
        setCsvState({ status: 'ready', fileName: file.name, rows, totalIncome, totalRevenue, errors })
      }
    }
    reader.readAsText(file)
  }

  async function handleUpload() {
    if (!userId || csvState.rows.length === 0) return
    setUploading(true)
    setUploadResult(null)
    try {
      const rowsWithUser = csvState.rows.map(r => ({ ...r, user_id: userId }))
      const BATCH = 500
      for (let i = 0; i < rowsWithUser.length; i += BATCH) {
        const { error } = await supabase
          .from('creator_connections_revenue')
          .upsert(rowsWithUser.slice(i, i + BATCH), { onConflict: 'user_id,date,campaign_title,asin' })
        if (error) throw error
      }
      setUploadResult({ success: true, count: csvState.rows.length })
      setExistingCount(c => (c ?? 0) + csvState.rows.length)
      setCsvState({ status: 'idle', fileName: '', rows: [], totalIncome: 0, totalRevenue: 0, errors: [] })
    } catch (err) {
      setUploadResult({ success: false, message: err.message })
    } finally {
      setUploading(false)
    }
  }

  const labelStyle = { display: 'block', fontSize: '0.66rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }
  const inputStyle = {
    width: '100%', border: '1px solid #f1ebe5', borderRadius: 14,
    padding: '12px 16px', fontSize: '0.92rem',
    background: '#faf5ef', color: '#1a1410', outline: 'none',
    fontFamily: 'inherit', transition: 'border-color .15s, background .15s',
  }
  const focusInput = e => { e.target.style.borderColor = '#ec4899'; e.target.style.background = '#fff' }
  const blurInput = e => { e.target.style.borderColor = '#f1ebe5'; e.target.style.background = '#faf5ef' }
  const primaryBtn = (disabled = false) => ({
    width: '100%', background: disabled ? '#d4c5b3' : '#1a1410', color: '#fbf7f3',
    border: 'none', borderRadius: 999, padding: '14px 22px',
    fontSize: '0.9rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', letterSpacing: '0.01em', transition: 'background .15s',
  })
  const sectionDivider = { height: 1, background: '#f1ebe5', margin: '40px 0' }
  const successText = { fontSize: '0.78rem', color: '#9d174d', textAlign: 'center', marginTop: 12, fontWeight: 500 }
  const errorText = { fontSize: '0.78rem', color: '#1a1410', textAlign: 'center', marginTop: 12 }
  const cardStyle = { background: '#fff', borderRadius: 28, border: '1px solid #f1ebe5', padding: '36px 32px', marginBottom: 24, scrollMarginTop: 24 }
  const sectionHeaderEyebrow = (color = '#ec4899') => ({ fontSize: '0.66rem', fontWeight: 700, color, letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 10px' })
  const sectionHeaderTitle = { fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.7rem', color: '#1a1410', letterSpacing: '-0.02em', margin: '0 0 6px', lineHeight: 1.15 }
  const sectionHeaderSub = { fontSize: '0.88rem', color: '#7a6b5d', margin: 0, lineHeight: 1.55 }

  // Derived statuses for the connection strip
  const amazonStatus = (() => {
    if (!amazonSession) return 'idle'
    if (!amazonSession.is_valid) return 'error'
    if (amazonSession.expires_at) {
      const days = Math.ceil((new Date(amazonSession.expires_at) - Date.now()) / 86400000)
      if (days <= 0) return 'error'
      if (days <= 7) return 'warning'
    }
    return 'connected'
  })()
  const metaStatus = metaConnected ? 'connected' : 'idle'
  const csvStatus = existingCount && existingCount > 0 ? 'connected' : 'idle'

  const pillTone = {
    connected: { bg: '#fdf2f8', fg: '#9d174d', dot: '#ec4899', label: 'Connected' },
    warning:   { bg: '#fff7ed', fg: '#92400e', dot: '#f59e0b', label: 'Renew soon' },
    error:     { bg: '#fff1f2', fg: '#9f1239', dot: '#e11d48', label: 'Action needed' },
    idle:      { bg: '#faf5ef', fg: '#a89485', dot: '#d4c5b3', label: 'Not connected' },
  }
  const StatusPill = ({ label, status, href }) => {
    const tone = pillTone[status]
    return (
      <a href={href} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderRadius: 16,
        background: tone.bg, color: tone.fg,
        border: `1px solid ${status === 'idle' ? '#f1ebe5' : 'transparent'}`,
        textDecoration: 'none', fontFamily: 'inherit',
        flex: 1, minWidth: 0, transition: 'transform .15s, box-shadow .15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(26,20,16,0.06)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 999, background: tone.dot, flexShrink: 0 }} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.75 }}>{label}</span>
          <span style={{ fontSize: '0.84rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tone.label}</span>
        </span>
      </a>
    )
  }
  const SectionHeader = ({ number, eyebrow, title, sub, right }) => (
    <header style={{ marginBottom: 26, display: 'flex', alignItems: 'flex-start', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={sectionHeaderEyebrow()}>
          {number} · {eyebrow}
        </p>
        <h2 style={sectionHeaderTitle}>{title}</h2>
        {sub && <p style={sectionHeaderSub}>{sub}</p>}
      </div>
      {right}
    </header>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#fbf7f3', fontFamily: 'Inter, sans-serif', color: '#1a1410' }}>
      <AppHeader page="settings" storeName={storeName}
        onSignOut={async () => { await supabase.auth.signOut(); navigate('/login') }} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 28px 80px' }}>

        {/* Editorial hero */}
        <div style={{ marginBottom: 36 }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 14 }}>
            Settings
          </p>
          <h1 style={{
            fontFamily: 'Georgia, serif', fontWeight: 400,
            fontSize: 'clamp(2rem, 4vw, 2.8rem)', color: '#1a1410',
            letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0,
          }}>
            Your <em style={{ color: '#ec4899', fontStyle: 'italic' }}>connections</em>, configured.
          </h1>
        </div>

        {/* Subscription status section */}
        {billing && (
          <div style={{ marginBottom: 32, padding: '20px 24px', borderRadius: 16, background: '#fff', border: '1px solid #f3e8ff' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.18em', textTransform: 'uppercase', margin: '0 0 12px' }}>Subscription</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 99, fontSize: '0.8rem', fontWeight: 600,
                background: billing.subscription_status === 'trialing' ? '#fef9c3' : billing.is_paid ? '#dcfce7' : '#fee2e2',
                color: billing.subscription_status === 'trialing' ? '#854d0e' : billing.is_paid ? '#15803d' : '#b91c1c',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                {billing.subscription_status === 'trialing' ? 'Free Trial'
                  : billing.subscription_status === 'active' ? 'Active'
                  : billing.subscription_status === 'past_due' ? 'Past Due'
                  : billing.subscription_status === 'cancelled' ? 'Cancelled'
                  : 'Inactive'}
              </span>
              {billing.subscription_status === 'trialing' && billing.trial_ends_at && (() => {
                const days = Math.ceil((new Date(billing.trial_ends_at) - new Date()) / 86400000)
                return (
                  <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                    {days > 0 ? `Trial ends in ${days} day${days !== 1 ? 's' : ''}` : 'Trial ending today'}
                  </span>
                )
              })()}
              {billing.subscription_status === 'active' && (
                <span style={{ fontSize: '0.82rem', color: '#6b7280' }}>Pro · $100/mo</span>
              )}
              {!billing.is_paid && billing.subscription_status !== 'trialing' && (
                <a href="/pricing" style={{ fontSize: '0.82rem', color: '#ec4899', fontWeight: 600, textDecoration: 'none' }}>Upgrade →</a>
              )}
              {billing.stripe_customer_id && (
                <button
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                  style={{
                    marginLeft: 'auto', padding: '5px 14px', borderRadius: 99,
                    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                    background: 'transparent', border: '1.5px solid #d1d5db',
                    color: '#374151', opacity: portalLoading ? 0.6 : 1,
                  }}
                >
                  {portalLoading ? 'Loading…' : 'Manage subscription →'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Connection status strip */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          <StatusPill label="Amazon" status={amazonStatus} href="#automation" />
          <StatusPill label="Meta Ads" status={metaStatus} href="#meta" />
          <StatusPill label="Earnings CSV" status={csvStatus} href="#data" />
        </div>

        {fromAdHealth && (
          <div style={{
            marginBottom: 24, padding: '16px 20px', borderRadius: 16,
            background: '#1a1410', color: '#fbf7f3',
            fontSize: '0.85rem', lineHeight: 1.55,
          }}>
            To use Ad Health, add your <strong style={{ color: '#fbcfe8' }}>Meta access token</strong> and <strong style={{ color: '#fbcfe8' }}>ad account ID</strong> below and save.
          </div>
        )}

        {/* Amazon session warning */}
        {(() => {
          if (!amazonSession) return (
            <div style={{
              marginBottom: 24, padding: '14px 18px', borderRadius: 14,
              background: '#fff7ed', border: '1px solid #fed7aa',
              fontSize: '0.82rem', lineHeight: 1.55, color: '#92400e',
            }}>
              <strong>Amazon session not connected.</strong> Install the Paisley &amp; Sparrow Chrome extension and click <em>Capture Amazon Session</em> to enable automated campaign acceptance.
            </div>
          )
          if (!amazonSession.is_valid) return (
            <div style={{
              marginBottom: 24, padding: '14px 18px', borderRadius: 14,
              background: '#fff1f2', border: '1px solid #fecdd3',
              fontSize: '0.82rem', lineHeight: 1.55, color: '#9f1239',
            }}>
              <strong>Amazon session invalidated.</strong> Open the Chrome extension and recapture your session to restore automated acceptance.
            </div>
          )
          if (amazonSession.expires_at) {
            const days = Math.ceil((new Date(amazonSession.expires_at) - Date.now()) / 86400000)
            if (days <= 0) return (
              <div style={{
                marginBottom: 24, padding: '14px 18px', borderRadius: 14,
                background: '#fff1f2', border: '1px solid #fecdd3',
                fontSize: '0.82rem', lineHeight: 1.55, color: '#9f1239',
              }}>
                <strong>Amazon session expired.</strong> Open the Chrome extension and recapture your session.
              </div>
            )
            if (days <= 7) return (
              <div style={{
                marginBottom: 24, padding: '14px 18px', borderRadius: 14,
                background: '#fff7ed', border: '1px solid #fed7aa',
                fontSize: '0.82rem', lineHeight: 1.55, color: '#92400e',
              }}>
                <strong>Amazon session expires in {days} day{days === 1 ? '' : 's'}.</strong> Open the Chrome extension soon and recapture your session to avoid interruptions.
              </div>
            )
          }
          return null
        })()}

        {/* Card 01 — Connections (Meta Ads) */}
        <section id="meta" style={cardStyle}>
          <SectionHeader
            number="01"
            eyebrow="Connections"
            title="Meta Ads"
            sub={<>Powers the <Link to="/ad-health" style={{ color: '#ec4899', textDecoration: 'underline' }}>Ad Health</Link> dashboard. Your token stays private.</>}
            right={metaConnected
              ? <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9d174d', background: '#fdf2f8', padding: '5px 12px', borderRadius: 999, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Connected</span>
              : <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#a89485', background: '#faf5ef', padding: '5px 12px', borderRadius: 999, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Not connected</span>
            }
          />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle}>Access token</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={metaShowToken ? 'text' : 'password'}
                    value={metaToken}
                    onChange={e => { setMetaToken(e.target.value); setMetaSaveResult(null) }}
                    placeholder="EAAxxxxxxxxxxxxxxx..."
                    style={{ ...inputStyle, paddingRight: 64, fontFamily: '"SF Mono", monospace', fontSize: '0.82rem' }}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                  <button
                    type="button"
                    onClick={() => setMetaShowToken(v => !v)}
                    style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      fontSize: '0.7rem', color: '#7a6b5d', background: 'none', border: 'none',
                      cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}
                  >
                    {metaShowToken ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p style={{ fontSize: '0.74rem', color: '#a89485', marginTop: 6, lineHeight: 1.5 }}>
                  Meta Business Suite → Settings → System Users → Generate Token.
                </p>
              </div>

              <div>
                <label style={labelStyle}>Ad account ID</label>
                <input
                  type="text"
                  value={metaAccountId}
                  onChange={e => { setMetaAccountId(e.target.value); setMetaSaveResult(null) }}
                  placeholder="act_123456789"
                  style={{ ...inputStyle, fontFamily: '"SF Mono", monospace', fontSize: '0.82rem' }}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
                <p style={{ fontSize: '0.74rem', color: '#a89485', marginTop: 6, lineHeight: 1.5 }}>
                  Found in Meta Ads Manager URL. The <code style={{ background: '#faf5ef', padding: '1px 5px', borderRadius: 4 }}>act_</code> prefix is optional.
                </p>
              </div>

              <button
                onClick={handleSaveMeta}
                disabled={metaSaving || !metaToken.trim() || !metaAccountId.trim()}
                style={primaryBtn(metaSaving || !metaToken.trim() || !metaAccountId.trim())}
                onMouseEnter={e => { if (!(metaSaving || !metaToken.trim() || !metaAccountId.trim())) e.currentTarget.style.background = '#2a1f18' }}
                onMouseLeave={e => { if (!(metaSaving || !metaToken.trim() || !metaAccountId.trim())) e.currentTarget.style.background = '#1a1410' }}
              >
                {metaSaving ? 'Saving…' : 'Save integration'}
              </button>

              {metaSaveResult === 'saved' && (
                <p style={successText}>Integration saved. <Link to="/ad-health" style={{ color: '#ec4899', textDecoration: 'underline' }}>View Ad Health →</Link></p>
              )}
              {metaSaveResult === 'error' && (
                <p style={errorText}>Could not save. Try again.</p>
              )}
            </div>
        </section>

        {/* Card 02 — Automation (Bulk acceptance + Auto-accept rules) */}
        <section id="automation" style={cardStyle}>
          <SectionHeader
            number="02"
            eyebrow="Automation"
            title="Bulk acceptance & rules"
            sub="Two halves of the same engine. Set the limits below, then add rules to keep the queue full."
            right={
              <button
                onClick={() => { setAutoEnabled(v => !v); setAutoSaveResult(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', padding: 0,
                }}
              >
                <div style={{
                  width: 40, height: 22, borderRadius: 999,
                  background: autoEnabled ? '#1a1410' : '#e8dfd6',
                  position: 'relative', transition: 'background .2s',
                  flexShrink: 0,
                }}>
                  <div style={{
                    position: 'absolute', top: 3, left: autoEnabled ? 21 : 3,
                    width: 16, height: 16, borderRadius: 999,
                    background: '#fff', transition: 'left .2s',
                  }} />
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: autoEnabled ? '#1a1410' : '#a89485' }}>
                  {autoEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </button>
            }
          />

          {/* Sub-section A: Acceptance limits */}
          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: '0.66rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.18em', textTransform: 'uppercase', margin: '0 0 14px' }}>Acceptance limits</p>
            <p style={{ fontSize: '0.85rem', color: '#a89485', margin: '0 0 18px', lineHeight: 1.55 }}>
              How many campaigns the automation accepts per day and per run. Runs every 2 hours during your active window.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Max per day</label>
                <input type="number" min="1" max="5000" value={maxPerDay}
                  onChange={e => { setMaxPerDay(e.target.value); setAutoSaveResult(null) }}
                  style={inputStyle} onFocus={focusInput} onBlur={blurInput} placeholder="500" />
              </div>
              <div>
                <label style={labelStyle}>Max per run</label>
                <input type="number" min="1" max="5000" value={maxPerRun}
                  onChange={e => { setMaxPerRun(e.target.value); setAutoSaveResult(null) }}
                  style={inputStyle} onFocus={focusInput} onBlur={blurInput} placeholder="100" />
              </div>
              <div>
                <label style={labelStyle}>Start hour (24h)</label>
                <input type="number" min="0" max="23" value={runStartHour}
                  onChange={e => { setRunStartHour(e.target.value); setAutoSaveResult(null) }}
                  style={inputStyle} onFocus={focusInput} onBlur={blurInput} placeholder="8" />
              </div>
              <div>
                <label style={labelStyle}>End hour (24h)</label>
                <input type="number" min="0" max="23" value={runEndHour}
                  onChange={e => { setRunEndHour(e.target.value); setAutoSaveResult(null) }}
                  style={inputStyle} onFocus={focusInput} onBlur={blurInput} placeholder="20" />
              </div>
            </div>

            {runStartHour && runEndHour && Number(runEndHour) > Number(runStartHour) && (
              <p style={{ fontSize: '0.78rem', color: '#a89485', margin: '0 0 20px', lineHeight: 1.6 }}>
                {(() => {
                  const start = Number(runStartHour), end = Number(runEndHour)
                  const runs = []
                  for (let h = start; h < end; h += 2) runs.push(`${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`)
                  const perRun = Math.min(Number(maxPerRun) || 100, Math.ceil((Number(maxPerDay) || 500) / runs.length))
                  return `${runs.length} runs · ${runs.join(', ')} · ~${perRun} campaigns each`
                })()}
              </p>
            )}

            <button
              onClick={handleSaveAutoSettings}
              disabled={autoSaving}
              style={{ ...primaryBtn(autoSaving), marginBottom: 0 }}
              onMouseEnter={e => { if (!autoSaving) e.currentTarget.style.background = '#2a1f18' }}
              onMouseLeave={e => { if (!autoSaving) e.currentTarget.style.background = '#1a1410' }}
            >
              {autoSaving ? 'Saving…' : 'Save automation settings'}
            </button>
            {autoSaveResult === 'saved' && <p style={successText}>Saved.</p>}
            {autoSaveResult === 'error' && <p style={errorText}>Could not save.</p>}
          </div>

          <div style={sectionDivider} />

          {/* Sub-section B: Auto-accept rules */}
          <div>
            <p style={{ fontSize: '0.66rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.18em', textTransform: 'uppercase', margin: '0 0 14px' }}>Auto-accept rules</p>
            <p style={{ fontSize: '0.85rem', color: '#a89485', margin: '0 0 22px', lineHeight: 1.55 }}>
              Campaigns matching any rule will be automatically queued. Manually queued campaigns always run too.
            </p>

            {/* Existing rules */}
            {rules.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {rules.map(rule => (
                  <div key={rule.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', background: '#faf5ef', borderRadius: 14,
                    border: '1px solid #f1ebe5', gap: 12, flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                      {rule.category && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 12px', borderRadius: 999, background: '#fdf2f8', color: '#9d174d' }}>{rule.category}</span>
                      )}
                      {rule.min_commission != null && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 12px', borderRadius: 999, background: '#f0fdf4', color: '#166534' }}>≥{rule.min_commission}%</span>
                      )}
                      {rule.brand_contains && (
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 12px', borderRadius: 999, background: '#eff6ff', color: '#1e40af' }}>brand: "{rule.brand_contains}"</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      style={{ fontSize: '0.72rem', color: '#a89485', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px', flexShrink: 0 }}
                      onMouseEnter={e => e.currentTarget.style.color = '#1a1410'}
                      onMouseLeave={e => e.currentTarget.style.color = '#a89485'}
                    >Remove</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add rule form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '20px', background: '#faf5ef', borderRadius: 18, border: '1px solid #f1ebe5' }}>
              <p style={{ fontSize: '0.66rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0 }}>New rule</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select
                    value={newRuleCategory}
                    onChange={e => { setNewRuleCategory(e.target.value); setRuleQueuedCount(null) }}
                    style={{
                      ...inputStyle,
                      cursor: 'pointer',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      paddingRight: 40,
                      backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'><path d='M1 1.5L6 6.5L11 1.5' stroke='%23a89485' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 16px center',
                      backgroundSize: '12px 8px',
                    }}
                    onFocus={focusInput} onBlur={blurInput}
                  >
                    <option value="">Any category</option>
                    {["Women's Fashion","Beauty & Skincare","Health & Wellness","Shoes","Jewelry & Accessories","Home & Kitchen","Fitness & Activewear","Men's Fashion","Kids & Baby","Pets","Electronics","Books & Lifestyle"].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Min commission %</label>
                  <input type="number" min="0" max="100" value={newRuleMinCommission}
                    onChange={e => { setNewRuleMinCommission(e.target.value); setRuleQueuedCount(null) }}
                    placeholder="e.g. 15"
                    style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Brand contains (optional)</label>
                <input type="text" value={newRuleBrand}
                  onChange={e => { setNewRuleBrand(e.target.value); setRuleQueuedCount(null) }}
                  placeholder="e.g. Nike"
                  style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
              </div>
              {(rulePreviewLoading || rulePreviewCount !== null) && (
                <p style={{ margin: 0, fontSize: '0.72rem', color: rulePreviewLoading ? '#a89485' : rulePreviewCount === 0 ? '#a89485' : '#166534', fontWeight: 600 }}>
                  {rulePreviewLoading
                    ? 'Checking catalog…'
                    : rulePreviewCount === 0
                      ? 'No matching campaigns in catalog right now'
                      : `This will add ${rulePreviewCount} campaign${rulePreviewCount === 1 ? '' : 's'} to your queue`}
                </p>
              )}
              <button
                onClick={handleAddRule}
                disabled={addingRule || (!newRuleCategory && !newRuleMinCommission && !newRuleBrand)}
                style={primaryBtn(addingRule || (!newRuleCategory && !newRuleMinCommission && !newRuleBrand))}
                onMouseEnter={e => { if (!(addingRule || (!newRuleCategory && !newRuleMinCommission && !newRuleBrand))) e.currentTarget.style.background = '#2a1f18' }}
                onMouseLeave={e => { if (!(addingRule || (!newRuleCategory && !newRuleMinCommission && !newRuleBrand))) e.currentTarget.style.background = '#1a1410' }}
              >
                {addingRule ? 'Queuing matches…' : ruleQueuedCount !== null ? `✓ ${ruleQueuedCount} queued` : 'Add rule'}
              </button>
            </div>
          </div>
        </section>

        {/* Card 03 — Tracking (Monthly goal) */}
        <section id="goal" style={cardStyle}>
          <SectionHeader
            number="03"
            eyebrow="Tracking"
            title="Monthly goal"
            sub="Set a target to track monthly progress on the dashboard."
          />
          <div>
            <label style={labelStyle}>Goal · USD</label>
            <input
              type="number"
              min="0"
              step="50"
              value={monthlyGoal}
              onChange={e => { setMonthlyGoal(e.target.value); setGoalSaveResult(null) }}
              placeholder="e.g. 2000"
              style={inputStyle}
              onFocus={focusInput}
              onBlur={blurInput}
            />
          </div>
          <button
            onClick={handleSaveGoal}
            disabled={goalSaving || monthlyGoal === ''}
            style={{ ...primaryBtn(goalSaving || monthlyGoal === ''), marginTop: 20 }}
            onMouseEnter={e => { if (!(goalSaving || monthlyGoal === '')) e.currentTarget.style.background = '#2a1f18' }}
            onMouseLeave={e => { if (!(goalSaving || monthlyGoal === '')) e.currentTarget.style.background = '#1a1410' }}
          >
            {goalSaving ? 'Saving…' : 'Save goal'}
          </button>
          {goalSaveResult === 'saved' && (
            <p style={successText}>Goal saved. <Link to="/dashboard" style={{ color: '#ec4899', textDecoration: 'underline' }}>See your progress →</Link></p>
          )}
          {goalSaveResult === 'error' && (
            <p style={errorText}>Could not save. Check that <code style={{ background: '#faf5ef', padding: '2px 6px', borderRadius: 4 }}>monthly_earnings_goal</code> exists on <code style={{ background: '#faf5ef', padding: '2px 6px', borderRadius: 4 }}>user_preferences</code>.</p>
          )}
        </section>

        {/* Card 04 — Data import (Earnings history) */}
        <section id="data" style={cardStyle}>
          <SectionHeader
            number="04"
            eyebrow="Data import"
            title="Earnings history"
            sub={existingCount !== null
              ? (existingCount > 0 ? `${existingCount.toLocaleString()} rows uploaded.` : 'No earnings data uploaded yet.')
              : 'Upload your Creator Connections earnings export.'}
          />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleCsvFile(e.dataTransfer.files[0]) }}
              style={{
                border: '1.5px dashed #e8dfd6', borderRadius: 18, padding: '36px 24px',
                textAlign: 'center', cursor: 'pointer',
                background: '#faf5ef', transition: 'all .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#ec4899'; e.currentTarget.style.background = '#fdf2f8' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8dfd6'; e.currentTarget.style.background = '#faf5ef' }}
            >
              {csvState.status === 'idle' && (
                <>
                  <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', color: '#1a1410', margin: '0 0 6px', letterSpacing: '-0.01em' }}>Drop a CSV, or click to browse</p>
                  <p style={{ fontSize: '0.78rem', color: '#a89485', margin: 0 }}>Creator Connections earnings export</p>
                </>
              )}
              {csvState.status === 'parsing' && (
                <p style={{ fontSize: '0.9rem', color: '#7a6b5d', margin: 0, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Parsing {csvState.fileName}…</p>
              )}
              {csvState.status === 'ready' && (
                <>
                  <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', color: '#9d174d', margin: '0 0 6px', letterSpacing: '-0.01em' }}>{csvState.fileName}</p>
                  <p style={{ fontSize: '0.78rem', color: '#7a6b5d', margin: 0 }}>
                    {csvState.rows.length.toLocaleString()} rows · ${csvState.totalIncome.toFixed(2)} earned · ${csvState.totalRevenue.toFixed(2)} revenue
                  </p>
                </>
              )}
              {csvState.status === 'error' && (
                <>
                  <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', color: '#1a1410', margin: '0 0 6px', letterSpacing: '-0.01em' }}>Could not parse file</p>
                  <p style={{ fontSize: '0.78rem', color: '#a89485', margin: 0 }}>{csvState.errors[0]}</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={e => handleCsvFile(e.target.files[0])}
              />
            </div>

            {csvState.status === 'ready' && csvState.errors.length > 0 && (
              <p style={{ fontSize: '0.78rem', color: '#a89485', marginTop: 10 }}>{csvState.errors.length} rows skipped due to parse errors.</p>
            )}

            {csvState.status === 'ready' && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                style={{ ...primaryBtn(uploading), marginTop: 18 }}
                onMouseEnter={e => { if (!uploading) e.currentTarget.style.background = '#2a1f18' }}
                onMouseLeave={e => { if (!uploading) e.currentTarget.style.background = '#1a1410' }}
              >
                {uploading ? 'Uploading…' : 'Upload earnings'}
              </button>
            )}

            {uploadResult?.success && (
              <p style={successText}>{uploadResult.count.toLocaleString()} rows uploaded.</p>
            )}
            {uploadResult?.success === false && (
              <p style={errorText}>Upload failed — {uploadResult.message}</p>
            )}

            <p style={{ fontSize: '0.78rem', color: '#a89485', textAlign: 'center', marginTop: 18, lineHeight: 1.55 }}>
              Amazon Associates → Creator Connections → Earnings → Download CSV.
              Re-uploading merges — no duplicates.
            </p>
        </section>

      </div>
    </div>
  )
}
