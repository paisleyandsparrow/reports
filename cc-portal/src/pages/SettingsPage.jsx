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

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <AppHeader page="settings" storeName={storeName}
        onSignOut={async () => { await supabase.auth.signOut(); navigate('/login') }} />

      <div className="px-4 py-10">
      <div className="max-w-lg mx-auto">

        {fromAdHealth && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-2">
            <span>📊</span>
            <span>To use Ad Health, add your <strong>Meta access token</strong> and <strong>ad account ID</strong> below and save.</span>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-1">Settings</h1>
          <p className="text-sm text-gray-500 mb-8">Manage your earnings data and preferences.</p>

          {/* Earnings Upload Section */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Earnings History</h2>
            {existingCount !== null && (
              <p className="text-xs text-gray-400 mb-4">
                {existingCount > 0
                  ? `${existingCount.toLocaleString()} rows currently uploaded`
                  : 'No earnings data uploaded yet'}
              </p>
            )}

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleCsvFile(e.dataTransfer.files[0]) }}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-all"
            >
              <div className="text-3xl mb-2">📄</div>
              {csvState.status === 'idle' && (
                <>
                  <p className="text-sm font-medium text-gray-700">Drop your CSV here or click to browse</p>
                  <p className="text-xs text-gray-400 mt-1">Amazon Creator Connections earnings CSV</p>
                </>
              )}
              {csvState.status === 'parsing' && (
                <p className="text-sm text-gray-500">Parsing {csvState.fileName}…</p>
              )}
              {csvState.status === 'ready' && (
                <>
                  <p className="text-sm font-semibold text-green-700">✓ {csvState.fileName}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {csvState.rows.length.toLocaleString()} rows · ${csvState.totalIncome.toFixed(2)} earned · ${csvState.totalRevenue.toFixed(2)} revenue
                  </p>
                </>
              )}
              {csvState.status === 'error' && (
                <>
                  <p className="text-sm font-semibold text-red-600">⚠ Could not parse file</p>
                  <p className="text-xs text-red-400 mt-1">{csvState.errors[0]}</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={e => handleCsvFile(e.target.files[0])}
              />
            </div>

            {csvState.status === 'ready' && csvState.errors.length > 0 && (
              <p className="text-xs text-amber-600 mt-2">⚠ {csvState.errors.length} rows skipped due to parse errors.</p>
            )}

            {csvState.status === 'ready' && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="mt-4 w-full bg-brand-700 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-colors"
              >
                {uploading ? 'Uploading…' : 'Upload Earnings'}
              </button>
            )}

            {uploadResult?.success && (
              <p className="text-xs text-green-700 mt-3 text-center">✓ {uploadResult.count.toLocaleString()} rows uploaded successfully.</p>
            )}
            {uploadResult?.success === false && (
              <p className="text-xs text-red-600 mt-3 text-center">⚠ Upload failed: {uploadResult.message}</p>
            )}

            <p className="text-xs text-gray-400 text-center mt-4">
              Amazon Associates → Creator Connections → Earnings → Download CSV.
              Uploading again merges with existing data — no duplicates.
            </p>
          </section>

          <div className="border-t border-gray-100 my-8" />

          {/* Monthly Earnings Goal */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-1">Monthly Earnings Goal</h2>
            <p className="text-xs text-gray-400 mb-5">
              Set a target to track your monthly progress on the dashboard.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Goal Amount ($)</label>
              <input
                type="number"
                min="0"
                step="50"
                value={monthlyGoal}
                onChange={e => { setMonthlyGoal(e.target.value); setGoalSaveResult(null) }}
                placeholder="e.g. 2000"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
            <button
              onClick={handleSaveGoal}
              disabled={goalSaving || monthlyGoal === ''}
              className="mt-4 w-full bg-brand-700 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-colors"
            >
              {goalSaving ? 'Saving…' : 'Save Goal'}
            </button>
            {goalSaveResult === 'saved' && (
              <p className="text-xs text-green-700 text-center mt-2">✓ Goal saved. Visit the dashboard to see your progress.</p>
            )}
            {goalSaveResult === 'error' && (
              <p className="text-xs text-red-600 text-center mt-2">⚠ Could not save. Add a <code className="bg-gray-100 px-1 rounded">monthly_earnings_goal</code> column (numeric) to the <code className="bg-gray-100 px-1 rounded">user_preferences</code> table in Supabase.</p>
            )}
          </section>

          <div className="border-t border-gray-100 my-8" />

          {/* Meta Ads Integration */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Meta Ads Integration</h2>
              {metaConnected
                ? <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">● Connected</span>
                : <span className="text-xs font-semibold text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">○ Not connected</span>
              }
            </div>
            <p className="text-xs text-gray-400 mb-5">
              Powers the <Link to="/ad-health" className="text-brand-600 hover:underline">Ad Health</Link> dashboard.
              Your token is stored securely and never shared.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Meta Access Token</label>
                <div className="relative">
                  <input
                    type={metaShowToken ? 'text' : 'password'}
                    value={metaToken}
                    onChange={e => { setMetaToken(e.target.value); setMetaSaveResult(null) }}
                    placeholder="EAAxxxxxxxxxxxxxxx..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm pr-16 focus:outline-none focus:ring-2 focus:ring-brand-300 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setMetaShowToken(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                  >
                    {metaShowToken ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Meta Business Suite → Settings → System Users → Generate Token, or use a long-lived page token.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ad Account ID</label>
                <input
                  type="text"
                  value={metaAccountId}
                  onChange={e => { setMetaAccountId(e.target.value); setMetaSaveResult(null) }}
                  placeholder="act_123456789"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Found in Meta Ads Manager URL or Business Settings → Ad Accounts. <code className="bg-gray-100 px-1 rounded">act_</code> prefix is optional.
                </p>
              </div>

              <button
                onClick={handleSaveMeta}
                disabled={metaSaving || !metaToken.trim() || !metaAccountId.trim()}
                className="w-full bg-brand-700 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-colors"
              >
                {metaSaving ? 'Saving…' : 'Save Meta Integration'}
              </button>

              {metaSaveResult === 'saved' && (
                <p className="text-xs text-green-700 text-center">✓ Integration saved. <Link to="/ad-health" className="underline">View Ad Health →</Link></p>
              )}
              {metaSaveResult === 'error' && (
                <p className="text-xs text-red-600 text-center">⚠ Could not save. Try again.</p>
              )}
            </div>
          </section>
        </div>
      </div>
      </div>
    </div>
  )
}
