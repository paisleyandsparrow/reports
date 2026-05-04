import { useState, useEffect, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import AppHeader from '../components/AppHeader'
import { supabase } from '../lib/supabase'

const pageStyle = {
  minHeight: '100vh',
  background: '#fbf7f3',
  fontFamily: 'Inter, sans-serif',
  display: 'flex',
  flexDirection: 'column',
}

const containerStyle = {
  maxWidth: 900,
  margin: '0 auto',
  padding: '40px 24px 80px',
  width: '100%',
}

const cardStyle = {
  background: '#fff',
  border: '1px solid #f1ebe5',
  borderRadius: 20,
  padding: '32px 36px',
  marginBottom: 24,
}

const labelStyle = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: '#7a6b5d',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  marginBottom: 8,
}

const primaryBtn = (disabled) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 28px',
  borderRadius: 999,
  background: disabled ? '#e8dfd6' : '#1a1410',
  color: disabled ? '#a89485' : '#fff',
  fontSize: '0.82rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  border: 'none',
  cursor: disabled ? 'default' : 'pointer',
  transition: 'background .15s',
  fontFamily: 'inherit',
})

/**
 * Parse an Amazon "Linked Product" Excel report.
 * Returns { rows: [{ asin, date, title, orderedRevenue, totalEarnings }], error }
 */
function parseAmazonExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: null })
        if (!raw.length) return resolve({ rows: [], error: 'No data rows found in file.' })

        // Column names from Amazon's Linked Product report:
        // Date, Category, Product Title, ASIN, ..., Ordered Revenue, Total Earnings
        const rows = raw
          .filter(r => r['ASIN'] && typeof r['ASIN'] === 'string' && r['ASIN'].trim().startsWith('B'))
          .map(r => ({
            asin: r['ASIN'].trim(),
            date: r['Date'] ?? null,
            title: r['Product Title'] ?? null,
            orderedRevenue: typeof r['Ordered Revenue'] === 'number' ? r['Ordered Revenue'] : null,
            totalEarnings: typeof r['Total Earnings'] === 'number' ? r['Total Earnings'] : null,
            itemsOrdered: typeof r['Items Ordered'] === 'number' ? r['Items Ordered'] : (typeof r['Order Quantity'] === 'number' ? r['Order Quantity'] : 1),
          }))

        if (!rows.length) return resolve({ rows: [], error: 'No valid ASIN rows found. Make sure this is an Amazon Linked Product report.' })
        resolve({ rows, error: null })
      } catch (err) {
        reject(new Error('Could not parse file: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsArrayBuffer(file)
  })
}

function fmtDollar(n) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function MissedEarningsPage() {
  const [storeName, setStoreName] = useState('')
  const [status, setStatus] = useState('idle') // idle | parsing | querying | done | error
  const [errorMsg, setErrorMsg] = useState(null)
  const [fileLabel, setFileLabel] = useState(null)
  const [parsedRows, setParsedRows] = useState([])
  const [results, setResults] = useState([]) // matched campaigns
  const [uniqueAsins, setUniqueAsins] = useState([])
  const [asinToOrders, setAsinToOrders] = useState({})
  const [queueStatus, setQueueStatus] = useState({}) // campaign_id → 'pending' | 'accepted'
  const [queueing, setQueueing] = useState(false)
  const fileInputRef = useRef(null)

  async function refreshQueueStatus() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase
      .from('user_campaign_queue')
      .select('campaign_id, status')
      .eq('user_id', session.user.id)
    if (data) {
      const map = {}
      data.forEach(r => { map[r.campaign_id] = r.status })
      setQueueStatus(map)
    }
  }

  // Load queue statuses whenever results change
  useEffect(() => {
    if (!results.length) return
    refreshQueueStatus()
  }, [results])

  // Re-fetch queue statuses when the user switches back to this tab
  // (e.g. after running the extension bulk-accept)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshQueueStatus()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  async function handleQueueOne(campaignId) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const current = queueStatus[campaignId]
    if (current === 'accepted') return
    if (current === 'pending') {
      await supabase.from('user_campaign_queue')
        .delete().eq('user_id', session.user.id).eq('campaign_id', campaignId)
      setQueueStatus(prev => { const next = { ...prev }; delete next[campaignId]; return next })
    } else {
      await supabase.from('user_campaign_queue')
        .upsert({ user_id: session.user.id, campaign_id: campaignId, status: 'pending' }, { onConflict: 'user_id,campaign_id' })
      setQueueStatus(prev => ({ ...prev, [campaignId]: 'pending' }))
    }
  }

  async function handleQueueAll() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !results.length) return
    setQueueing(true)
    const toQueue = results
      .filter(c => !queueStatus[c.campaign_id])
      .map(c => ({ user_id: session.user.id, campaign_id: c.campaign_id, status: 'pending' }))
    if (toQueue.length) {
      await supabase.from('user_campaign_queue')
        .upsert(toQueue, { onConflict: 'user_id,campaign_id' })
      const newStatuses = {}
      toQueue.forEach(r => { newStatuses[r.campaign_id] = 'pending' })
      setQueueStatus(prev => ({ ...prev, ...newStatuses }))
    }
    setQueueing(false)
  }

  // Fetch store name once
  useState(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase
        .from('user_preferences')
        .select('store_name')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(({ data }) => { if (data) setStoreName(data.store_name || '') })
    })
  })

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileLabel(file.name)
    setStatus('parsing')
    setErrorMsg(null)
    setParsedRows([])
    setResults([])
    setUniqueAsins([])
    setAsinToOrders({})

    try {
      const { rows, error } = await parseAmazonExcel(file)
      if (error) {
        setStatus('error')
        setErrorMsg(error)
        return
      }

      setParsedRows(rows)

      // Deduplicate ASINs + build order map
      const asinMap = {}
      for (const row of rows) {
        if (!asinMap[row.asin]) asinMap[row.asin] = { count: 0, revenue: 0, earnings: 0, title: row.title }
        asinMap[row.asin].count += row.itemsOrdered || 1
        if (row.orderedRevenue) asinMap[row.asin].revenue += row.orderedRevenue
        if (row.totalEarnings) asinMap[row.asin].earnings += row.totalEarnings
      }
      const asins = Object.keys(asinMap)
      setUniqueAsins(asins)
      setAsinToOrders(asinMap)

      // Query Supabase for campaigns whose asins overlap with our order ASINs
      setStatus('querying')

      const { data: rpcData, error: rpcError } = await supabase.rpc('find_campaigns_by_asins', { asin_list: asins })
      if (rpcError) console.error('[MissedEarnings] rpc error:', rpcError)

      const matched = new Map()
      if (rpcData) {
        for (const c of rpcData) {
          if (!matched.has(c.campaign_id)) {
            const campaignAsins = Array.isArray(c.asins) ? c.asins : []
            const matchingAsins = asins.filter(a => a === c.primary_asin || campaignAsins.includes(a))
            matched.set(c.campaign_id, { ...c, matchingAsins })
          }
        }
      }

      const resultList = Array.from(matched.values()).sort((a, b) => {
        // Sort by estimated missed earnings desc
        const earnA = a.matchingAsins.reduce((sum, asin) => sum + (asinMap[asin]?.revenue || 0), 0) * ((a.commission_rate || 0) / 100)
        const earnB = b.matchingAsins.reduce((sum, asin) => sum + (asinMap[asin]?.revenue || 0), 0) * ((b.commission_rate || 0) / 100)
        return earnB - earnA
      })

      setResults(resultList)
      setStatus('done')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message || 'Unknown error')
    }
  }, [])

  const totalMissedEarnings = results.reduce((sum, campaign) => {
    const campaignRevenue = campaign.matchingAsins.reduce((s, asin) => s + (asinToOrders[asin]?.revenue || 0), 0)
    return sum + (campaignRevenue * ((campaign.commission_rate || 0) / 100))
  }, 0)

  const totalOrderRevenue = parsedRows.reduce((sum, r) => sum + (r.orderedRevenue || 0), 0)

  return (
    <div style={pageStyle}>
      <AppHeader page="missed" storeName={storeName} />

      <main style={containerStyle}>
        {/* Page header */}
        <div style={{ marginBottom: 36 }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 8 }}>
            Analysis
          </p>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1a1410', margin: 0, lineHeight: 1.15, letterSpacing: '-0.03em' }}>
            Missed Earnings
          </h1>
          <p style={{ marginTop: 12, color: '#7a6b5d', fontSize: '0.9rem', lineHeight: 1.6 }}>
            Upload your Amazon "Linked Product" order report to see which Creator Connections campaigns you had sales from — but weren't enrolled in.
          </p>
        </div>

        {/* Upload card */}
        <section style={cardStyle}>
          <label style={labelStyle}>Upload Amazon Order Report (.xlsx)</label>
          <p style={{ fontSize: '0.82rem', color: '#a89485', marginBottom: 20, lineHeight: 1.55 }}>
            Go to Amazon Associates → Reports → Linked Product → Download as XLSX. Then upload that file here.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button
              style={primaryBtn(status === 'parsing' || status === 'querying')}
              disabled={status === 'parsing' || status === 'querying'}
              onClick={() => fileInputRef.current?.click()}
            >
              {status === 'parsing' ? 'Parsing…' : status === 'querying' ? 'Querying campaigns…' : 'Choose file'}
            </button>
            {fileLabel && (
              <span style={{ fontSize: '0.82rem', color: '#7a6b5d', fontStyle: 'italic' }}>{fileLabel}</span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {status === 'error' && (
            <div style={{ marginTop: 18, padding: '12px 16px', borderRadius: 12, background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', fontSize: '0.82rem' }}>
              {errorMsg}
            </div>
          )}
        </section>

        {/* Results */}
        {status === 'done' && (
          <>
            {/* Summary */}
            <section style={cardStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 24 }}>
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>ASINs in report</p>
                  <p style={{ fontSize: '2rem', fontWeight: 800, color: '#1a1410', margin: '6px 0 0', letterSpacing: '-0.03em' }}>{uniqueAsins.length}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>Total ordered revenue</p>
                  <p style={{ fontSize: '2rem', fontWeight: 800, color: '#1a1410', margin: '6px 0 0', letterSpacing: '-0.03em' }}>{fmtDollar(totalOrderRevenue)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>Campaigns matched</p>
                  <p style={{ fontSize: '2rem', fontWeight: 800, color: results.length > 0 ? '#9d174d' : '#1a1410', margin: '6px 0 0', letterSpacing: '-0.03em' }}>{results.length}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>Est. missed earnings</p>
                  <p style={{ fontSize: '2rem', fontWeight: 800, color: totalMissedEarnings > 0 ? '#9d174d' : '#1a1410', margin: '6px 0 0', letterSpacing: '-0.03em' }}>
                    {fmtDollar(totalMissedEarnings)}
                  </p>
                </div>
              </div>
            </section>

            {results.length === 0 ? (
              <section style={{ ...cardStyle, textAlign: 'center', padding: '48px 36px', color: '#a89485' }}>
                <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#7a6b5d', marginBottom: 8 }}>No missed campaigns found</p>
                <p style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                  None of the ASINs in your order report matched any campaigns in the Creator Connections catalog.
                  This could mean you were already enrolled, or these products don't have active campaigns.
                </p>
              </section>
            ) : (
              <section style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1410', margin: 0, letterSpacing: '-0.02em' }}>
                    Campaigns with matching orders
                  </h2>
                  <button
                    onClick={handleQueueAll}
                    disabled={queueing || results.every(c => !!queueStatus[c.campaign_id])}
                    style={primaryBtn(queueing || results.every(c => !!queueStatus[c.campaign_id]))}
                  >
                    {queueing ? 'Queuing…' : results.every(c => !!queueStatus[c.campaign_id]) ? '✓ All Queued' : 'Queue All'}
                  </button>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#a89485', marginBottom: 24, marginTop: -12, lineHeight: 1.5 }}>
                  Estimated missed earnings = your ordered revenue for matched ASINs × campaign commission rate.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {results.map(campaign => {
                    const campaignRevenue = campaign.matchingAsins.reduce((s, asin) => s + (asinToOrders[asin]?.revenue || 0), 0)
                    const estimatedEarnings = campaignRevenue * ((campaign.commission_rate || 0) / 100)
                    const totalOrders = campaign.matchingAsins.reduce((s, asin) => s + (asinToOrders[asin]?.count || 0), 0)
                    return (
                      <div key={campaign.campaign_id} style={{
                        padding: '18px 20px',
                        borderRadius: 14,
                        background: '#fdf9f7',
                        border: '1px solid #f1ebe5',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                          {campaign.image_url && (
                            <img
                              src={campaign.image_url}
                              alt={campaign.campaign_name}
                              style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 10, background: '#fff', border: '1px solid #f1ebe5', flexShrink: 0 }}
                            />
                          )}
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                              {campaign.brand_name}
                            </p>
                            <p style={{ margin: '4px 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#1a1410', lineHeight: 1.3 }}>
                              {campaign.campaign_name}
                            </p>
                            <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: '#7a6b5d' }}>
                              Commission: <strong>{campaign.commission_rate}%</strong>
                              {' · '}
                              Status: <span style={{ color: campaign.status === 'active' ? '#15803d' : '#a89485' }}>{campaign.status}</span>
                            </p>
                            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {campaign.matchingAsins.map(asin => (
                                <span key={asin} style={{
                                  fontSize: '0.7rem',
                                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                                  background: '#fce7f3',
                                  color: '#9d174d',
                                  padding: '2px 10px',
                                  borderRadius: 999,
                                  fontWeight: 600,
                                }}>
                                  {asin}
                                  {asinToOrders[asin]?.title ? ` — ${asinToOrders[asin].title.slice(0, 35)}…` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                            <div>
                              <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: '#a89485', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Est. missed</p>
                              <p style={{ margin: '4px 0 0', fontSize: '1.5rem', fontWeight: 800, color: '#9d174d', letterSpacing: '-0.03em' }}>
                                {fmtDollar(estimatedEarnings)}
                              </p>
                              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#a89485' }}>
                                on {fmtDollar(campaignRevenue)} revenue
                              </p>
                              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#a89485' }}>
                                {totalOrders} unit{totalOrders !== 1 ? 's' : ''} ordered
                              </p>
                            </div>
                            {(() => {
                              const qs = queueStatus[campaign.campaign_id]
                              const isAccepted = qs === 'accepted'
                              const isPending = qs === 'pending'
                              return (
                                <button
                                  onClick={() => handleQueueOne(campaign.campaign_id)}
                                  disabled={isAccepted}
                                  style={{
                                    padding: '6px 18px',
                                    borderRadius: 999,
                                    border: isPending || isAccepted ? 'none' : '1.5px solid #1a1410',
                                    background: isAccepted ? '#dcfce7' : isPending ? '#fce7f3' : 'transparent',
                                    color: isAccepted ? '#15803d' : isPending ? '#9d174d' : '#1a1410',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    cursor: isAccepted ? 'default' : 'pointer',
                                    fontFamily: 'inherit',
                                    letterSpacing: '0.03em',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {isAccepted ? '✓ Accepted' : isPending ? '✓ Queued' : '+ Queue'}
                                </button>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
