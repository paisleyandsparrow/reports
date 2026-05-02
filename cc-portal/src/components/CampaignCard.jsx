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
  "Women's Fashion":       { bg: '#fdf2f8', color: '#9d174d' },
  'Beauty & Skincare':     { bg: '#fef3e7', color: '#92400e' },
  'Health & Wellness':     { bg: '#ecfdf5', color: '#065f46' },
  'Shoes':                 { bg: '#fff1f2', color: '#9f1239' },
  'Jewelry & Accessories': { bg: '#faf5ff', color: '#6b21a8' },
  'Home & Kitchen':        { bg: '#eff6ff', color: '#1e40af' },
  'Fitness & Activewear':  { bg: '#fff7ed', color: '#9a3412' },
  "Men's Fashion":         { bg: '#f8f5f1', color: '#5b4636' },
  'Kids & Baby':           { bg: '#f0fdf4', color: '#166534' },
  'Pets':                  { bg: '#fefce8', color: '#854d0e' },
  'Electronics':           { bg: '#eef2ff', color: '#3730a3' },
  'Books & Lifestyle':     { bg: '#f0fdfa', color: '#115e59' },
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
      background: '#fff', border: '1px solid #f1ebe5', borderRadius: 20,
      padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ width: '100%', aspectRatio: '1', borderRadius: 14, background: '#f5ede5' }} />
      <div style={{ height: 18, borderRadius: 6, background: '#f5ede5', width: '45%' }} />
      <div style={{ height: 13, borderRadius: 4, background: '#faf5ef', width: '85%' }} />
      <div style={{ height: 13, borderRadius: 4, background: '#faf5ef', width: '65%' }} />
      <div style={{ height: 11, borderRadius: 4, background: '#faf5ef', width: '50%', marginTop: 4 }} />
    </div>
  )
}

export function CampaignCard({ campaign, creatorId, queueStatus = null, onQueueToggle }) {
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
  const [queueLoading, setQueueLoading] = useState(false)

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

  const rate = campaign.commission_rate
  const rateBadge = rate >= 25
    ? { bg: '#1a1410', color: '#fbf7f3' }
    : rate >= 12
      ? { bg: '#fdf2f8', color: '#9d174d' }
      : { bg: '#faf5ef', color: '#7a6b5d' }

  return (
    <div
      style={{
        background: '#fff', border: '1px solid #f1ebe5', borderRadius: 20,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        cursor: 'default', transition: 'box-shadow .2s, border-color .2s, transform .15s',
        fontFamily: 'Inter, sans-serif',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 12px 32px -16px rgba(26,20,16,0.18)'; e.currentTarget.style.borderColor = '#e8dfd6'; e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#f1ebe5'; e.currentTarget.style.transform = 'none' }}
    >
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
      {/* Image */}
      <div style={{
        width: '100%', aspectRatio: '1',
        borderRadius: 14, background: '#faf5ef',
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
            fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, color: '#fbf7f3',
            background: '#1a1410', width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 14, letterSpacing: '-0.02em',
          }}>{brandInitial}</span>
        )}
      </div>

      {/* Accepted + Ending Soon badges */}
      {(isAccepted || endingSoon !== null) && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {isAccepted && (
            <span style={{
              fontSize: '0.6rem', fontWeight: 700,
              padding: '3px 10px', borderRadius: 999,
              background: '#fdf2f8', color: '#9d174d',
              letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>Accepted</span>
          )}
          {endingSoon !== null && (
            <span style={{
              fontSize: '0.6rem', fontWeight: 700,
              padding: '3px 10px', borderRadius: 999,
              background: '#1a1410', color: '#fbf7f3',
              letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}>{endingSoon === 0 ? 'Ends today' : `${endingSoon}d left`}</span>
          )}
        </div>
      )}

      {/* Header: brand + rate badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <p style={{
          fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.02rem', color: '#1a1410',
          letterSpacing: '-0.01em', lineHeight: 1.2,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', flex: 1, minWidth: 0,
          margin: 0,
        }}>
          {campaign.brand_name}
        </p>
        <span style={{
          flexShrink: 0, fontSize: '0.68rem', fontWeight: 700,
          padding: '4px 10px', borderRadius: 999,
          background: rateBadge.bg, color: rateBadge.color,
          letterSpacing: '0.04em', whiteSpace: 'nowrap',
        }}>
          {rate ?? '—'}%
        </span>
      </div>

      {/* Campaign name */}
      <p style={{
        fontSize: '0.78rem', color: '#7a6b5d',
        overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.45,
        margin: 0,
      }}>
        {campaign.campaign_name}
      </p>

      {/* Categories */}
      {cats.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {cats.slice(0, 2).map(cat => {
            const style = CATEGORY_STYLES[cat] || { bg: '#faf5ef', color: '#7a6b5d' }
            return (
              <span
                key={cat}
                style={{
                  fontSize: '0.6rem', fontWeight: 600, padding: '3px 10px',
                  borderRadius: 999, letterSpacing: '0.04em',
                  background: style.bg, color: style.color,
                }}
              >
                {cat}
              </span>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid #f5ede5', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {addedDate && (
          <div style={{ fontSize: '0.66rem', color: '#a89485', display: 'flex', alignItems: 'center', gap: 6 }}>
            Added {addedDate}
            {isActive && (
              <span style={{
                fontSize: '0.56rem', fontWeight: 700,
                color: '#ec4899', letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}>· Active</span>
            )}
          </div>
        )}
        {(startDate || endDate) && (
          <div style={{ fontSize: '0.66rem', color: '#a89485' }}>
            {startDate ?? '?'} – {endDate ?? '?'}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          {campaign.primary_asin && (
            <a
              href={`https://www.amazon.com/dp/${campaign.primary_asin}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.66rem', fontFamily: '"SF Mono", "Fira Code", monospace', color: '#a89485', textDecoration: 'none', fontWeight: 500 }}
              onMouseEnter={e => { e.target.style.color = '#1a1410' }}
              onMouseLeave={e => { e.target.style.color = '#a89485' }}
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
                marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 600,
                color: '#ec4899', textDecoration: 'none', whiteSpace: 'nowrap',
                letterSpacing: '0.02em',
              }}
              onMouseEnter={e => e.target.style.textDecoration = 'underline'}
              onMouseLeave={e => e.target.style.textDecoration = 'none'}
            >
              View campaign →
            </a>
          )}
        </div>
      </div>
      </div>

      {/* Full-width queue strip */}
      {onQueueToggle && (() => {
        const isAcceptedInQueue = queueStatus === 'accepted'
        const isPending = queueStatus === 'pending'
        const isFailed = queueStatus === 'failed'
        const bg = isAcceptedInQueue ? '#f0fdf4' : isPending ? '#fdf2f8' : '#faf5ef'
        const bgHover = isAcceptedInQueue ? '#dcfce7' : isPending ? '#fce7f3' : '#f1ebe5'
        const color = isAcceptedInQueue ? '#166534' : isPending ? '#9d174d' : isFailed ? '#b45309' : '#7a6b5d'
        const isDisabled = isAcceptedInQueue || isFailed || queueLoading
        const label = queueLoading
          ? null
          : isAcceptedInQueue ? '✓ Accepted' : isPending ? '✓ Queued' : isFailed ? '✗ Failed' : '+ Queue'
        return (
          <button
            onClick={async e => {
              e.stopPropagation()
              if (isDisabled) return
              setQueueLoading(true)
              try { await onQueueToggle(campaign.campaign_id) } finally { setQueueLoading(false) }
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%',
              padding: '11px 0',
              border: 'none',
              borderTop: '1px solid #f1ebe5',
              background: bg,
              color,
              fontSize: '0.7rem', fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: 'inherit',
              cursor: isDisabled ? 'default' : 'pointer',
              transition: 'background .15s',
              textAlign: 'center',
              flexShrink: 0,
            }}
            onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.background = bgHover }}
            onMouseLeave={e => { e.currentTarget.style.background = bg }}
          >
            {queueLoading ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'cc-spin 0.7s linear infinite', flexShrink: 0 }}>
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25"/>
                <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : label}
          </button>
        )
      })()}
    </div>
  )
}

export default CampaignCard
