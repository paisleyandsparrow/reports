import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import PublicLayout from '../components/PublicLayout'

export default function PricingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const cancelled = new URLSearchParams(location.search).get('checkout') === 'cancelled'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isPaid, setIsPaid] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [trialEndsAt, setTrialEndsAt] = useState(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { navigate('/login'); return }
      const { data } = await supabase
        .from('user_preferences')
        .select('is_paid, subscription_status, trial_ends_at')
        .eq('id', user.id)
        .single()
      if (data) {
        setIsPaid(data.is_paid)
        // Derive status same as Settings — trial users have no subscription_status yet
        const effective = data.subscription_status
          || (data.trial_ends_at && !data.is_paid && new Date(data.trial_ends_at) > new Date()
              ? 'trialing'
              : data.subscription_status)
        setSubscriptionStatus(effective)
        setTrialEndsAt(data.trial_ends_at)
      }
      setChecking(false)
    })
  }, [])

  async function handleCheckout() {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await supabase.functions.invoke('create-checkout', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.error) throw new Error(res.error.message)
      window.location.href = res.data.url
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  return (
    <PublicLayout>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px',
        fontFamily: 'Inter, sans-serif',
      }}>
      {/* Card */}
      <div style={{
        background: '#fff',
        border: '1px solid #f1ebe5',
        borderRadius: 24,
        padding: '40px 36px',
        maxWidth: 420,
        width: '100%',
        boxShadow: '0 4px 24px rgba(26,20,16,0.06)',
      }}>
        {checking ? (
          <p style={{ textAlign: 'center', color: '#a89485', fontSize: '0.9rem' }}>Loading…</p>
        ) : isPaid || subscriptionStatus === 'active' ? (
          <ActiveSubscription
            status={subscriptionStatus}
            trialDaysLeft={trialDaysLeft}
            onGoToDashboard={() => navigate('/dashboard')}
          />
        ) : (
          <CheckoutView
            loading={loading}
            error={error}
            cancelled={cancelled}
            inTrial={subscriptionStatus === 'trialing'}
            trialDaysLeft={trialDaysLeft}
            onCheckout={handleCheckout}
            onBack={() => navigate(-1)}
          />
        )}
      </div>
      </div>
    </PublicLayout>
  )
}

function CheckoutView({ loading, error, cancelled, inTrial, trialDaysLeft, onCheckout, onBack }) {
  return (
    <>
      {cancelled && (
        <div style={{
          background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10,
          padding: '10px 14px', marginBottom: 20, fontSize: '0.8rem', color: '#92400e',
        }}>
          Checkout was cancelled — no charge was made.
        </div>
      )}

      {inTrial && trialDaysLeft !== null && (
        <div style={{
          background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10,
          padding: '10px 14px', marginBottom: 20, fontSize: '0.8rem', color: '#92400e',
        }}>
          You have <strong>{trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'}</strong> left in your free trial. Subscribe now to keep access after it ends.
        </div>
      )}

      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1a1410', marginBottom: 6 }}>
        Creator Coders Pro
      </h1>
      <p style={{ fontSize: '0.85rem', color: '#a89485', marginBottom: 28, lineHeight: 1.6 }}>
        Automatically accept Amazon Creator Connections campaigns based on your rules — while you sleep.
      </p>

      {/* Price display */}
      <div style={{
        background: '#fbf7f3', borderRadius: 14, padding: '20px 20px',
        marginBottom: 28, display: 'flex', alignItems: 'baseline', gap: 6,
      }}>
        <span style={{ fontSize: '2.4rem', fontWeight: 800, color: '#1a1410' }}>$100</span>
        <span style={{ fontSize: '0.9rem', color: '#a89485' }}>/month</span>
        {!inTrial && (
          <span style={{
            marginLeft: 'auto', background: '#f0fdf4', color: '#166534',
            fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px',
            borderRadius: 999, border: '1px solid #bbf7d0',
          }}>
            7-day free trial
          </span>
        )}
      </div>

      {/* Feature list */}
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          'Automatic campaign acceptance based on your rules',
          'Daily cap & per-run limit controls',
          'Real-time queue visibility in the browser extension',
          'Hourly runs while you\'re away',
          'Email summary after each run',
        ].map(f => (
          <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.83rem', color: '#4a3728' }}>
            <span style={{ color: '#ec4899', fontWeight: 700, flexShrink: 0 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>

      {error && (
        <p style={{ color: '#9f1239', fontSize: '0.78rem', marginBottom: 14, textAlign: 'center' }}>{error}</p>
      )}

      <button
        onClick={onCheckout}
        disabled={loading}
        style={{
          width: '100%', background: loading ? '#d4c5b3' : '#1a1410',
          color: '#fff', border: 'none', borderRadius: 999,
          padding: '14px 20px', fontSize: '0.95rem', fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          marginBottom: 12, transition: 'background 0.15s',
        }}
      >
        {loading ? 'Redirecting to checkout…' : inTrial ? 'Subscribe now →' : 'Start 7-day free trial →'}
      </button>

      <p style={{ fontSize: '0.72rem', color: '#a89485', textAlign: 'center', lineHeight: 1.5 }}>
        {inTrial ? 'Cancel anytime. Billed monthly.' : 'No charge for 7 days. Cancel anytime. Card required to start trial.'}
      </p>

      <button
        onClick={onBack}
        style={{
          display: 'block', margin: '16px auto 0', background: 'none', border: 'none',
          color: '#a89485', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
          textDecoration: 'underline',
        }}
      >
        ← Back
      </button>
    </>
  )
}

function ActiveSubscription({ status, trialDaysLeft, onGoToDashboard }) {
  const isTrialing = status === 'trialing'
  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✓</div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1a1410', marginBottom: 6 }}>
          {isTrialing ? 'Free trial active' : 'Creator Coders Pro'}
        </h2>
        <p style={{ fontSize: '0.83rem', color: '#a89485', lineHeight: 1.6 }}>
          {isTrialing && trialDaysLeft !== null
            ? `${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} remaining in your free trial.`
            : status === 'active'
            ? 'Your subscription is active.'
            : `Subscription status: ${status}`}
        </p>
      </div>
      <button
        onClick={onGoToDashboard}
        style={{
          width: '100%', background: '#1a1410', color: '#fff', border: 'none',
          borderRadius: 999, padding: '14px 20px', fontSize: '0.95rem', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Go to Dashboard →
      </button>
    </>
  )
}
