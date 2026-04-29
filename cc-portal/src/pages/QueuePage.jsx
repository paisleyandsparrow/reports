import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AppHeader from '../components/AppHeader'

const STATUS_STYLES = {
  pending:  { bg: '#faf5ef', color: '#7a6b5d', label: 'Pending' },
  accepted: { bg: '#f0fdf4', color: '#166534', label: 'Accepted' },
  failed:   { bg: '#fff1f2', color: '#9f1239', label: 'Failed' },
  skipped:  { bg: '#faf5ef', color: '#a89485', label: 'Skipped' },
}

export default function QueuePage() {
  const navigate = useNavigate()
  const [storeName, setStoreName] = useState('')
  const [userId, setUserId] = useState(null)
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [autoSettings, setAutoSettings] = useState(null)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUserId(session.user.id)

      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('store_name, acceptance_enabled, max_campaigns_per_day, max_per_run, run_start_hour, run_end_hour')
        .eq('id', session.user.id)
        .maybeSingle()
      if (prefs) {
        setStoreName(prefs.store_name || '')
        setAutoSettings(prefs)
      }

      await fetchQueue(session.user.id)
      setLoading(false)
    }
    init()
  }, [])

  async function fetchQueue(uid) {
    setLoading(true)
    const { data } = await supabase
      .from('user_campaign_queue')
      .select('id, campaign_id, status, marked_at, accepted_at')
      .eq('user_id', uid)
      .order('marked_at', { ascending: false })
    setQueue(data || [])
    setLoading(false)
  }

  function handleStatusFilter(s) {
    setStatusFilter(s)
  }

  async function handleRemove(id) {
    await supabase.from('user_campaign_queue').delete().eq('id', id)
    setQueue(prev => prev.filter(r => r.id !== id))
  }

  async function handleClearPending() {
    if (!userId) return
    setClearing(true)
    await supabase.from('user_campaign_queue')
      .delete()
      .eq('user_id', userId)
      .eq('status', 'pending')
    setQueue(prev => prev.filter(r => r.status !== 'pending'))
    setClearing(false)
  }

  const displayedQueue = statusFilter === 'all' ? queue : queue.filter(r => r.status === statusFilter)

  const counts = {
    pending: queue.filter(r => r.status === 'pending').length,
    accepted: queue.filter(r => r.status === 'accepted').length,
    failed: queue.filter(r => r.status === 'failed').length,
  }

  // Schedule preview
  const schedulePreview = (() => {
    if (!autoSettings) return null
    const { run_start_hour: start = 8, run_end_hour: end = 20, max_per_run: perRun = 100, max_campaigns_per_day: perDay = 500 } = autoSettings
    const runs = []
    for (let h = Number(start); h < Number(end); h += 2) runs.push(h)
    const perRunActual = Math.min(Number(perRun), Math.ceil(Number(perDay) / runs.length))
    return { runs, perRunActual, perDay: Number(perDay) }
  })()

  function fmtDateTime(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const labelStyle = { fontSize: '0.66rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.18em', textTransform: 'uppercase' }

  return (
    <div style={{ minHeight: '100vh', background: '#fbf7f3', fontFamily: 'Inter, sans-serif', color: '#1a1410' }}>
      <AppHeader page="queue" storeName={storeName}
        onSignOut={async () => { await supabase.auth.signOut(); navigate('/login') }} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 28px 80px' }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 14 }}>
            Automation
          </p>
          <h1 style={{
            fontFamily: 'Georgia, serif', fontWeight: 400,
            fontSize: 'clamp(2rem, 4vw, 2.8rem)', color: '#1a1410',
            letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0,
          }}>
            Your <em style={{ color: '#ec4899', fontStyle: 'italic' }}>queue</em>.
          </h1>
        </div>

        {/* Auto status banner */}
        {autoSettings && (
          <div style={{
            marginBottom: 28, padding: '16px 20px', borderRadius: 18,
            background: autoSettings.acceptance_enabled ? '#f0fdf4' : '#faf5ef',
            border: `1px solid ${autoSettings.acceptance_enabled ? '#bbf7d0' : '#f1ebe5'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <span style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: autoSettings.acceptance_enabled ? '#166534' : '#a89485' }}>
                Automation {autoSettings.acceptance_enabled ? 'enabled' : 'disabled'}
              </span>
              {schedulePreview && autoSettings.acceptance_enabled && (
                <p style={{ fontSize: '0.82rem', color: '#7a6b5d', margin: '4px 0 0', lineHeight: 1.5 }}>
                  {schedulePreview.runs.length} runs/day · ~{schedulePreview.perRunActual} per run · max {schedulePreview.perDay}/day
                </p>
              )}
            </div>
            <Link to="/settings" style={{ fontSize: '0.78rem', fontWeight: 600, color: '#ec4899', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
            >
              Edit settings →
            </Link>
          </div>
        )}

        {/* Schedule preview */}
        {schedulePreview && autoSettings?.acceptance_enabled && (
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f1ebe5', padding: '24px 28px', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ ...labelStyle, margin: 0 }}>Today's schedule</p>
              <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.1em', textTransform: 'uppercase' }}># of campaigns</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {schedulePreview.runs.map((h, i) => {
                const label = `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`
                const campaignsThisRun = Math.min(schedulePreview.perRunActual, Math.max(0, schedulePreview.perDay - i * schedulePreview.perRunActual))
                return (
                  <div key={h} style={{
                    padding: '10px 16px', borderRadius: 14,
                    background: '#faf5ef', border: '1px solid #f1ebe5',
                    minWidth: 80, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1a1410' }}>{label}</div>
                    <div style={{ fontSize: '0.68rem', color: '#a89485', marginTop: 2 }}>≤ {campaignsThisRun}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
          {[
            { key: 'pending', label: 'Pending', value: queue.filter(r => r.status === 'pending').length },
            { key: 'accepted', label: 'Accepted today', value: queue.filter(r => r.status === 'accepted' && r.accepted_at && new Date(r.accepted_at).toDateString() === new Date().toDateString()).length },
            { key: 'failed', label: 'Failed', value: queue.filter(r => r.status === 'failed').length },
          ].map(({ key, label, value }) => (
            <div key={key} style={{ background: '#fff', borderRadius: 18, border: '1px solid #f1ebe5', padding: '20px 22px' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, color: '#1a1410', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#a89485', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 6 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Queue list */}
        <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #f1ebe5', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #f1ebe5', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 3, background: '#faf5ef', borderRadius: 999, padding: 3 }}>
              {['pending', 'accepted', 'failed', 'all'].map(s => {
                const active = statusFilter === s
                return (
                  <button key={s} onClick={() => handleStatusFilter(s)} style={{
                    fontSize: '0.74rem', fontWeight: active ? 600 : 500,
                    padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: active ? '#1a1410' : 'transparent',
                    color: active ? '#fbf7f3' : '#7a6b5d',
                    fontFamily: 'inherit', letterSpacing: '0.02em', transition: 'all .15s',
                    whiteSpace: 'nowrap',
                  }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                    {s !== 'all' && (
                      <span style={{ marginLeft: 6, fontSize: '0.66rem', opacity: 0.7 }}>
                        {s === 'pending' ? queue.filter(r => r.status === 'pending').length :
                         s === 'accepted' ? queue.filter(r => r.status === 'accepted').length :
                         queue.filter(r => r.status === 'failed').length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {statusFilter === 'pending' && queue.filter(r => r.status === 'pending').length > 0 && (
              <button
                onClick={handleClearPending}
                disabled={clearing}
                style={{ marginLeft: 'auto', fontSize: '0.74rem', color: '#a89485', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px' }}
                onMouseEnter={e => e.currentTarget.style.color = '#1a1410'}
                onMouseLeave={e => e.currentTarget.style.color = '#a89485'}
              >
                {clearing ? 'Clearing…' : 'Clear all pending'}
              </button>
            )}
          </div>

          {/* List */}
          {loading ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', color: '#a89485' }}>Loading…</p>
            </div>
          ) : displayedQueue.length === 0 ? (
            <div style={{ padding: '64px 24px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.4rem', color: '#1a1410', letterSpacing: '-0.02em', margin: '0 0 8px' }}>
                Nothing {statusFilter === 'all' ? 'here' : `${statusFilter}`} yet.
              </p>
              {statusFilter === 'pending' && (
                <p style={{ fontSize: '0.85rem', color: '#a89485', margin: 0 }}>
                  Go to <Link to="/" style={{ color: '#ec4899', textDecoration: 'underline' }}>Campaigns</Link> and click "+ Queue" on any campaign.
                </p>
              )}
            </div>
          ) : (
            <div>
              {displayedQueue.map((item, i) => {
                const style = STATUS_STYLES[item.status] || STATUS_STYLES.pending
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 24px', gap: 16, flexWrap: 'wrap',
                    borderBottom: i < displayedQueue.length - 1 ? '1px solid #f5ede5' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: '0.6rem', fontWeight: 700, padding: '3px 10px',
                        borderRadius: 999, background: style.bg, color: style.color,
                        letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0,
                      }}>{style.label}</span>
                      <span style={{ fontFamily: '"SF Mono", "Fira Code", monospace', fontSize: '0.78rem', color: '#1a1410', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.campaign_id}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
                      <span style={{ fontSize: '0.72rem', color: '#a89485' }}>
                        {item.accepted_at ? `Accepted ${fmtDateTime(item.accepted_at)}` : `Queued ${fmtDateTime(item.marked_at)}`}
                      </span>
                      {item.status === 'pending' && (
                        <button
                          onClick={() => handleRemove(item.id)}
                          style={{ fontSize: '0.72rem', color: '#a89485', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#1a1410'}
                          onMouseLeave={e => e.currentTarget.style.color = '#a89485'}
                        >Remove</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
