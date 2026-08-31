/**
 * LandingPage — unauthenticated entry point.
 *
 * AUTH-01: Provides the "Continue with Google" button that calls signInWithGoogle
 * (signInWithRedirect). The browser will navigate away to the Google OAuth flow;
 * after the redirect returns, useAuth calls completeRedirect() to capture the result
 * and App.tsx automatically redirects the now-authenticated user to /home.
 */
import { useState } from 'react'
import { signInWithGoogle } from '../services/auth'

export default function LandingPage() {
  const [loading, setLoading] = useState(false)

  async function handleSignIn() {
    setLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      console.error('[LandingPage] signInWithGoogle error:', err)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-16 pt-24 text-center">
        {/* App mark */}
        <div className="mb-8 h-20 w-20 rounded-3xl bg-purple-500 flex items-center justify-center shadow-xl shadow-purple-200">
          <svg width="36" height="36" fill="none" viewBox="0 0 24 24">
            <path d="M12 21C12 21 4 13.5 4 8.5a8 8 0 0116 0C20 13.5 12 21 12 21z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
            <circle cx="12" cy="8.5" r="2.5" fill="white"/>
          </svg>
        </div>

        <h1 className="text-4xl font-bold tracking-tight text-gray-900">birds.eye</h1>
        <p className="mt-3 text-base text-gray-400 max-w-xs leading-relaxed">
          Share what reminded you of them today. See it together once you both share.
        </p>

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="mt-12 flex w-full max-w-xs items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-4 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {loading ? (
            <div className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
          )}
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>
      </div>

      <p className="pb-10 text-center text-xs text-gray-300">Just the two of you. Always private.</p>
    </div>
  )
}
