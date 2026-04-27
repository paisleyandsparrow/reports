import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * Wraps protected routes.
 * - No session → /login
 * - Session but email not in allowed_emails → /unauthorized
 * - requireOnboarding=true and not onboarded → /onboarding
 * - All good → renders children
 */
export default function AuthGuard({ children, requireOnboarding = true }) {
  const [status, setStatus] = useState('loading') // loading | allowed | unauthorized | unauthenticated | needs-onboarding

  useEffect(() => {
    let mounted = true

    async function check() {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        if (mounted) setStatus('unauthenticated')
        return
      }

      const email = session.user.email

      // Check allowlist
      const { data: allowed } = await supabase
        .from('allowed_emails')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (!allowed) {
        if (mounted) setStatus('unauthorized')
        return
      }

      if (!requireOnboarding) {
        if (mounted) setStatus('allowed')
        return
      }

      // Check onboarding
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('onboarding_complete')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!prefs?.onboarding_complete) {
        if (mounted) setStatus('needs-onboarding')
        return
      }

      if (mounted) setStatus('allowed')
    }

    check()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      check()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [requireOnboarding])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-brand-50 flex items-center justify-center">
        <div className="text-brand-700 text-sm animate-pulse">Loading…</div>
      </div>
    )
  }

  if (status === 'unauthenticated') return <Navigate to="/login" replace />
  if (status === 'unauthorized') return <Navigate to="/unauthorized" replace />
  if (status === 'needs-onboarding') return <Navigate to="/onboarding" replace />

  return children
}
