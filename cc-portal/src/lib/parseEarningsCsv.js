/**
 * Parse an Amazon Creator Connections earnings CSV.
 *
 * Expected columns (in any order):
 *   Date, Campaign Title, ASIN, Clicks, Shipped Items,
 *   Revenue, Commission Rate, Commission Income
 *
 * Date format from Amazon: "19-Apr-2026"
 *
 * Returns: { rows: Array, totalIncome: number, totalRevenue: number, errors: string[] }
 */

const MONTH_MAP = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

function parseAmazonDate(str) {
  // "19-Apr-2026" → "2026-04-19"
  const m = str.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (!m) return null
  const [, day, mon, year] = m
  const mo = MONTH_MAP[mon.charAt(0).toUpperCase() + mon.slice(1).toLowerCase()]
  if (!mo) return null
  return `${year}-${mo}-${day.padStart(2, '0')}`
}

function parseCsvLine(line) {
  // Handle quoted fields (some campaign titles contain commas)
  const fields = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur.trim())
  return fields
}

export function parseEarningsCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const errors = []

  if (lines.length < 2) {
    return { rows: [], totalIncome: 0, totalRevenue: 0, errors: ['File appears to be empty.'] }
  }

  // Parse header row
  const headers = parseCsvLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').toLowerCase())
  const idx = {
    date:       headers.indexOf('date'),
    title:      headers.indexOf('campaign title'),
    asin:       headers.indexOf('asin'),
    clicks:     headers.indexOf('clicks'),
    shipped:    headers.indexOf('shipped items'),
    revenue:    headers.indexOf('revenue'),
    rate:       headers.indexOf('commission rate'),
    income:     headers.indexOf('commission income'),
  }

  const missing = Object.entries(idx).filter(([, v]) => v === -1).map(([k]) => k)
  if (missing.length > 0) {
    return {
      rows: [], totalIncome: 0, totalRevenue: 0,
      errors: [`Missing required columns: ${missing.join(', ')}. Make sure you're uploading an Amazon Creator Connections earnings CSV.`],
    }
  }

  // Aggregate by (date, campaign_title, asin) to deduplicate
  const agg = new Map()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const fields = parseCsvLine(line)
    if (fields.length < 8) {
      errors.push(`Row ${i + 1}: too few columns, skipped.`)
      continue
    }

    const dateStr = parseAmazonDate(fields[idx.date])
    if (!dateStr) {
      errors.push(`Row ${i + 1}: unrecognised date "${fields[idx.date]}", skipped.`)
      continue
    }

    const campaignTitle = fields[idx.title]?.trim() || ''
    const asin = fields[idx.asin]?.trim() || ''
    const key = `${dateStr}||${campaignTitle}||${asin}`

    const clicks   = parseInt(fields[idx.clicks], 10) || 0
    const shipped  = parseInt(fields[idx.shipped], 10) || 0
    const revenue  = parseFloat(fields[idx.revenue]) || 0
    const rate     = parseFloat(fields[idx.rate]) || 0
    const income   = parseFloat(fields[idx.income]) || 0

    if (agg.has(key)) {
      const e = agg.get(key)
      e.clicks += clicks
      e.shipped_items += shipped
      e.revenue += revenue
      e.commission_income += income
      // commission_rate stays the same per campaign
    } else {
      agg.set(key, {
        date: dateStr,
        campaign_title: campaignTitle,
        asin,
        clicks,
        shipped_items: shipped,
        revenue,
        commission_rate: rate,
        commission_income: income,
      })
    }
  }

  // Round floats and build final rows
  const rows = Array.from(agg.values()).map(r => ({
    ...r,
    revenue: Math.round(r.revenue * 10000) / 10000,
    commission_income: Math.round(r.commission_income * 10000) / 10000,
  }))

  const totalIncome  = rows.reduce((s, r) => s + r.commission_income, 0)
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)

  return { rows, totalIncome, totalRevenue, errors }
}
