import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function UnauthorizedPage() {
  const navigate = useNavigate()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-brand-50 flex flex-col items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-md text-center">
        <div className="mb-4 text-5xl">🔒</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Access Not Yet Enabled</h2>
        <p className="text-gray-500 text-sm leading-relaxed mb-8">
          Your account hasn't been approved yet. Please contact us and we'll get you set up.
        </p>
        <a
          href="mailto:hello@paisleyandsparrow.com"
          className="inline-block bg-brand-700 hover:bg-brand-800 text-white font-medium px-6 py-3 rounded-xl text-sm transition-colors mb-4"
        >
          Contact Us
        </a>
        <div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-400 hover:text-gray-600 underline transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
