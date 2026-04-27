import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { parseEarningsCsv } from '../lib/parseEarningsCsv'
import AppHeader from '../components/AppHeader'

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

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUserId(session.user.id)
      setUserEmail(session.user.email || '')
      const { data: profile } = await supabase
        .from('user_preferences')
        .select('store_name')
        .eq('id', session.user.id)
        .maybeSingle()
      setStoreName(profile?.store_name || '')
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
          .select('monthly_earnings_goal')
          .eq('id', session.user.id)
          .maybeSingle()
        if (goalData?.monthly_earnings_goal) setMonthlyGoal(String(goalData.monthly_earnings_goal))
      } catch { /* column may not exist yet */ }
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

  return (
    <div style={{ minHeight: '100vh', background: '#fbf7f3', fontFamily: 'Inter, sans-serif', color: '#1a1410' }}>
      <AppHeader page="settings" storeName={storeName}
        onSignOut={async () => { await supabase.auth.signOut(); navigate('/login') }} />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 28px 80px' }}>

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

        {fromAdHealth && (
          <div style={{
            marginBottom: 24, padding: '16px 20px', borderRadius: 16,
            background: '#1a1410', color: '#fbf7f3',
            fontSize: '0.85rem', lineHeight: 1.55,
          }}>
            To use Ad Health, add your <strong style={{ color: '#fbcfe8' }}>Meta access token</strong> and <strong style={{ color: '#fbcfe8' }}>ad account ID</strong> below and save.
          </div>
        )}

        <div style={{ background: '#fff', borderRadius: 28, border: '1px solid #f1ebe5', padding: '40px 36px' }}>

          {/* Earnings Upload Section */}
          <section>
            <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.5rem', color: '#1a1410', letterSpacing: '-0.02em', margin: '0 0 6px' }}>Earnings history</h2>
            {existingCount !== null && (
              <p style={{ fontSize: '0.85rem', color: '#a89485', margin: '0 0 22px' }}>
                {existingCount > 0
                  ? `${existingCount.toLocaleString()} rows uploaded`
                  : 'No earnings data uploaded yet'}
              </p>
            )}

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

          <div style={sectionDivider} />

          {/* Monthly Earnings Goal */}
          <section>
            <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.5rem', color: '#1a1410', letterSpacing: '-0.02em', margin: '0 0 6px' }}>Monthly goal</h2>
            <p style={{ fontSize: '0.85rem', color: '#a89485', margin: '0 0 22px' }}>
              Set a target to track monthly progress on the dashboard.
            </p>
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

          <div style={sectionDivider} />

          {/* Meta Ads Integration */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.5rem', color: '#1a1410', letterSpacing: '-0.02em', margin: 0 }}>Meta Ads</h2>
              {metaConnected
                ? <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9d174d', background: '#fdf2f8', padding: '4px 12px', borderRadius: 999, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Connected</span>
                : <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#a89485', background: '#faf5ef', padding: '4px 12px', borderRadius: 999, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Not connected</span>
              }
            </div>
            <p style={{ fontSize: '0.85rem', color: '#a89485', margin: '0 0 22px', lineHeight: 1.55 }}>
              Powers the <Link to="/ad-health" style={{ color: '#ec4899', textDecoration: 'underline' }}>Ad Health</Link> dashboard.
              Your token stays private.
            </p>

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
        </div>
      </div>
    </div>
  )
}
