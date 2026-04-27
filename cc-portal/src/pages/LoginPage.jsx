import { supabase } from '../lib/supabase'

export default function LoginPage() {
  async function handleGoogleSignIn() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
  }

  return (
    <div className="min-h-screen bg-brand-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md text-center">
        {/* Logo / brand */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-brand-800 tracking-tight">
            Paisley & Sparrow
          </h1>
          <p className="text-sm text-gray-400 mt-1 uppercase tracking-widest">
            Campaign Portal
          </p>
        </div>

        <p className="text-gray-600 mb-8 text-sm leading-relaxed">
          Sign in to view your Creator Connections campaigns, commission data, and performance insights.
        </p>

        <button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl px-5 py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
        >
          <GoogleIcon />
          Sign in with Google
        </button>

        <p className="text-xs text-gray-400 mt-6">
          Access is by invitation only. Contact us if you need access.
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z" />
      <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z" />
      <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z" />
      <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z" />
    </svg>
  )
}
