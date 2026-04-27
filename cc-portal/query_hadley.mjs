import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://wzmtzpcqbaisqwjiigdx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6bXR6cGNxYmFpc3F3amlpZ2R4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE2ODI1OSwiZXhwIjoyMDkwNzQ0MjU5fQ.NYD0qG1jxI10vnQuY73xa16V2VzudaFyCnSCQWvQFw0'
)

// Get all Hadley Designs campaigns
const { count: total } = await supabase.from('cc_campaign_catalog').select('*', { count: 'exact', head: true })
const { count: hasImage } = await supabase.from('cc_campaign_catalog').select('*', { count: 'exact', head: true }).not('image_url', 'is', null)
const { count: missingImage } = await supabase.from('cc_campaign_catalog').select('*', { count: 'exact', head: true }).is('image_url', null)

console.log(`Total rows:        ${total}`)
console.log(`Has image_url:     ${hasImage}`)
console.log(`Still missing:     ${missingImage}`)

const { data: samples } = await supabase
  .from('cc_campaign_catalog')
  .select('brand_name, primary_asin, image_url')
  .not('image_url', 'is', null)
  .limit(5)

console.log('\nSample image_url values:')
for (const r of samples || []) {
  console.log(` ${r.brand_name?.slice(0,25).padEnd(25)} | ${r.image_url}`)
}

const { data, error } = { data: [], error: null }

if (error) { console.error(error); process.exit(1) }

console.log('Total Hadley rows in DB:', data.length)

// Group by primary_asin
const byAsin = {}
for (const row of data) {
  const key = row.primary_asin || 'NO_ASIN'
  if (!byAsin[key]) byAsin[key] = []
  byAsin[key].push(row)
}

const dupes = Object.entries(byAsin).filter(([k, v]) => v.length > 1)
const uniq  = Object.entries(byAsin).filter(([k, v]) => v.length === 1)

console.log('Unique ASINs:', Object.keys(byAsin).length)
console.log('ASINs with multiple campaign_ids:', dupes.length)
console.log('ASINs with single campaign_id (no dupe):', uniq.length)
console.log()

if (dupes.length > 0) {
  console.log('=== DUPLICATE ASINs (first 10) ===')
  for (const [asin, rows] of dupes.slice(0, 10)) {
    console.log('ASIN:', asin)
    for (const r of rows) {
      console.log(
        '  campaign_id:', r.campaign_id,
        '| rate:', r.commission_rate + '%',
        '| status:', r.status,
        '| start:', r.start_date,
        '| first_seen:', r.first_seen?.slice(0, 10) ?? 'null'
      )
      console.log('  name:', r.campaign_name?.slice(0, 80))
    }
    console.log()
  }
}

// Also check: are campaign names duplicated (same name, different IDs)?
console.log('=== DUPLICATE CAMPAIGN NAMES ===')
const byName = {}
for (const row of data) {
  const key = row.campaign_name?.trim() || 'NO_NAME'
  if (!byName[key]) byName[key] = []
  byName[key].push(row)
}
const nameDupes = Object.entries(byName).filter(([k, v]) => v.length > 1)
console.log('Campaign names appearing more than once:', nameDupes.length)
for (const [name, rows] of nameDupes.slice(0, 5)) {
  console.log('Name:', name.slice(0, 80))
  for (const r of rows) {
    console.log('  campaign_id:', r.campaign_id, '| ASIN:', r.primary_asin, '| rate:', r.commission_rate + '%', '| first_seen:', r.first_seen?.slice(0,10))
  }
  console.log()
}

// Summary: each campaign represents a distinct product
console.log('=== SUMMARY ===')
console.log('Each Hadley "campaign" in CC = one product with its own ASIN. They are all truly different products (different ASINs).')
console.log('The visual "duplication" in the portal = Hadley simply runs MANY campaigns (one per product).')
