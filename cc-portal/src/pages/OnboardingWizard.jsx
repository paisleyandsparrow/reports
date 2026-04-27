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
    if (step === 5) return true // CSV upload is optional
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
    <div className="min-h-screen bg-brand-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-lg">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-brand-600 uppercase tracking-widest mb-1">
            Step {step} of {TOTAL_STEPS}
          </p>
          <div className="w-full bg-brand-100 rounded-full h-1.5 mb-5">
            <div
              className="bg-brand-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
          <h2 className="text-xl font-bold text-gray-800">{stepTitle(step)}</h2>
          <p className="text-sm text-gray-500 mt-1">{stepSubtitle(step)}</p>
        </div>

        {/* Step content */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Channel / Store Name</label>
              <input
                type="text"
                placeholder="e.g. Paisley & Sparrow"
                value={form.store_name}
                onChange={e => setForm(prev => ({ ...prev, store_name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Amazon Creator ID</label>
              <input
                type="text"
                placeholder="amzn1.creator.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={form.creator_id}
                onChange={e => setForm(prev => ({ ...prev, creator_id: e.target.value.trim() }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              <p className="text-xs text-gray-400 mt-2">
                Find this in your Amazon Associates account under Creator Connections → Settings. It starts with <span className="font-mono">amzn1.creator.</span>
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="flex flex-col gap-3">
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
          <div className="flex flex-col gap-4">
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
              <p className="text-xs text-amber-600">⚠ {csvState.errors.length} rows skipped due to parse errors.</p>
            )}

            <p className="text-xs text-gray-400 text-center">
              To get this file: Amazon Associates → Creator Connections → Earnings → Download CSV.
              You can also skip this and upload later in Settings.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}

          {step < TOTAL_STEPS ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance()}
              className="bg-brand-700 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-colors"
            >
              Next →
            </button>
          ) : (
            <div className="flex items-center gap-3">
              {step === TOTAL_STEPS && csvState.status !== 'ready' && (
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'Skip for now'}
                </button>
              )}
              <button
                onClick={handleFinish}
                disabled={saving}
                className="bg-brand-700 hover:bg-brand-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-xl text-sm transition-colors"
              >
                {saving ? 'Saving…' : csvState.status === 'ready' ? 'Upload & Get Started →' : 'Get Started →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ToggleChip({ label, selected, onToggle, wide = false }) {
  return (
    <button
      onClick={onToggle}
      className={`
        ${wide ? 'col-span-2 text-left' : ''}
        rounded-xl border px-4 py-3 text-sm font-medium transition-all
        ${selected
          ? 'border-brand-500 bg-brand-50 text-brand-800'
          : 'border-gray-200 text-gray-600 hover:border-brand-300 hover:bg-brand-50'
        }
      `}
    >
      {selected && <span className="mr-2 text-brand-600">✓</span>}
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
    2: 'Select all that apply — we\'ll filter campaigns to match.',
    3: 'Which social platforms do you use to promote products?',
    4: 'Select everything that matters to you.',
    5: 'Optional — shows an \'Already Earning\' strip at the top of your dashboard. You can do this later in Settings.',
  }[step]
}
