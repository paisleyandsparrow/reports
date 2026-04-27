import { useState } from 'react'

// Primary categorization: browse node ID → display category
export const BROWSE_NODE_CATEGORIES = {
  // Women's Fashion
  '7141123011': "Women's Fashion",  // Women's Clothing (8,289)
  '228013':     "Women's Fashion",  // Clothing, Shoes & Jewelry top-level (2,956)
  '165793011':  "Women's Fashion",  // Women's Accessories (1,793)
  '2619525011': "Women's Fashion",  // Women's Swimwear (88)
  // Beauty & Skincare
  '1055398':    'Beauty & Skincare', // Beauty & Personal Care (7,726)
  '3760901':    'Beauty & Skincare', // Skin Care (2,965)
  '3760911':    'Beauty & Skincare', // Hair Care (2,014)
  // Health & Wellness
  '3375251':    'Health & Wellness', // Health & Household (4,623)
  // Shoes
  '2972638011': 'Shoes',             // Women's Shoes (2,653)
  '2619533011': 'Shoes',             // Athletic/Casual Shoes (626)
  // Jewelry & Accessories
  '2617941011': 'Jewelry & Accessories', // Jewelry (1,351)
  '2335752011': 'Jewelry & Accessories', // Handbags & Wallets (1,109)
  // Home & Kitchen
  '172282':     'Home & Kitchen',    // Home & Kitchen top-level (1,055)
  '16310091':   'Home & Kitchen',    // Kitchen & Dining (906)
  '16310101':   'Home & Kitchen',    // Bedding & Bath (209)
  '11091801':   'Home & Kitchen',    // Furniture & Décor (208)
  // Fitness & Activewear
  '1064954':    'Fitness & Activewear', // Sports & Outdoors (893)
  '15684181':   'Fitness & Activewear', // Activewear (706)
  '10272111':   'Fitness & Activewear', // Exercise & Fitness (376)
  // Men's Fashion
  '165796011':  "Men's Fashion",     // Men's Clothing (417)
  // Misc
  '468642':     'Electronics',       // Electronics (53)
  '283155':     'Books & Lifestyle', // Books (40)
  '2625373011': 'Kids & Baby',       // Baby Products (38)
  '11260432011':'Pets',              // Pet Supplies (12)
}

// Text-based fallback for campaigns missing browse_nodes
export const CATEGORY_KEYWORDS = {
  "Women's Fashion":    ['clothing','apparel','denim','dress','shirt','legging','hoodie','jacket','sandal','jewelry','handbag','bag','purse','shorts','pants','skirt','swimwear','fashion','style','outfit','wear','athleisure','loungewear','cardigan','blazer','blouse','romper','jumpsuit','bodysuit','scarf','hat','cap','beanie','belt','wallet','sunglasses'],
  'Beauty & Skincare':  ['skin','skincare','makeup','beauty','cosmetic','serum','moisturizer','foundation','mascara','lip','nail','hair','shampoo','conditioner','fragrance','perfume','lotion','cream','cleanser','toner','sunscreen','retinol','collagen','eyelash','eyebrow','bronzer','blush','concealer','primer','body wash','face wash','exfoliant','hyaluronic','spf','dry shampoo','hair oil','hair mask','face mask','eye cream'],
  'Health & Wellness':  ['vitamin','supplement','wellness','probiotic','collagen','protein','immune','gut health','sleep','herbal','essential oil','aromatherapy','detox','elderberry','magnesium','omega','fish oil'],
  'Shoes':              ['shoe','sneaker','boot','sandal','heel','loafer','mule','flat','platform','slipper','running shoe','athletic shoe'],
  'Jewelry & Accessories': ['jewelry','necklace','bracelet','earring','ring','pendant','choker','gold','silver','charm','handbag','purse','clutch','tote','crossbody','wallet','sunglasses','watch','hair clip','headband'],
  'Home & Kitchen':     ['home','kitchen','organiz','storage','clean','decor','furniture','bedding','towel','bath','laundry','cook','bake','pan','pot','container','shelf','basket','closet','candle','diffuser','vacuum','coffee','mug','throw','pillow','blanket','curtain','rug','lamp','cutting board','knife','plate','bowl','glass','tumbler','air purifier','humidifier','desk','ottoman','vase','planter','soap dispenser'],
  'Fitness & Activewear':['fitness','workout','gym','yoga','pilates','running','athletic','exercise','resistance','mat','dumbbell','kettlebell','foam roller','recovery','creatine','whey','electrolyte','water bottle','compression','hiking','cycling','sports','active','training','pre-workout','stretching','activewear','legging','sports bra'],
  "Men's Fashion":      ['men\'s','menswear','men shirt','men suit','men shoe','men jacket'],
  'Kids & Baby':        ['baby','kids','children','toddler','infant','nursery','toy','stroller','car seat','diaper','parenting','family','child','newborn','sippy','bottle','pacifier','crib','onesie','educational','puzzle','doll','stuffed','lunch box','maternity'],
  'Pets':               ['pet','dog','cat','puppy','kitten','paw','collar','leash','aquarium','bird','hamster','reptile'],
  'Electronics':        ['electronic','gadget','tech','phone','tablet','laptop','charger','cable','bluetooth','headphone','speaker','camera','smart home','alexa','roomba'],
  'Books & Lifestyle':  ['book','novel','journal','planner','kindle','reading','cookbook','self-help','memoir','fiction'],
}

// Pre-compiled word-boundary regexes — prevents 'flat' matching 'inflate', 'mule' matching 'emulate', etc.
export const CATEGORY_REGEXES = Object.fromEntries(
  Object.entries(CATEGORY_KEYWORDS).map(([cat, kws]) => [
    cat,
    kws.map(kw => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'))
  ])
)

export const CATEGORY_STYLES = {
  "Women's Fashion":       'bg-pink-50 text-pink-800',
  'Beauty & Skincare':     'bg-amber-50 text-amber-800',
  'Health & Wellness':     'bg-emerald-50 text-emerald-800',
  'Shoes':                 'bg-rose-50 text-rose-800',
  'Jewelry & Accessories': 'bg-purple-50 text-purple-800',
  'Home & Kitchen':        'bg-blue-50 text-blue-800',
  'Fitness & Activewear':  'bg-orange-50 text-orange-800',
  "Men's Fashion":         'bg-slate-50 text-slate-700',
  'Kids & Baby':           'bg-green-50 text-green-800',
  'Pets':                  'bg-yellow-50 text-yellow-800',
  'Electronics':           'bg-indigo-50 text-indigo-800',
  'Books & Lifestyle':     'bg-teal-50 text-teal-800',
}

// Categorize using browse_nodes first (accurate), fall back to word-boundary text matching
export function categorize(campaign) {
  const nodes = campaign.browse_nodes || []
  const fromNodes = [...new Set(nodes.map(n => BROWSE_NODE_CATEGORIES[String(n)]).filter(Boolean))]
  if (fromNodes.length > 0) return fromNodes
  const low = (`${campaign.campaign_name} ${campaign.brand_name}` || '').toLowerCase()
  return Object.entries(CATEGORY_REGEXES)
    .filter(([, regexes]) => regexes.some(re => re.test(low)))
    .map(([cat]) => cat)
}

export function fmtDate(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
}

export function CampaignCardSkeleton() {
  return (
    <div className="animate-pulse" style={{
      background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px',
      padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px'
    }}>
      <div style={{ width: '100%', aspectRatio: '1', borderRadius: '10px', background: '#e2e8f0' }} />
      <div style={{ height: '18px', borderRadius: '6px', background: '#e2e8f0', width: '40%' }} />
      <div style={{ height: '13px', borderRadius: '4px', background: '#f1f5f9', width: '85%' }} />
      <div style={{ height: '13px', borderRadius: '4px', background: '#f1f5f9', width: '65%' }} />
      <div style={{ height: '11px', borderRadius: '4px', background: '#f1f5f9', width: '50%', marginTop: '4px' }} />
    </div>
  )
}

export function CampaignCard({ campaign, creatorId }) {
  const cats = categorize(campaign)
  const isActive = campaign.status?.toLowerCase() === 'active'
  const isAccepted = campaign.is_selected === true

  // Ending soon: within 7 days
  const endingSoon = (() => {
    if (!campaign.end_date) return null
    const msLeft = new Date(campaign.end_date + 'T23:59:59') - Date.now()
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
    if (daysLeft <= 7 && daysLeft >= 0) return daysLeft
    return null
  })()

  // Build CDN fallback chain: scraped image_url first, then primary_asin CDN, then each ASIN
  const seenAsins = new Set()
  const cdnUrls = [campaign.primary_asin, ...(campaign.asins || [])]
    .filter(a => { if (!a || seenAsins.has(a)) return false; seenAsins.add(a); return true })
    .map(a => `https://m.media-amazon.com/images/P/${a}.jpg`)
  const imgSrc = campaign.image_url || cdnUrls[0] || ''
  const fallbacks = cdnUrls.filter(u => u !== imgSrc)

  const [currentSrc, setCurrentSrc] = useState(imgSrc)
  const [fallbackQueue, setFallbackQueue] = useState(fallbacks)
  const [imgFailed, setImgFailed] = useState(!imgSrc)

  function tryNextImg() {
    if (fallbackQueue.length > 0) {
      setCurrentSrc(fallbackQueue[0])
      setFallbackQueue(q => q.slice(1))
    } else {
      setImgFailed(true)
    }
  }

  const brandInitial = (campaign.brand_name?.[0] || '?').toUpperCase()

  const ccUrl = creatorId
    ? `https://affiliate-program.amazon.com/p/connect/request?creatorId=${creatorId}&adId=${campaign.campaign_id}&campaignId=${campaign.campaign_id}&recc=0&early-acc=1`
    : null

  const addedDate  = fmtDate(campaign.first_seen)
  const startDate  = fmtDate(campaign.start_date)
  const endDate    = fmtDate(campaign.end_date)

  return (
    <div
      style={{
        background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '14px',
        padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px',
        cursor: 'default', transition: 'box-shadow .2s, border-color .2s, transform .15s'
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.transform = 'none' }}
    >
      {/* Image */}
      <div style={{
        width: '100%', aspectRatio: '1',
        borderRadius: '10px', background: '#f8fafc',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
      }}>
        {!imgFailed && currentSrc ? (
          <img
            src={currentSrc}
            alt={campaign.campaign_name}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={tryNextImg}
          />
        ) : (
          <span style={{
            fontSize: '1.8rem', fontWeight: 800, color: '#fff',
            background: '#cbd5e1', width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '10px'
          }}>{brandInitial}</span>
        )}
      </div>

      {/* Accepted + Ending Soon badges */}
      {(isAccepted || endingSoon !== null) && (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {isAccepted && (
            <span style={{
              fontSize: '0.62rem', fontWeight: 700,
              padding: '2px 7px', borderRadius: '20px',
              background: '#fffbeb', color: '#b45309',
              border: '1px solid #fde68a', whiteSpace: 'nowrap'
            }}>✓ Accepted</span>
          )}
          {endingSoon !== null && (
            <span style={{
              fontSize: '0.62rem', fontWeight: 700,
              padding: '2px 7px', borderRadius: '20px',
              background: '#fef2f2', color: '#dc2626',
              border: '1px solid #fecaca', whiteSpace: 'nowrap'
            }}>{endingSoon === 0 ? '⏰ Ends today!' : `⏰ ${endingSoon}d left`}</span>
          )}
        </div>
      )}

      {/* Header: brand + rate badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginTop: '4px' }}>
        <p style={{
          fontWeight: 700, fontSize: '0.83rem', color: '#0f172a',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', flex: 1, minWidth: 0
        }}>
          {campaign.brand_name}
        </p>
        <span style={{
          flexShrink: 0, fontSize: '0.68rem', fontWeight: 800,
          padding: '3px 8px', borderRadius: '20px',
          background: '#fff7ed', color: '#c2410c',
          letterSpacing: '0.02em', whiteSpace: 'nowrap'
        }}>
          {campaign.commission_rate ?? '—'}%
        </span>
      </div>

      {/* Campaign name */}
      <p style={{
        fontSize: '0.74rem', color: '#64748b',
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4
      }}>
        {campaign.campaign_name}
      </p>

      {/* Categories */}
      {cats.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {cats.slice(0, 2).map(cat => (
            <span
              key={cat}
              className={CATEGORY_STYLES[cat] || 'bg-slate-100 text-slate-600'}
              style={{ fontSize: '0.62rem', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', letterSpacing: '0.02em' }}
            >
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {addedDate && (
          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
            Added {addedDate}
            {isActive && (
              <span style={{
                marginLeft: '6px', fontSize: '0.58rem', fontWeight: 700,
                background: '#f0fdf4', color: '#15803d',
                border: '1px solid #bbf7d0', borderRadius: '20px',
                padding: '1px 6px', letterSpacing: '0.03em'
              }}>ACTIVE</span>
            )}
          </div>
        )}
        {(startDate || endDate) && (
          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
            {startDate ?? '?'} – {endDate ?? '?'}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
          {campaign.primary_asin && (
            <a
              href={`https://www.amazon.com/dp/${campaign.primary_asin}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.65rem', fontFamily: '"SF Mono", "Fira Code", monospace', color: '#64748b', textDecoration: 'none', fontWeight: 500 }}
              onMouseEnter={e => { e.target.style.color = '#f97316'; e.target.style.textDecoration = 'underline' }}
              onMouseLeave={e => { e.target.style.color = '#64748b'; e.target.style.textDecoration = 'none' }}
            >
              {campaign.primary_asin}
            </a>
          )}
          {ccUrl && (
            <a
              href={ccUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginLeft: 'auto', fontSize: '0.65rem', fontWeight: 700,
                color: '#f97316', textDecoration: 'none', whiteSpace: 'nowrap'
              }}
              onMouseEnter={e => e.target.style.textDecoration = 'underline'}
              onMouseLeave={e => e.target.style.textDecoration = 'none'}
            >
              CC →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default CampaignCard
