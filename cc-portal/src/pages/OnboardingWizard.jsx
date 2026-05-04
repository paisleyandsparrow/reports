import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { parseEarningsCsv } from '../lib/parseEarningsCsv'

const CATEGORIES = [
  "Women's Fashion",
  'Beauty & Skincare',
  'Health & Wellness',
  'Shoes',
  'Jewelry & Accessories',
  'Home & Kitchen',
  'Fitness & Activewear',
  "Men's Fashion",
  'Kids & Baby',
  'Pets',
  'Electronics',
  'Books & Lifestyle',
]

// slug = Simple Icons CDN slug; null = use inline globe SVG
const SOCIAL_PLATFORMS = [
  { label: 'Instagram',    color: '#E1306C', slug: 'instagram' },
  { label: 'TikTok',       color: '#000000', slug: 'tiktok' },
  { label: 'YouTube',      color: '#FF0000', slug: 'youtube' },
  { label: 'Pinterest',    color: '#E60023', slug: 'pinterest' },
  { label: 'Facebook',     color: '#1877F2', slug: 'facebook' },
  { label: 'Blog / Website', color: '#7a6b5d', slug: null },
]

const GOALS = [
  'Drive more sales',
  'Discover new products to promote',
  'Maximize commission earnings',
  'Grow my audience',
]

const TOTAL_STEPS = 6

const inputBase = {
  width: '100%',
  border: '1px solid #f1ebe5',
  background: '#ffffff',
  borderRadius: 14,
  padding: '14px 16px',
  fontSize: '0.92rem',
  color: '#1a1410',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color .15s, box-shadow .15s',
}

const focusInput = e => {
  e.currentTarget.style.borderColor = '#fbcfe8'
  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(251,207,232,0.35)'
}
const blurInput = e => {
  e.currentTarget.style.borderColor = '#f1ebe5'
  e.currentTarget.style.boxShadow = 'none'
}

const eyebrowStyle = {
  fontSize: '0.7rem',
  fontWeight: 600,
  color: '#ec4899',
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  marginBottom: 10,
}

const labelStyle = {
  display: 'block',
  fontSize: '0.7rem',
  fontWeight: 600,
  color: '#7a6b5d',
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  marginBottom: 8,
}

export default function OnboardingWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    store_name: '',
    store_id: '',
    creator_id: '',
    categories: [],
    social_platforms: [],
    goals: [],
    meta_token: '',
    meta_account_id: '',
  })
  const [csvState, setCsvState] = useState({ status: 'idle', fileName: '', rows: [], totalIncome: 0, totalRevenue: 0, errors: [] })
  const fileInputRef = useRef(null)

  function toggleMulti(field, value) {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(v => v !== value)
        : [...prev[field], value],
    }))
  }

  function canAdvance() {
    if (step === 1) return form.store_name.trim().length > 0 && form.store_id.trim().length > 0 && form.creator_id.trim().startsWith('amzn1.creator.')
    if (step === 2) return form.categories.length > 0
    if (step === 3) return form.social_platforms.length > 0
    if (step === 4) return form.goals.length > 0
    if (step === 5) return true  // Meta Ads optional
    if (step === 6) return true  // CSV optional
    return false
  }

  function handleCsvFile(file) {
    if (!file) return
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

  async function handleFinish() {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const now = new Date().toISOString()
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // Save core profile first — this MUST succeed for onboarding_complete to be set
    const { error: coreErr } = await supabase.from('user_preferences').upsert({
      id: session.user.id,
      email: session.user.email,
      store_name: form.store_name.trim(),
      store_id: form.store_id.trim(),
      creator_id: form.creator_id.trim(),
      categories: form.categories,
      social_platforms: form.social_platforms,
      goals: form.goals,
      onboarding_complete: true,
      updated_at: now,
    })
    if (coreErr) {
      console.error('Onboarding upsert failed:', coreErr)
      setSaving(false)
      // FK violation means the session user no longer exists in auth — force re-login
      if (coreErr.code === '23503') {
        await supabase.auth.signOut()
        navigate('/login')
        return
      }
      return
    }

    // Save trial + consent fields (requires DB migration — safe to fail silently)
    await supabase.from('user_preferences').upsert({
      id: session.user.id,
      marketing_consent: true,
      marketing_consent_at: now,
      trial_starts_at: now,
      trial_ends_at: trialEndsAt,
      updated_at: now,
    })

    // Save Meta Ads integration if provided
    const metaToken = form.meta_token.trim()
    const rawAccountId = form.meta_account_id.trim()
    if (metaToken && rawAccountId) {
      const metaAccountId = rawAccountId.startsWith('act_') ? rawAccountId : `act_${rawAccountId}`
      await supabase.from('user_integrations').upsert({
        user_id: session.user.id,
        integration_type: 'meta_ads',
        access_token: metaToken,
        ad_account_id: metaAccountId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,integration_type' })
    }

    if (csvState.rows.length > 0) {
      const rowsWithUser = csvState.rows.map(r => ({ ...r, user_id: session.user.id }))
      const BATCH = 500
      for (let i = 0; i < rowsWithUser.length; i += BATCH) {
        await supabase.from('creator_connections_revenue')
          .upsert(rowsWithUser.slice(i, i + BATCH), { onConflict: 'user_id,date,campaign_title,asin' })
      }
    }

    // Klaviyo: fire-and-forget — never await these, they must not block navigation
    if (window.klaviyo) {
      window.klaviyo.identify({
        email: session.user.email,
        store_name: form.store_name.trim(),
        trial_ends_at: trialEndsAt,
        marketing_consent: true,
      }).catch(() => {})
      window.klaviyo.track('Trial Started', {
        trial_starts_at: now,
        trial_ends_at: trialEndsAt,
        store_name: form.store_name.trim(),
        marketing_consent: true,
      }).catch(() => {})
      // Klaviyo client subscriptions API (verified against live endpoint schema)
      fetch('https://a.klaviyo.com/client/subscriptions/?company_id=Tyxjx8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'revision': '2024-02-15' },
        body: JSON.stringify({
          data: {
            type: 'subscription',
            attributes: {
              custom_source: 'Creator Coders Onboarding',
              profile: {
                data: {
                  type: 'profile',
                  attributes: {
                    email: session.user.email,
                  },
                },
              },
            },
            relationships: {
              list: {
                data: {
                  type: 'list',
                  id: 'WUiNyk',
                },
              },
            },
          },
        }),
      })
        .then(async r => {
          if (r.status !== 202) {
            const body = await r.text()
            console.error('Klaviyo subscribe failed:', r.status, body)
            return
          }
          console.log('Klaviyo subscribe status:', r.status)
        })
        .catch(e => console.error('Klaviyo subscribe error:', e))
    }

    navigate('/')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fbf7f3',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 20px',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#1a1410',
    }}>
      {/* Ambient pink blooms */}
      <div style={{
        position: 'absolute', top: -180, right: -120, width: 480, height: 480,
        background: 'radial-gradient(circle, rgba(251,207,232,0.5) 0%, rgba(251,207,232,0) 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -200, left: -150, width: 520, height: 520,
        background: 'radial-gradient(circle, rgba(253,242,248,0.7) 0%, rgba(253,242,248,0) 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative',
        zIndex: 1,
        background: '#ffffff',
        borderRadius: 24,
        boxShadow: '0 30px 80px -30px rgba(26,20,16,0.18), 0 0 0 1px #f1ebe5',
        padding: '44px 44px 36px',
        width: '100%',
        maxWidth: 540,
      }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <p style={eyebrowStyle}>
            Step {step} of {TOTAL_STEPS}
          </p>
          <div style={{ width: '100%', background: '#f5ede5', borderRadius: 999, height: 4, marginBottom: 22, overflow: 'hidden' }}>
            <div style={{
              background: '#ec4899',
              height: 4,
              borderRadius: 999,
              width: `${(step / TOTAL_STEPS) * 100}%`,
              transition: 'width .35s ease',
            }} />
          </div>
          <h2 style={{
            fontFamily: 'Georgia, serif',
            fontWeight: 400,
            fontSize: '1.85rem',
            color: '#1a1410',
            letterSpacing: '-0.02em',
            margin: 0,
            lineHeight: 1.15,
          }}>
            {stepTitle(step)}
          </h2>
          <p style={{
            fontSize: '0.92rem',
            color: '#7a6b5d',
            marginTop: 10,
            lineHeight: 1.55,
          }}>
            {stepSubtitle(step)}
          </p>
        </div>

        {/* Step content */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={labelStyle}>Channel / Store Name</label>
              <input
                type="text"
                placeholder="e.g. Paisley & Sparrow"
                value={form.store_name}
                onChange={e => setForm(prev => ({ ...prev, store_name: e.target.value }))}
                style={inputBase}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>
            <div>
              <label style={labelStyle}>Amazon Store ID <span style={{ fontWeight: 400, color: '#a89485' }}>(Associate tracking tag)</span></label>
              <input
                type="text"
                placeholder="e.g. jenpaispa-20"
                value={form.store_id}
                onChange={e => setForm(prev => ({ ...prev, store_id: e.target.value.trim() }))}
                style={{ ...inputBase, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.9rem' }}
                onFocus={focusInput}
                onBlur={blurInput}
              />
              <p style={{ fontSize: '0.78rem', color: '#a89485', marginTop: 8, lineHeight: 1.5 }}>
                Your Amazon Associates tracking tag. Used by the extension for bulk campaign acceptance.
              </p>
            </div>
            <div>
              <label style={labelStyle}>Amazon Creator ID</label>
              <input
                type="text"
                placeholder="amzn1.creator.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={form.creator_id}
                onChange={e => setForm(prev => ({ ...prev, creator_id: e.target.value.trim() }))}
                style={{ ...inputBase, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.85rem' }}
                onFocus={focusInput}
                onBlur={blurInput}
              />
              <p style={{ fontSize: '0.78rem', color: '#a89485', marginTop: 10, lineHeight: 1.5 }}>
                Find this in your Amazon Associates account under Creator Connections → Settings. It starts with{' '}
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#7a6b5d' }}>amzn1.creator.</span>
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {CATEGORIES.map(cat => (
              <ToggleChip
                key={cat}
                label={cat}
                selected={form.categories.includes(cat)}
                onToggle={() => toggleMulti('categories', cat)}
              />
            ))}
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {SOCIAL_PLATFORMS.map(({ label, color, slug }) => (
              <SocialPlatformChip
                key={label}
                label={label}
                color={color}
                slug={slug}
                selected={form.social_platforms.includes(label)}
                onToggle={() => toggleMulti('social_platforms', label)}
              />
            ))}
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {GOALS.map(goal => (
              <ToggleChip
                key={goal}
                label={goal}
                selected={form.goals.includes(goal)}
                onToggle={() => toggleMulti('goals', goal)}
                wide
              />
            ))}
          </div>
        )}

        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Meta logo + label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#f5f0ff', borderRadius: 14, border: '1px solid #e9e0ff' }}>
              <img
                src="https://cdn.simpleicons.org/meta/0866ff"
                alt="Meta"
                width={28}
                height={28}
                style={{ flexShrink: 0 }}
              />
              <div>
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: '#1a1410' }}>Meta Ads Manager</p>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#7a6b5d', marginTop: 2 }}>Connect to see your ad spend alongside earnings</p>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Access Token</label>
              <input
                type="password"
                placeholder="EAAxxxxxxxxxxxxxxx"
                value={form.meta_token}
                onChange={e => setForm(prev => ({ ...prev, meta_token: e.target.value }))}
                style={{ ...inputBase, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.85rem' }}
                onFocus={focusInput}
                onBlur={blurInput}
              />
              <p style={{ fontSize: '0.75rem', color: '#a89485', marginTop: 8, lineHeight: 1.5 }}>
                Found in Meta Business Suite → Settings → System Users → Generate Token.
              </p>
            </div>

            <div>
              <label style={labelStyle}>Ad Account ID</label>
              <input
                type="text"
                placeholder="act_123456789"
                value={form.meta_account_id}
                onChange={e => setForm(prev => ({ ...prev, meta_account_id: e.target.value.trim() }))}
                style={{ ...inputBase, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.85rem' }}
                onFocus={focusInput}
                onBlur={blurInput}
              />
              <p style={{ fontSize: '0.75rem', color: '#a89485', marginTop: 8, lineHeight: 1.5 }}>
                Found in Meta Ads Manager → Account dropdown. Starts with{' '}
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#7a6b5d' }}>act_</span> — we'll add the prefix automatically if missing.
              </p>
            </div>
          </div>
        )}

        {step === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleCsvFile(e.dataTransfer.files[0]) }}
              style={{
                border: '1.5px dashed #f1ebe5',
                background: '#faf5ef',
                borderRadius: 16,
                padding: '36px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#fbcfe8'; e.currentTarget.style.background = '#fdf2f8' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#f1ebe5'; e.currentTarget.style.background = '#faf5ef' }}
            >
              <div style={{ fontSize: '1.8rem', marginBottom: 10 }}>📄</div>
              {csvState.status === 'idle' && (
                <>
                  <p style={{ fontSize: '0.92rem', fontWeight: 500, color: '#1a1410', margin: 0 }}>
                    Drop your CSV here or click to browse
                  </p>
                  <p style={{ fontSize: '0.78rem', color: '#a89485', marginTop: 6 }}>
                    Amazon Creator Connections earnings CSV
                  </p>
                </>
              )}
              {csvState.status === 'parsing' && (
                <p style={{ fontSize: '0.92rem', color: '#7a6b5d', margin: 0 }}>
                  Parsing {csvState.fileName}…
                </p>
              )}
              {csvState.status === 'ready' && (
                <>
                  <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#9d174d', margin: 0 }}>
                    ✓ {csvState.fileName}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: '#7a6b5d', marginTop: 6 }}>
                    {csvState.rows.length.toLocaleString()} rows · ${csvState.totalIncome.toFixed(2)} earned · ${csvState.totalRevenue.toFixed(2)} revenue
                  </p>
                </>
              )}
              {csvState.status === 'error' && (
                <>
                  <p style={{ fontSize: '0.92rem', fontWeight: 600, color: '#9d174d', margin: 0 }}>
                    ⚠ Could not parse file
                  </p>
                  <p style={{ fontSize: '0.78rem', color: '#a89485', marginTop: 6 }}>{csvState.errors[0]}</p>
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
              <p style={{ fontSize: '0.78rem', color: '#7a6b5d', margin: 0 }}>
                ⚠ {csvState.errors.length} rows skipped due to parse errors.
              </p>
            )}

            <p style={{ fontSize: '0.78rem', color: '#a89485', textAlign: 'center', margin: 0, lineHeight: 1.55 }}>
              To get this file: Amazon Associates → Creator Connections → Earnings → Download CSV.
              You can also skip this and upload later in Settings.
            </p>

            {/* Email list notice */}
            <p style={{ fontSize: '0.75rem', color: '#a89485', lineHeight: 1.55, margin: 0, textAlign: 'center' }}>
              By creating your account you agree to receive product tips, trial reminders, and occasional updates from Creator Coders. Unsubscribe any time.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div style={{ marginTop: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: '0.85rem', color: '#a89485', fontFamily: 'inherit',
                padding: '8px 4px', transition: 'color .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#1a1410'}
              onMouseLeave={e => e.currentTarget.style.color = '#a89485'}
            >
              ← Back
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <PrimaryButton
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance()}
              label="Next →"
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {step === TOTAL_STEPS && step === 6 && csvState.status !== 'ready' && (
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  style={{
                    background: 'transparent', border: 'none', cursor: saving ? 'default' : 'pointer',
                    fontSize: '0.85rem', color: '#a89485', fontFamily: 'inherit',
                    padding: '8px 4px', opacity: saving ? 0.4 : 1, transition: 'color .15s',
                  }}
                  onMouseEnter={e => { if (!saving) e.currentTarget.style.color = '#1a1410' }}
                  onMouseLeave={e => e.currentTarget.style.color = '#a89485'}
                >
                  {saving ? 'Saving…' : 'Skip for now'}
                </button>
              )}
              <PrimaryButton
                onClick={handleFinish}
                disabled={saving}
                label={saving ? 'Saving…' : csvState.status === 'ready' ? 'Upload & Get Started →' : 'Get Started →'}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PrimaryButton({ onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: '#1a1410',
        color: '#fbf7f3',
        border: 'none',
        borderRadius: 999,
        padding: '13px 26px',
        fontSize: '0.85rem',
        fontWeight: 600,
        fontFamily: 'inherit',
        letterSpacing: '0.02em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background .15s, transform .12s',
        boxShadow: disabled ? 'none' : '0 14px 32px -14px rgba(26,20,16,0.4)',
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = '#2a1f18'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
      onMouseLeave={e => { e.currentTarget.style.background = '#1a1410'; e.currentTarget.style.transform = 'none' }}
    >
      {label}
    </button>
  )
}

function ToggleChip({ label, selected, onToggle, wide = false }) {
  return (
    <button
      onClick={onToggle}
      style={{
        gridColumn: wide ? 'span 2' : 'auto',
        textAlign: wide ? 'left' : 'center',
        borderRadius: 14,
        border: selected ? '1.5px solid #ec4899' : '1px solid #f1ebe5',
        background: selected ? '#fdf2f8' : '#ffffff',
        color: selected ? '#9d174d' : '#7a6b5d',
        padding: '13px 16px',
        fontSize: '0.88rem',
        fontWeight: selected ? 600 : 500,
        fontFamily: 'inherit',
        cursor: 'pointer',
        transition: 'all .15s',
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = '#fbcfe8'
          e.currentTarget.style.background = '#faf5ef'
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = '#f1ebe5'
          e.currentTarget.style.background = '#ffffff'
        }
      }}
    >
      {selected && <span style={{ marginRight: 8, color: '#ec4899' }}>✓</span>}
      {label}
    </button>
  )
}

// Globe SVG for Blog / Website (no Simple Icons equivalent)
const GLOBE_PATH = 'M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm7.931 9h-2.764a14.67 14.67 0 0 0-1.792-6.243A8.013 8.013 0 0 1 19.931 11zM12.53 4.027c1.035 1.364 2.427 3.78 2.627 6.973H9.03c.139-2.596.994-5.028 2.451-6.974.172-.01.344-.026.519-.026.179 0 .354.016.53.027zm-3.842.7C7.704 6.618 7.136 8.762 7.03 11H4.069a8.013 8.013 0 0 1 4.619-6.273zM4.069 13h2.974c.136 2.379.665 4.478 1.556 6.23A8.01 8.01 0 0 1 4.069 13zm7.381 6.973C9.956 18.773 9.03 16.456 8.973 13h6.043c-.119 2.999-1.207 5.196-2.309 6.478a8.934 8.934 0 0 1-.787.048 8.96 8.96 0 0 1-.47-.053zm3.209-.424c.857-1.754 1.371-3.845 1.49-6.549h2.975a8.011 8.011 0 0 1-4.465 6.549z'

function SocialPlatformChip({ label, color, slug, selected, onToggle }) {
  // Simple Icons CDN: colored when selected, neutral grey when not
  const iconColor = selected ? color.replace('#', '') : 'c4b8ae'
  const cdnUrl = slug ? `https://cdn.simpleicons.org/${slug}/${iconColor}` : null

  return (
    <button
      onClick={onToggle}
      style={{
        position: 'relative',
        borderRadius: 16,
        border: selected ? '1.5px solid #ec4899' : '1px solid #f1ebe5',
        background: selected ? '#fdf2f8' : '#ffffff',
        padding: '18px 12px 14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        transition: 'all .15s',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = '#fbcfe8'
          e.currentTarget.style.background = '#faf5ef'
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = '#f1ebe5'
          e.currentTarget.style.background = '#ffffff'
        }
      }}
    >
      {selected && (
        <span style={{
          position: 'absolute', top: 8, right: 10,
          fontSize: '0.65rem', fontWeight: 700, color: '#ec4899',
        }}>✓</span>
      )}
      <div style={{
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: selected ? color + '18' : '#f5ede5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background .15s',
        flexShrink: 0,
      }}>
        {cdnUrl ? (
          <img
            src={cdnUrl}
            alt={label}
            width={22}
            height={22}
            style={{ display: 'block', flexShrink: 0 }}
          />
        ) : (
          <svg viewBox="0 0 24 24" width={22} height={22} fill={selected ? color : '#c4b8ae'}>
            <path d={GLOBE_PATH} />
          </svg>
        )}
      </div>
      <span style={{
        fontSize: '0.8rem',
        fontWeight: selected ? 600 : 500,
        color: selected ? '#9d174d' : '#7a6b5d',
        textAlign: 'center',
        lineHeight: 1.2,
        transition: 'color .15s',
      }}>
        {label}
      </span>
    </button>
  )
}

function stepTitle(step) {
  return {
    1: 'Connect your Amazon account',
    2: 'What categories do you sell in?',
    3: 'Where are you active?',
    4: 'What are your main goals?',
    5: 'Connect Meta Ads',
    6: 'Upload your earnings history',
  }[step]
}

function stepSubtitle(step) {
  return {
    1: 'Enter your store name and Amazon Creator ID so we can build your personalized campaign links.',
    2: "Select all that apply — we'll filter campaigns to match.",
    3: 'Which social platforms do you use to promote products?',
    4: 'Select everything that matters to you.',
    5: 'Optional — lets us show ad spend vs. earnings on your dashboard. You can always add this later in Settings.',
    6: "Optional — shows an 'Already Earning' strip at the top of your dashboard. You can do this later in Settings.",
  }[step]
}
