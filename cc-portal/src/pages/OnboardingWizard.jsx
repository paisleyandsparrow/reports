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

const SOCIAL_PLATFORMS = [
  { label: 'Instagram', icon: '📸' },
  { label: 'TikTok', icon: '🎵' },
  { label: 'YouTube', icon: '▶️' },
  { label: 'Pinterest', icon: '📌' },
  { label: 'Facebook', icon: '👥' },
  { label: 'Blog / Website', icon: '✍️' },
]

const GOALS = [
  'Drive more sales',
  'Discover new products to promote',
  'Maximize commission earnings',
  'Grow my audience',
]

const TOTAL_STEPS = 5

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
    creator_id: '',
    categories: [],
    social_platforms: [],
    goals: [],
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
    if (step === 1) return form.store_name.trim().length > 0 && form.creator_id.trim().startsWith('amzn1.creator.')
    if (step === 2) return form.categories.length > 0
    if (step === 3) return form.social_platforms.length > 0
    if (step === 4) return form.goals.length > 0
    if (step === 5) return true
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

    await supabase.from('user_preferences').upsert({
      id: session.user.id,
      email: session.user.email,
      store_name: form.store_name.trim(),
      creator_id: form.creator_id.trim(),
      categories: form.categories,
      social_platforms: form.social_platforms,
      goals: form.goals,
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    })

    if (csvState.rows.length > 0) {
      const rowsWithUser = csvState.rows.map(r => ({ ...r, user_id: session.user.id }))
      const BATCH = 500
      for (let i = 0; i < rowsWithUser.length; i += BATCH) {
        await supabase.from('creator_connections_revenue')
          .upsert(rowsWithUser.slice(i, i + BATCH), { onConflict: 'user_id,date,campaign_title,asin' })
      }
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
            {SOCIAL_PLATFORMS.map(({ label, icon }) => (
              <ToggleChip
                key={label}
                label={`${icon} ${label}`}
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
              {step === TOTAL_STEPS && csvState.status !== 'ready' && (
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

function stepTitle(step) {
  return {
    1: 'Connect your Amazon account',
    2: 'What categories do you sell in?',
    3: 'Where are you active?',
    4: 'What are your main goals?',
    5: 'Upload your earnings history',
  }[step]
}

function stepSubtitle(step) {
  return {
    1: 'Enter your store name and Amazon Creator ID so we can build your personalized campaign links.',
    2: "Select all that apply — we'll filter campaigns to match.",
    3: 'Which social platforms do you use to promote products?',
    4: 'Select everything that matters to you.',
    5: "Optional — shows an 'Already Earning' strip at the top of your dashboard. You can do this later in Settings.",
  }[step]
}
